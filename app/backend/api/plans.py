"""F1 계획서 업로드. 지금은 파일 → 텍스트까지만 한다. LLM 구조화(Task JSON)는 llm/ 에서 붙인다."""

from fastapi import APIRouter, HTTPException, UploadFile

from parsers import extract_text

router = APIRouter(tags=["plans"])

ALLOWED = {".pdf", ".xlsx", ".hwpx"}


@router.post("/plans")
async def upload_plan(file: UploadFile) -> dict:
    name = file.filename or ""
    suffix = name[name.rfind(".") :].lower() if "." in name else ""
    if suffix not in ALLOWED:
        raise HTTPException(400, f"지원 형식: {', '.join(sorted(ALLOWED))} (구형 HWP는 HWPX로 저장해 올린다)")
    data = await file.read()
    text = extract_text(name, data)
    # TODO(F1): llm.get_provider() 로 Task 목록 추출 → 사람이 확인·수정 → 제출 시점에 F2 판정
    return {"file": name, "chars": len(text), "text": text}
