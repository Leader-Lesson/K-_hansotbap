"""F1 계획서 업로드 → 구조화 결과(확인·수정용) → 제출(이 순간 F2 판정)."""

import hashlib

from fastapi import APIRouter, Form, HTTPException, Query, UploadFile

from db.plans import cache_get, cache_put, list_plans, save_plan_document, submit_plan
from llm.extract import ExtractionFailed, Mode, cache_key, extract_plan, is_degraded
from parsers import SUPPORTED, parse_document
from rules.data_loader import load_zones
from schemas import PlanExtraction, PlanRecord, PlanSubmission, PlanSubmitResult
from search.sop_match import match_plan

router = APIRouter(tags=["plans"])


@router.post("/plans", response_model=PlanExtraction)
def upload_plan(
    file: UploadFile,
    contractor: str | None = Form(default=None, description="제출하는 협력사 (문서에 업체명이 없을 때 쓴다)"),
    mode: Mode = Query(default="auto", description="auto: 표 규칙으로 다 읽히면 LLM 생략 / llm: 항상 LLM / rules: 규칙만"),
    refresh: bool = Query(default=False, description="같은 파일의 이전 추출 결과(캐시)를 쓰지 않는다"),
) -> PlanExtraction:
    name = file.filename or ""
    suffix = name[name.rfind(".") :].lower() if "." in name else ""
    if suffix not in SUPPORTED:
        raise HTTPException(400, f"지원 형식: {', '.join(SUPPORTED)} (구형 HWP는 HWPX로 저장해 올린다)")
    data = file.file.read()
    if not data:
        raise HTTPException(400, "빈 파일입니다")

    sha = hashlib.sha256(data).hexdigest()
    key = cache_key(sha, mode, contractor)
    if not refresh and (hit := cache_get(key)):
        return _with_sop(hit.model_copy(update={"cached": True, "file": name}))

    try:
        doc = parse_document(name, data)
    except Exception as e:  # 깨진 파일·암호 걸린 파일 등
        raise HTTPException(422, f"파일을 읽지 못했습니다: {type(e).__name__}: {e}") from e
    if not doc.segments:
        raise HTTPException(422, "글자를 찾지 못했습니다 (스캔 이미지 PDF는 지원하지 않습니다)")

    try:
        result = extract_plan(doc, mode=mode, contractor_hint=contractor)
    except ExtractionFailed as e:
        raise HTTPException(e.status_code, e.message) from e

    result = result.model_copy(update={"draft_id": sha[:16], "file_sha256": sha})
    if not is_degraded(result):
        cache_put(key, result)
    return _with_sop(result)


def _with_sop(result: PlanExtraction) -> PlanExtraction:
    """F8: 원문을 보관하고(제출 판정 때 다시 확인), 작업별 표준서 매칭·필수 단계 확인을 붙인다 (규칙이라 매번 계산)."""
    save_plan_document(result.draft_id, result.file, result.lines)
    matches = match_plan([t.task for t in result.tasks], result.lines, result.file)
    return result.model_copy(update={"sop_matches": matches})


def _check(sub: PlanSubmission) -> list[str]:
    zone_ids = {z.id for z in load_zones()}
    problems: list[str] = []
    seen: set[str] = set()
    for t in sub.tasks:
        label = f"{t.id} {t.name}"
        if t.id in seen:
            problems.append(f"{label}: 작업 ID가 겹칩니다")
        seen.add(t.id)
        if t.zone_id not in zone_ids:
            problems.append(f"{label}: 구역을 골라 주세요 (현재 '{t.zone_id}')")
        if t.start >= t.end:
            problems.append(f"{label}: 종료가 시작보다 늦어야 합니다")
        if not t.contractor.strip():
            problems.append(f"{label}: 업체가 비어 있습니다")
    return problems


@router.post("/plans/submit", response_model=PlanSubmitResult)
def submit(sub: PlanSubmission) -> PlanSubmitResult:
    """사람이 확인·수정한 작업을 제출한다. 제출 순간 현재 일정 전체로 F2 판정을 돌린다 (시스템은 승인·중지하지 않는다)."""
    if problems := _check(sub):
        raise HTTPException(422, {"message": "제출 전에 고칠 곳이 있습니다", "problems": problems})
    return submit_plan(sub)


@router.get("/plans", response_model=list[PlanRecord])
def plans(contractor: str | None = None) -> list[PlanRecord]:
    """제출 이력 (F5 이행 기록의 바탕)."""
    return list_plans(contractor)
