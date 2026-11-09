import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { chunkSizeWarningLimit: 2500 },
  server: {
    port: 5173,
    // npm run dev 하면 화면 시안(public/prototype)을 연다. 팀 React 앱은 그대로 / 에 있다
    open: "/prototype/index.html",
    // 프론트는 표시 전용. /api 요청은 FastAPI(8000)로 넘긴다
    proxy: { "/api": "http://localhost:8000" },
  },
});
