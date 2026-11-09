# F9 위험 시간대 API

- 상태: 반영됨
- 브랜치: `feat/F9-risk-windows`
- 바뀐 곳: `app/backend/schemas.py`의 `RiskWindow`에 `trades`, `peak_grade`, `rule_ids`, `legal_basis`, `sources`, `notice`를 더했습니다. 기존 필드는 그대로입니다.
- 쓰는 곳 / 까닭: 간트의 위험 시간대 띠, 3D 구역 색(시간 슬라이더), 협력사 화면의 공지, TBM 전달 항목.

## API

| 경로 | 메서드 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `/api/risk-windows` | GET | `?contractor=&trade=&zone_id=&on=YYYY-MM-DD&polish=false` | `RiskWindow[]` (시작 시각순) | 협력사는 자기 작업이 걸린 충돌만 집계 |

- 협력사로 볼 때는 `contractor`에 업체명을 넣습니다. 원청은 비워 둡니다.
- 간트처럼 하루를 그리는 화면은 `on`에 그 날짜를 넣습니다. 응답을 그대로 띠로 그리면 됩니다.
- `on` 없이 부르면 연속된 날이 한 건으로 합쳐집니다. 이때는 `start` 날짜부터 `end` 날짜까지 **매일** `start` 시각~`end` 시각을 뜻합니다. `start`에서 `end`까지 이어진 띠로 그리면 밤까지 칠해집니다.
- 색은 `peak_grade`, 진하기는 `score`로 나타낼 수 있습니다. `score`는 금지 3, 조건부 2, 결함 1의 합입니다.
- 위아래 충돌은 위쪽·아래쪽 구역에 각각 한 건씩 나옵니다.
- 판정은 제출 순간에 돌므로 첫 제출 전에는 빈 목록입니다. 제출·조정 응답의 `refresh`로 새로고침할 때 함께 다시 부릅니다.
- `polish=true`면 점수 상위 5건의 `notice`를 LLM으로 다듬습니다. 몇 초 걸릴 수 있어 공지 화면에서만 씁니다.

## `types.ts`에 이렇게 수정해 주세요

```ts
export interface RiskWindow {
  zone_id: string;
  start: string;
  end: string;
  score: number;
  contractors: string[];
  conflict_ids: string[];
  weights_note: string;
  trades: string[]; // 관련 공정
  peak_grade: Grade; // 이 시간대에서 가장 높은 등급
  rule_ids: string[];
  legal_basis: string[];
  sources: SourceRef[];
  notice: string; // 공지 문장
}
```
