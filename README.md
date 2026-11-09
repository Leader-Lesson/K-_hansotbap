# 🍲 한솥밥

고로 개수 협력사 동시작업 간섭 감지·예보 — 팀 세이프루프(SafeLoop), POSCO K-뉴딜 아카데미 해커톤 2026

여러 협력사가 한 현장에 들어오는 대형 정비 공사에서, 제각각인 작업계획서를 AI로 구조화하고 규칙으로 계획 간 충돌을 미리 찾아 원청이 조정하고 협력사에 공유하게 하는 시스템이다. 기준 현장은 포스코 광양 2고로 개수(2026-11-12 ~ 2027-03-23, 132일). **화면과 데이터는 모두 합성 데이터이며 협력사명은 가상이다.**

기획서: [`docs/40_기획서_최종.md`](docs/40_기획서_최종.md)

## 구조

```
app/
  backend/            FastAPI (Python)
    api/              라우터 (/api/health, /zones, /rules, /tasks, /overlaps, /plans)
    parsers/          pdf, xlsx, hwpx → 텍스트 (위치 표식 포함)
    llm/              LLMProvider: Claude | LM Studio
    rules/            F2 판정, F8 누락 판정, F9 점수 (pytest 대상)
    search/           F8 작업표준서 임베딩 인덱스
    stt/              F7 Whisper large-v3-turbo / large-v3
    db/               SQLite
    data/             gy2bf_wbs.csv, zones.csv, conflict_rules.csv, sop/(작업표준서)
    schemas.py        데이터 계약 (프론트 src/types.ts 와 같은 모양)
  frontend/           React + Vite + TypeScript
    src/scene/        three.js 고로 3D·2D 도면
    src/views/        원청 화면, 협력사 화면
    src/components/   시간표형 간트, 판정 패널, 챗봇
  samples/            합성 계획서(HWPX·엑셀·PDF), TBM 녹음
  tests/              pytest
docs/                 기획서, 기술 스택, 작업 분해 (docs/private/ 는 git 제외)
```

## 준비물

- Node.js 24 (`.nvmrc`, npm 11 포함). 24보다 낮으면 `npm run setup` 이 `EBADENGINE` 오류로 멈춘다 (`.npmrc` 의 `engine-strict`). nvm-windows: `nvm install 24 && nvm use 24`
- [uv](https://docs.astral.sh/uv/) (`pip install uv` 또는 `winget install astral-sh.uv`). Python은 `app/backend/.python-version` 에 3.12로 고정돼 있고, 없으면 uv가 자동으로 받는다
- LM Studio(채팅·임베딩)와 Whisper는 팀의 로컬 LLM 전용 노트북에서 API로 받는다. 각자 PC에 설치하지 않는다. `.env` 의 `LMSTUDIO_BASE_URL` 을 그 노트북 주소로 바꾼다

## 실행

```bash
cp .env.example .env      # Windows: copy .env.example .env  → ANTHROPIC_API_KEY 입력
npm run setup             # 커밋 훅 연결 + 루트·프론트 npm ci + 백엔드 uv sync --locked (lock 파일 그대로 설치)
npm run seed              # DB 초기화 + 시연용 제출 이력 2건 (합성 데이터)
npm run dev               # API http://localhost:8000 + 웹 http://localhost:5173
npm test                  # 백엔드 pytest
npm run build             # 프론트 타입 검사·빌드
```

## DB (팀원이 같은 상태를 보는 방법)

DB는 SQLite 파일 하나(`app/backend/hansotbap.db`)이고 **각자 PC에 따로 생긴다.** 파일은 공유하지 않는다 — 바이너리라 merge가 안 되고 누가 최신인지 알 수 없게 된다. 대신 **시드 스크립트를 공유**해서 각자 같은 상태를 다시 만든다.

```bash
npm run seed       # 비우고 시연용 제출 이력을 넣는다 (여러 번 돌려도 결과가 같다)
npm run db:reset   # 비우기만 한다 (시연 직전 "아무도 올리지 않은" 상태)
```

- 기준 일정(작업 37개)은 `data/gy2bf_wbs.csv` 에서 읽으므로 시드할 것이 없다. 시드는 **협력사 제출 이력**만 넣는다
- 시연 핵심 장면(S1)의 배관 계획서는 일부러 넣지 않는다 — 시연 중에 직접 올리는 파일이다
- **스키마를 바꾸면** 커밋 메시지에 `[db]` 를 붙이고 팀에 알린다. 받은 사람은 `npm run db:reset`. (해커톤 범위에서는 마이그레이션을 만들지 않고 비우고 다시 만든다)
- **저장소를 OneDrive·Google Drive·Dropbox 폴더 안에 clone 하지 않는다.** 동기화가 파일 잠금을 깨서 SQLite가 깨진다. `C:\Dev\` 같은 로컬 경로에 둔다
- 통합 테스트 때 백엔드 한 대를 같이 쓰려면: `uv run uvicorn main:app --host 0.0.0.0 --port 8000` + `config.py` 의 `cors_origins` 에 팀원 주소 추가. 개발 중에는 각자 로컬로 띄우는 게 안전하다 (그 PC가 꺼지면 전원이 멈추고, 동시에 올리면 서로 덮어쓴다)

`npm run setup` 은 lock 파일을 고치지 않는다. 라이브러리를 추가할 때만 `npm --prefix app/frontend install <패키지>` 또는 `cd app/backend && uv add <패키지>` 를 쓰고, 바뀐 lock 파일(`package-lock.json`·`uv.lock`)을 같은 커밋에 넣는다.

API 문서: http://localhost:8000/docs

shadcn/ui(radix, Nova 프리셋)는 초기화돼 있고 기본 컴포넌트 20개가 `app/frontend/src/components/ui/` 에 있다. 더 필요하면 `cd app/frontend && npx shadcn@latest add <이름>` 으로 추가하고 `package-lock.json` 을 같은 커밋에 넣는다. 툴팁을 쓰려면 앱을 `TooltipProvider` 로 감싼다.

## 협업 규칙 (기획서 9장)

- `main` 은 항상 시연 가능한 상태. 기능 번호로 브랜치: `feat/F1-extract`, `feat/F2-rules` …
- 커밋: `[F2] 위아래 충돌 규칙 추가` 처럼 기능 번호를 앞에
- PR은 작게 자주, 다른 개발자 1명 확인 후 merge (리뷰 30분 안에). 기능별 이슈를 PR에 연결
- 커밋·PR·이슈에 AI 도구 서명(Co-Authored-By 등)을 넣지 않는다. `npm run setup` 이 커밋 훅(`.githooks/commit-msg`)을 연결해 자동으로 지운다
- API 키는 `.env` 에만. `.env` 는 커밋하지 않는다
- 판정은 규칙(`rules/`), LLM은 추출·설명·문장만. 모든 판정에 규칙 ID·법 조문·원문 문장을 붙인다
