# F5 계획서 제출 응답을 공유 범위로 제한

- 상태: 미반영
- 브랜치: `feat/F5-submit-scope`
- 바뀐 곳: `POST /api/plans/submit` 응답의 `conflicts`, `diff`가 제출한 협력사에게 공유된 충돌만 담습니다. `PlanSubmitResult`의 필드 이름과 타입은 그대로이고, `types.ts` 타입 변경은 없습니다. 설명 주석만 바뀝니다.
- 쓰는 곳 / 까닭: `App.tsx`의 제출 완료 안내 문구. 원청이 확인하기 전에는 협력사에게 충돌이 내려가지 않으므로, 제출 직후 응답은 대부분 빈 목록입니다. 지금 문구대로면 충돌이 있어도 "현재 충돌 0건 · 새로 생긴 충돌 없음"으로 표시되어 위험이 없다고 오해할 수 있습니다.

## 동작이 바뀌는 것

- 협력사가 제출한 직후 응답의 `conflicts`는 이미 공유받은 충돌만 담습니다. 보통 `[]`입니다. `null`은 오지 않습니다.
- `diff.introduced`, `diff.resolved`, `diff.grade_changed`도 공유받은 충돌만 담습니다.
- 전체 판정 결과는 원청이 `GET /api/conflicts`(contractor 없이)로 봅니다. 저장은 전과 같이 제출 순간에 됩니다.
- `contractor`가 빈 문자열이면 422입니다.
- `sources`에서 다른 업체 계획서의 원문 문장이 빠집니다. 표준서 근거는 남습니다.

## API

| 경로 | 메서드 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `/api/plans/submit` | POST | 본문 `PlanSubmission` (변경 없음) | `PlanSubmitResult` (모양 변경 없음) | 응답 범위는 본문 `contractor` 기준 |

## 반영해 주세요

`types.ts`의 `PlanSubmitResult` 주석만 바꿉니다.

```ts
// PlanSubmitResult
//   conflicts: Conflict[];        // 제출한 협력사에게 공유된 현재 충돌
//   diff: ConflictDiff | null;    // 이 제출로 달라진 충돌 중 제출한 협력사에게 공유된 것
```

`App.tsx` `onSubmitted`의 안내 문구를 아래처럼 바꿉니다(빈 문자열은 `.filter(Boolean)`이 뺍니다).

```ts
"충돌 판정 결과는 원청 확인 후 공유됩니다",
r.conflicts.length ? `이미 공유된 충돌 ${r.conflicts.length}건` : "",
intro.length ? `새로 생긴 공유 충돌 ${intro.length}건: ${intro.map((c) => `${c.id} (${c.grade})`).join(", ")}` : "",
gone.length ? `해소된 공유 충돌 ${gone.length}건: ${gone.map((c) => c.id).join(", ")}` : "",
```

권장: 역할을 바꿀 때 안내가 남지 않도록 `changeRole`에서 `setNotice(null);`을 호출해 주세요. 지금은 협력사 제출 안내가 원청 화면 위에 그대로 남습니다.

새 충돌 안내: 제출 응답의 `diff`가 좁아져서 이 안내가 원청 화면에도 더는 나오지 않습니다. 전체 충돌 목록은 `GET /api/conflicts`로 그대로 보입니다. 원청 화면에서는 "최근 제출" 필터로 새 제출의 충돌을 먼저 보여 주세요. 이번 제출로 새로 생긴 충돌만 구분하는 값은 백엔드에 아직 없으며, 필요하면 알려 주세요.

선택: `ContractorView.tsx`의 빈 목록 문구를 "원청이 공유한 충돌이 없습니다. 원청 확인 전인 충돌은 여기에 나오지 않습니다."로 바꾸면 오해가 줄어듭니다.
