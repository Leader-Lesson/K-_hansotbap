# scene3d — 고로 3D·충돌 화면 (F3)

three.js(npm `three`) 화면. Vite가 React 앱과 함께 빌드하는 두 번째 페이지다(`vite.config.ts`의 `build.rollupOptions.input`, 주소 `/scene3d/index.html`). 화면에 "합성 데이터" 표시.

- **단독 실행**(`npm run dev` 후 `http://localhost:5173/scene3d/index.html`): `src/api.ts`가 백엔드(`/api`)의 작업·서버 판정(R01~R30)·금지 판정 출입 제한을 불러와 그린다. React 앱과 같은 API 클라이언트(`src/api/client.ts`)·데이터 계약(`src/types.ts`)을 쓰고, 경계 타입은 `src/adapter.d.ts`. 보는 사람을 협력사로 바꾸면 그 업체 범위로 서버에서 다시 받고(주소 `?role=`), 10초마다 바뀐 판정을 반영한다. `?date=YYYY-MM-DD`가 없으면 가장 최근 제출 업체의 가장 높은 등급 충돌이 있는 날로 연다. `?source=sample`이거나 서버가 꺼져 있으면 합성 시안 데이터(`src/data.js`)
- **삽입**(`?embed=1`): React 앱(`src/views/Scene3DTab.tsx`)과 시안이 iframe으로 띄운 뒤 `postMessage`로 데이터·역할을 넘긴다 (서버를 직접 부르지 않는다)
- 3D 본체는 JS(ES 모듈)이고 서버 경계(`api.ts`, `adapter.d.ts`)만 TS다. 파일을 직접 열면 동작하지 않으니 `npm run dev`로 연다

## 기능
- 고로 12구역 3D(구조물·배관·장비·작업자·시간대 조명), 층 펼치기, 2D 도면 전환, 시간 슬라이더(그날 07:00~19:00, 주간 작업만 · 야간조 없음)
- 왼쪽: 받은 작업을 위치별로 자동 정렬(작업 없는 구역 숨김, 단 출입 제한 구역은 표시). 구역마다 한 줄(구역명 · 작업 n건 · 등급 점)만, 작업 줄은 고른 구역만 펼침 / 오른쪽: 지금 할 조치·걸린 위험·위치별 안전 안내
- 걸린 위험: 등급별 묶음(금지 → 조건부 → 결함, 5건 넘으면 묶음째 접기) + 카드 한 줄 요약(유형 · 작업 둘 · 시간) → 펼치면 업체·구역·이유·조정 방향·자세히(법 근거·규칙·원문). 금지는 기본 펼침
- 출입 제한(`barrierList(t)`, 안전띠·표지와 같은 목록)이 걸린 구역은 3D 구역 배너(`banners.setBarriers`)와 왼쪽 목록에 빨간 「북·동 출입 금지 · HH:MM까지」 꼬리표 — 권한과 무관하게 모두에게 보임
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

주소: `index.html?embed=1&date=2027-02-20&now=2027-02-20T14:30`

## 구역 매핑 (`src/adapter.js`)
TOP→노정 · STACK→노흉 내부 · BELLY_BOSH→노복·조안 내부 · TUYERE→풍구층 외부 · HEARTH→노저 · SHELL→철피 외부(중부) · CASTHOUSE/SLAG→주상 · DOWNCOMER/GCP→가스 설비 · STOVE→열풍로 · CRANE_PAD/YARD/ALL→3D 구역 없음

## 알아 둘 점
- `Task`에 인원 필드가 없어 「인원 미기재」로 표시, 3D 작업자는 작업당 기본 인원
- 크기 기준 [팀 설정값]: 사람은 고로 높이의 1/30로 과장, 장비·구조물·배관은 실제 크기
- 금지 판정의 조정 대안 카드(`src/alternatives.js`)는 단독 실행용 예시 데이터에만 연결됨 — F4 조정안 API가 생기면 같은 모양으로 연결
- 단독 실행(데이터 없이 열면 내장 예시 데이터): `index.html`을 정적 서버로 열기
