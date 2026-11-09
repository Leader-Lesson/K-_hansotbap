import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 2500,
    // 3D(scene3d)는 시작할 때 서버 데이터를 기다린다(top-level await) → ES2022
    target: "es2022",
    // 두 페이지를 함께 빌드한다: React 앱(/) + 고로 3D(/scene3d/index.html, three.js 는 npm 패키지)
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        scene3d: fileURLToPath(new URL("./scene3d/index.html", import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    // npm run dev 하면 서버(FastAPI)에 연결된 React 앱을 연다.
    // 정적 시안(/prototype)은 합성 데이터만 쓰고 서버를 부르지 않는다 — 거기서 올린 계획서는 판정되지 않는다
    open: "/",
    // 프론트는 표시 전용. /api 요청은 FastAPI(8000)로 넘긴다. 8000이 막혀 있으면 API_PORT 로 바꾼다
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 8000}` },
  },
});
