# F4 조정안 API와 재제출 새 충돌 비교

- 상태: 반영됨
- 브랜치: `feat/F4-adjust-api`
- 바뀐 곳: `app/backend/schemas.py`에 `AdjustmentStatus`, `AdjustmentRecord`, `AdjustmentApply`, `AdjustmentResult`를 더했고, `AdjustmentCandidate`에 `recommended`, `PlanSubmitResult`에 `diff`, `recheck_ms`를 더했습니다. 앞 요청 `20261109-F4-adjustment-models.md`의 타입이 먼저 필요합니다.
- 쓰는 곳 / 까닭: 충돌 상세의 조정안 카드와 [조정 적용], 적용 결과의 "사라짐 / 새로 생김", [되돌리기], 계획서 제출 뒤 새 충돌 알림, 이력(F5)의 조정 기록.

## API

협력사로 볼 때는 `contractor`에 업체명을 넣습니다. 원청은 비워 둡니다. 충돌 ID에는 `:`와 `>`가 들어가므로 경로에 넣을 때 `encodeURIComponent`를 씁니다.

| 경로 | 메서드 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `/api/conflicts/{conflict_id}/adjustments` | GET | `?polish=false` | `AdjustmentCandidate[]` (추천 안이 맨 앞) | 원청만. 협력사는 403 |
| `/api/adjustments` | POST | 본문 `AdjustmentApply` | `AdjustmentResult` | 원청만. 협력사는 403 |
| `/api/adjustments/{adjustment_id}` | DELETE | `?decided_by=되돌린 사람` (필수) | `AdjustmentResult` | 원청만. 협력사는 403 |
| `/api/adjustments` | GET | `?contractor=&task_id=` | `AdjustmentRecord[]` | 협력사는 자기 업체 작업의 기록만 |

- 오류: 없는 충돌·조정은 404, 일정이 바뀌어 고른 후보가 무효이거나 이미 되돌린 조정은 409, 책임자 이름이 비어 있으면 422입니다. 409가 오면 후보를 다시 조회합니다.
- 같은 작업을 다시 조정하면 앞 조정은 `reverted`로 닫힙니다. 뒤 조정을 되돌리면 앞 조정이 아니라 협력사 원본 일정으로 돌아갑니다.
- 전 구역 묶음(`…>ALL`), 혼재(R30), 표준서 결함은 후보가 빈 목록으로 옵니다. 위치를 정해 재제출할 일이라 [조정 적용] 대신 안내를 보여 주면 됩니다.
- 후보 계산은 충돌 한 건에 1~2초 걸릴 수 있습니다. 목록 전체에 미리 부르지 말고 충돌을 열 때 부릅니다.
- 적용·되돌리기 응답의 `refresh`가 `true`이면 화면을 한 번 새로고침합니다.
- `GET /api/tasks`의 일정에는 적용 중인 조정이 얹혀 있습니다.

## `types.ts`에 이렇게 추가·수정해 주세요

```ts
export type AdjustmentStatus = "active" | "reverted" | "stale";

// AdjustmentCandidate 에 필드 하나 추가
//   recommended: boolean; // 후보 중 새 충돌·영향 받는 후행 작업이 가장 적은 안

export interface AdjustmentRecord {
  adjustment: Adjustment;
  status: AdjustmentStatus;
  closed_at: string | null; // 되돌렸거나 무효가 된 시각
}

export interface AdjustmentApply {
  conflict_id: string;
  candidate_id: string;
  decided_by: string; // 적용한 책임자
}

export interface AdjustmentResult {
  record: AdjustmentRecord;
  conflicts: Conflict[]; // 재판정 결과
  diff: ConflictDiff;
  recheck_ms: number;
  refresh: boolean;
}

// PlanSubmitResult 에 필드 두 개 추가
//   diff: ConflictDiff | null; // 이 제출로 사라지거나 새로 생긴 충돌 (새 충돌 알림)
//   recheck_ms: number | null;
```
