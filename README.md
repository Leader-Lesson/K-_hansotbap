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
- (선택) LM Studio 로컬 서버, Whisper 모델

## 실행

```bash
cp .env.example .env      # Windows: copy .env.example .env  → ANTHROPIC_API_KEY 입력
npm run setup             # 커밋 훅 연결 + 루트·프론트 npm ci + 백엔드 uv sync --locked (lock 파일 그대로 설치)
npm run dev               # API http://localhost:8000 + 웹 http://localhost:5173
npm test                  # 백엔드 pytest
npm run build             # 프론트 타입 검사·빌드
```

`npm run setup` 은 lock 파일을 고치지 않는다. 라이브러리를 추가할 때만 `npm --prefix app/frontend install <패키지>` 또는 `cd app/backend && uv add <패키지>` 를 쓰고, 바뀐 lock 파일(`package-lock.json`·`uv.lock`)을 같은 커밋에 넣는다.

API 문서: http://localhost:8000/docs

shadcn/ui는 필요한 컴포넌트가 생길 때 `app/frontend` 에서 `npx shadcn@latest init` 후 추가한다.

## 협업 규칙 (기획서 9장)

- `main` 은 항상 시연 가능한 상태. 기능 번호로 브랜치: `feat/F1-extract`, `feat/F2-rules` …
- 커밋: `[F2] 위아래 충돌 규칙 추가` 처럼 기능 번호를 앞에
- PR은 작게 자주, 다른 개발자 1명 확인 후 merge (리뷰 30분 안에). 기능별 이슈를 PR에 연결
- 커밋·PR·이슈에 AI 도구 서명(Co-Authored-By 등)을 넣지 않는다. `npm run setup` 이 커밋 훅(`.githooks/commit-msg`)을 연결해 자동으로 지운다
- API 키는 `.env` 에만. `.env` 는 커밋하지 않는다
- 판정은 규칙(`rules/`), LLM은 추출·설명·문장만. 모든 판정에 규칙 ID·법 조문·원문 문장을 붙인다
