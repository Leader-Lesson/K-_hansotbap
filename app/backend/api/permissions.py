"""역할 확인. 로그인이 없어 `contractor` 쿼리로 협력사를 구분한다(없으면 원청). 프론트 숨김으로 대신하지 않는다."""

from fastapi import HTTPException


def require_prime(contractor: str | None, detail: str) -> None:
    """원청 전용 동작을 협력사로 부르면 막는다."""
    if contractor:
        raise HTTPException(status_code=403, detail=detail)


def require_person(name: str) -> None:
    """이행 기록의 "누가"가 비지 않게 한다."""
    if not name.strip():
        raise HTTPException(status_code=422, detail="책임자 이름이 비어 있습니다")
