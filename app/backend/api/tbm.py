"""F7 TBM 전달 확인: 녹음 → 전사문 → 항목별 전달 여부.

받아쓰기와 확인을 나눴다. CPU판 받아쓰기는 몇 분 걸리므로 LLM이 실패해도 다시 받아쓰지 않게 하고,
음성 서버가 없을 때는 전사문을 직접 넣어 확인할 수 있게 한다.
"""

import logging
import shutil
import tempfile
from datetime import date
from pathlib import Path

import httpx
from fastapi import APIRouter, Form, HTTPException, Query, UploadFile

from api.permissions import require_person, require_prime
from config import settings
from db.tbm import add_notice, build_checklist, list_checks, save_check
from llm.tbm_check import check_delivery
from rules.tbm import verify
from schemas import TbmChecklist, TbmCheckRecord, TbmCheckRequest, TbmNotice, TbmNoticeCreate, TbmTranscript
from stt.whisper import transcribe

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tbm", tags=["tbm"])

_AUDIO_SUFFIXES = {".wav", ".m4a", ".mp3", ".webm", ".ogg"}  # 음성 서버가 ffmpeg로 받는 형식 [팀 설정값]


@router.get("/checklist", response_model=TbmChecklist)
def checklist(
    contractor: str = Query(min_length=1, description="이 업체에 공유된 내용으로만 만든다 (서버에서 거른다)"),
    on: date = Query(description="TBM 날짜"),
) -> TbmChecklist:
    """그 업체·날짜에 TBM에서 전달해야 할 항목."""
    return build_checklist(contractor, on)


@router.post("/notices", response_model=TbmNotice)
def notice(
    req: TbmNoticeCreate,
    contractor: str | None = Query(default=None, description="협력사로 부르면 공지를 추가할 수 없다 (원청은 비워 둔다)"),
) -> TbmNotice:
    """원청이 전달 항목에 공지를 더한다. 같은 문장을 다시 보내면 처음 기록을 돌려준다."""
    require_prime(contractor, "공지는 원청만 추가할 수 있습니다")
    require_person(req.created_by)
    return add_notice(req)


@router.post("/transcribe", response_model=TbmTranscript)
def transcribe_recording(
    file: UploadFile,
    consent: bool = Form(description="참석자 녹음 동의를 받았는가"),
) -> TbmTranscript:
    """녹음을 글로 옮긴다. 원본은 저장하지 않고 받아쓰기가 끝나면 지운다."""
    if not consent:
        raise HTTPException(status_code=422, detail="참석자의 녹음 동의가 필요합니다")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _AUDIO_SUFFIXES:
        raise HTTPException(status_code=422, detail=f"지원하지 않는 녹음 형식입니다: {', '.join(sorted(_AUDIO_SUFFIXES))}")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
    path = Path(tmp.name)
    try:
        text = transcribe(path)
    except RuntimeError as e:  # whisper.py 가 쓴 안내 문구
        raise HTTPException(status_code=503, detail=str(e)) from e
    except httpx.HTTPError as e:
        log.warning("음성 서버 호출 실패 (%s)", type(e).__name__)
        raise HTTPException(
            status_code=503, detail="음성 서버에 연결할 수 없습니다. npm run whisper 로 켜거나 전사문을 직접 넣어 주세요"
        ) from e
    finally:
        path.unlink(missing_ok=True)
    return TbmTranscript(transcript=text, model=settings.whisper_model)


@router.post("/checks", response_model=TbmCheckRecord)
def check(
    req: TbmCheckRequest,
    contractor: str | None = Query(default=None, description="협력사로 부르면 자기 업체만 확인할 수 있다"),
) -> TbmCheckRecord:
    """전사문이 전달 항목을 담았는지 확인해 기록한다. 항목은 서버가 만든다."""
    if contractor and contractor != req.contractor:
        raise HTTPException(status_code=403, detail="다른 업체의 TBM은 확인할 수 없습니다")
    require_person(req.checked_by)

    items = build_checklist(req.contractor, req.date).items
    if not items:
        raise HTTPException(status_code=422, detail="이 업체·날짜에 전달할 항목이 없습니다")
    try:
        judgement, provider, model = check_delivery(items, req.transcript)
    except Exception as e:  # 키 없음·네트워크·제공자 오류 모두. 메시지에 키가 섞일 수 있어 종류만 남긴다
        log.warning("TBM 전달 확인 실패 (%s)", type(e).__name__)
        raise HTTPException(status_code=503, detail="전달 여부를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요") from e

    results = verify(items, judgement.items, req.transcript)
    return save_check(req.contractor, req.date, req.checked_by, req.transcript, results, provider, model)


@router.get("/checks", response_model=list[TbmCheckRecord])
def checks(
    contractor: str | None = Query(default=None, description="협력사로 보면 자기 업체 기록만 (서버에서 거른다)"),
) -> list[TbmCheckRecord]:
    """TBM 전달 확인 기록 (최근순)."""
    return list_checks(contractor)
