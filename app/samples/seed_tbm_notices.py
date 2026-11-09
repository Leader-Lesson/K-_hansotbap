"""F7 시연 준비: 샘플 TBM의 공유 항목 중 조정 외 3건을 원청 공지로 넣는다 (합성 데이터).

    cd app/backend && uv run python ../samples/seed_tbm_notices.py

조정 항목은 S1 조정을 적용하면 서버가 만든다. 정답(mentioned)은 넣지 않는다. 다시 실행해도 중복되지 않는다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from db.tbm import add_notice  # noqa: E402
from schemas import TbmNoticeCreate  # noqa: E402

SAMPLE = Path(__file__).resolve().parent / "tbm" / "TBM_2027-02-26_expected.json"


def main() -> None:
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    for item in sample["shared_items"]:
        if item["kind"] == "conflict_adjustment":
            continue
        notice = add_notice(
            TbmNoticeCreate(
                contractor=sample["contractor"], date=sample["date"], text=item["text"], created_by="합성 데이터 시드"
            )
        )
        print(f"N{notice.id} {notice.contractor} {notice.date}: {notice.text}")


if __name__ == "__main__":
    main()
