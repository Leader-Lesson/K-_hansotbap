#!/usr/bin/env node
// npm run dev:api — FastAPI 개발 서버(app/backend)를 API_PORT(없으면 8000)로 띄운다.
// package.json 에 `--port ${API_PORT:-8000}` 처럼 셸 문법을 쓰면 Windows(npm 이 cmd 로 실행)에서는 글자 그대로 넘어가
// uvicorn 이 "'${API_PORT:-8000}' is not a valid integer" 로 바로 꺼진다. 그래서 포트를 여기(node)에서 읽는다.
// 웹(Vite)의 /api 프록시도 같은 API_PORT 를 본다 (app/frontend/vite.config.ts).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.API_PORT || "8000";
if (!/^\d+$/.test(port)) {
  console.error(`API_PORT 는 숫자여야 합니다 (지금: ${port})`);
  process.exit(2);
}
const backend = fileURLToPath(new URL("../app/backend/", import.meta.url));

const child = spawn("uv", ["run", "uvicorn", "main:app", "--reload", "--port", port], { cwd: backend, stdio: "inherit" });
child.on("error", (e) => {
  console.error(`uv 를 실행하지 못했습니다 (${e.message}). npm run setup 을 먼저 했는지 확인하세요`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
// Ctrl+C·concurrently 종료를 uvicorn 에 넘긴다
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
