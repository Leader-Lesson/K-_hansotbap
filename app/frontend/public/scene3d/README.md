# scene3d — 고로 3D·충돌 화면 (F3)

three.js(r160, `vendor/`에 포함) 정적 화면. React 번들과 따로 `public/scene3d/`에서 서빙되고, `src/views/Scene3DTab.tsx`가 iframe으로 띄운 뒤 `postMessage`로 데이터·역할을 넘긴다. 화면에 "합성 데이터" 표시.

## 기능
- 고로 12구역 3D(구조물·배관·장비·작업자·낮/밤), 층 펼치기, 2D 도면 전환, 시간 슬라이더(그날 07:00~다음 날 07:00)
- 왼쪽: 받은 작업을 위치별로 자동 정렬(작업 없는 구역 숨김) / 오른쪽: 지금 할 조치·충돌 카드·위치별 안전 안내
- 브라우저 규칙 엔진 `src/rules.js`: 같은 시간·구역 / 위아래 / 화기×가스 / 순서 위반(선행 작업 `predecessors` 미완료 착수) — 서버 판정(`conflicts`)을 넘기면 그걸 우선 사용
- 권한: 원청 전체, 협력사는 자기 작업 + 자기 구역에 영향을 주는 작업만(다른 업체 인원 비공개) — **표시용 필터이며 서버 필터를 대신하지 않는다**
- 구역을 고르면 바닥에 위험(빨강)·안전(초록) 영역, 긴급 변경 알림·승인(원청 관리자·관련 협력사 파트장)

## 메시지 규칙 (`source: 'hansotbap' | 'scene3d'`, 같은 출처만)

| 방향 | type | 내용 |
|---|---|---|
| 부모 → scene3d | `data` | `{ tasks, conflicts? }` (types.ts 모양 그대로, `src/adapter.js`가 변환) |
| 부모 → scene3d | `role` | `ViewerRole` (+ `level: 'lead' \| 'worker'`, 기본 lead) |
| 부모 → scene3d | `selectTask` · `time` · `change` | 작업 선택 · 시각 이동 · 긴급 변경 |
| scene3d → 부모 | `ready` · `select{taskId, zoneId}` · `decision{changeId, taskId, decision, by}` | |

주소: `index.html?embed=1&date=2027-02-20&now=2027-02-20T22:30`

## 구역 매핑 (`src/adapter.js`)
TOP→노정 · STACK→노흉 내부 · BELLY_BOSH→노복·조안 내부 · TUYERE→풍구층 외부 · HEARTH→노저 · SHELL→철피 외부(중부) · CASTHOUSE/SLAG→주상 · DOWNCOMER/GCP→가스 설비 · STOVE→열풍로 · CRANE_PAD/YARD/ALL→3D 구역 없음

## 알아 둘 점
- `Task`에 인원 필드가 없어 「인원 미기재」로 표시, 3D 작업자는 작업당 기본 인원
- 크기 기준 [팀 설정값]: 사람은 고로 높이의 1/30로 과장, 장비·구조물·배관은 실제 크기
- 금지 판정의 조정 대안 카드(`src/alternatives.js`)는 단독 실행용 예시 데이터에만 연결됨 — F4 조정안 API가 생기면 같은 모양으로 연결
- 단독 실행(데이터 없이 열면 내장 예시 데이터): `index.html`을 정적 서버로 열기
