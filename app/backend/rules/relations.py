"""두 작업의 공간 관계 (F2 규칙의 '공간 관계' 칸을 구역 데이터로 바꾼다).

작업 데이터에는 좌표·거리가 없고 구역(zones.csv)만 있다. 그래서 규칙의 거리 조건을 구역 관계로 바꿔 본다.
- 'WITHIN 11m' 처럼 거리로 적힌 조건 → 같은 구역 또는 인접 구역 [팀 설정값]
- 'SAME_SYSTEM' → 같은 계통 묶음(노체·가스청정·열풍로) [팀 설정값]
- 'VERTICAL' → 노 내부 수직 공동 안에서 위아래 (zones.csv 수직순서)
- 'ALL'(전 구역) 작업은 어디서든 겹칠 수 있다고 보되, 실제 위치를 모르므로 엔진이 등급을 낮춘다
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from rules.data_loader import load_zones
from rules.overlap import ALL_ZONE, FURNACE_COLUMN
from schemas import Task

# 서로 붙어 있어 거리 조건(11m·작업반경·방사선 관리구역 등)을 함께 받는 구역 [팀 설정값: 고로 배치 일반형 기준]
ADJACENT: frozenset[frozenset[str]] = frozenset(
    frozenset(p)
    for p in [
        ("SHELL", "STACK"),
        ("SHELL", "BELLY_BOSH"),
        ("SHELL", "TUYERE"),
        ("SHELL", "CASTHOUSE"),
        ("SHELL", "CRANE_PAD"),
        ("TUYERE", "CASTHOUSE"),
        ("HEARTH", "CASTHOUSE"),
        ("CASTHOUSE", "SLAG"),
        ("TOP", "DOWNCOMER"),
        ("DOWNCOMER", "GCP"),
        ("CRANE_PAD", "YARD"),
    ]
)

# 같은 계통(배관·가스·설비가 이어진 묶음) [팀 설정값]. 한 구역이 두 계통에 걸칠 수 있다 (노정 = 노체 + 가스)
SYSTEMS: dict[str, frozenset[str]] = {
    "노체": frozenset({"TOP", "STACK", "BELLY_BOSH", "TUYERE", "HEARTH", "SHELL", "CASTHOUSE"}),
    "가스청정": frozenset({"TOP", "DOWNCOMER", "GCP"}),
    "열풍로": frozenset({"STOVE"}),
}


@lru_cache
def _order() -> dict[str, int]:
    return {z.id: z.vertical_order for z in load_zones()}


@lru_cache
def zone_name(zone_id: str) -> str:
    return next((z.name for z in load_zones() if z.id == zone_id), zone_id or "구역 미상")


def systems_of(zone_id: str) -> set[str]:
    return {name for name, zones in SYSTEMS.items() if zone_id in zones}


@dataclass(frozen=True)
class Rel:
    """a 기준으로 본 b 와의 관계. all_zone 은 둘 중 하나가 전 구역 작업일 때."""

    same_zone: bool
    adjacent: bool
    vertical: bool
    a_above: bool
    same_system: bool
    all_zone: bool

    @property
    def concrete(self) -> bool:
        return self.same_zone or self.adjacent or self.vertical or self.same_system

    def label(self, a: Task, b: Task) -> str:
        if self.same_zone:
            return f"같은 구역({zone_name(a.zone_id)})"
        if self.vertical:
            upper, lower = (a, b) if self.a_above else (b, a)
            return f"위아래({zone_name(upper.zone_id)} 위 · {zone_name(lower.zone_id)} 아래)"
        if self.adjacent:
            return f"인접 구역({zone_name(a.zone_id)} · {zone_name(b.zone_id)})"
        if self.same_system:
            common = "·".join(sorted(systems_of(a.zone_id) & systems_of(b.zone_id)))
            return f"같은 계통({common})"
        return "전 구역 작업과 겹침(실제 위치 확인 필요)"


def relate(a: Task, b: Task) -> Rel:
    za, zb = a.zone_id, b.zone_id
    all_zone = ALL_ZONE in (za, zb)
    known = bool(za) and bool(zb) and not all_zone
    same = known and za == zb
    vertical = known and not same and za in FURNACE_COLUMN and zb in FURNACE_COLUMN
    order = _order()
    return Rel(
        same_zone=same,
        adjacent=known and frozenset((za, zb)) in ADJACENT,
        vertical=vertical,
        a_above=vertical and order.get(za, 0) > order.get(zb, 0),
        same_system=known and bool(systems_of(za) & systems_of(zb)),
        all_zone=all_zone,
    )
