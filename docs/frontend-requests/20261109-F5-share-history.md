# F5 협력사 공유와 이행 기록

- 상태: 반영됨
- 브랜치: `feat/F5-share-history`
- 바뀐 곳: `app/backend/schemas.py`에 `ShareRequest`, `SharedTask`, `SharedItem`, `HistoryEventKind`, `HistoryEvent`를 더했고, `ConflictRecord`에 `shared_at`을 더했습니다. `Adjustment` 타입(`20261109-F4-adjustment-models.md`)이 먼저 필요합니다.
- 쓰는 곳 / 까닭: 원청 충돌 목록의 [협력사에 공유], 협력사 화면의 "나와 겹친 충돌"과 공지, 협력사 화면의 일정, 이력 화면과 [내보내기].

## 동작이 바뀌는 것

- 협력사는 **원청이 확인해 공유한 충돌만** 받습니다. `GET /api/conflicts?contractor=`, `GET /api/risk-windows?contractor=`가 공유 전에는 빈 목록을 돌려줍니다.
- 원청이 [조정 적용]을 하면 그 충돌은 함께 공유됩니다. 따로 공유를 부르지 않아도 됩니다.
- 협력사 응답의 `sources`에서 상대 업체 계획서의 원문 문장이 빠집니다.
- 협력사 화면은 `GET /api/tasks`와 `GET /api/overlaps`에 `contractor`를 넣어 불러야 합니다. 지금처럼 빼고 부르면 전 업체 일정이 옵니다. 지금 `App.tsx`가 전체 일정을 `ContractorView`에 넘기고 있어 이 부분을 바꿔야 합니다.

## API

협력사로 볼 때는 `contractor`에 업체명을 넣습니다. 원청은 비워 둡니다.

| 경로 | 메서드 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `/api/shares` | POST | 본문 `ShareRequest` | `ConflictRecord[]` (공유한 건) | 원청만. 협력사는 403 |
| `/api/shares` | GET | `?contractor=` | `SharedItem[]` (최근 공유순) | 협력사는 자기 작업이 걸린 공유만 |
| `/api/tasks` | GET | `?contractor=` | `Task[]` | 협력사는 자기 작업 + 공유된 충돌의 상대 작업 (상대 작업의 `source`는 `null`) |
| `/api/overlaps` | GET | `?contractor=` | `OverlapCandidate[]` | 협력사는 위 작업 중 자기 작업이 낀 쌍만 |
| `/api/history` | GET | `?contractor=` | `HistoryEvent[]` (시각순) | 협력사는 자기 제출과 공유된 자기 충돌의 기록만 |
| `/api/history/export` | GET | `?contractor=` | xlsx 파일 | 조회와 같은 범위 |

- 오류: 없는 충돌은 404, 책임자 이름이 비어 있으면 422입니다.
- 여러 건을 한 번에 공유할 수 있습니다. 이미 공유한 충돌을 다시 보내면 처음 기록이 유지되고 오류는 나지 않습니다.
- `ConflictRecord.shared_at`이 `null`이면 아직 공유 전입니다. 원청 화면에서 공유 여부 표시에 씁니다.
- 내보내기는 `<a href="/api/history/export">`처럼 파일 내려받기로 엽니다.

## `types.ts`에 이렇게 추가·수정해 주세요

```ts
// ConflictRecord 에 필드 하나 추가
//   shared_at: string | null; // 원청이 확인해 협력사에 공유한 시각

export interface ShareRequest {
  conflict_ids: string[];
  shared_by: string; // 확인한 책임자
}

export interface SharedTask {
  id: string;
  contractor: string;
  name: string;
  zone_id: string;
  start: string;
  end: string;
  hazards: Hazard[];
}

export interface SharedItem {
  conflict_id: string;
  type: ConflictType;
  grade: Grade;
  status: ConflictStatus;
  rule_id: string;
  legal_basis: string;
  window_start: string;
  window_end: string;
  reason: string;
  handover: string | null; // 작업 인계 조건
  my_task_ids: string[]; // 이 협력사의 작업 (원청으로 보면 빈 목록)
  adjacent_tasks: SharedTask[]; // 이 충돌에 걸린 다른 작업
  adjustment: Adjustment | null; // 이 충돌에 적용 중인 조정
  shared_by: string;
  shared_at: string;
}

export type HistoryEventKind =
  | "plan_submitted"
  | "conflict_judged"
  | "conflict_shared"
  | "adjustment_replaced"
  | "adjustment_applied"
  | "conflict_resolved"
  | "adjustment_reverted"
  | "adjustment_stale";

export interface HistoryEvent {
  at: string;
  kind: HistoryEventKind;
  target_id: string; // plan-<번호> 또는 충돌 ID
  actor: string | null; // 책임자 (시스템이 남긴 기록은 null)
  contractors: string[];
  detail: string;
  rule_id: string | null;
  legal_basis: string | null;
}
```
