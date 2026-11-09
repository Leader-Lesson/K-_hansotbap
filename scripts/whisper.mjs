#!/usr/bin/env node
// F7 음성인식: 각자 PC에서 whisper.cpp 서버를 준비하고 켠다.  사용: npm run whisper
//
// 1) whisper-server 가 없으면 설치한다 (macOS: brew / Windows·Linux: whisper.cpp 공식 릴리스를 .tools/whisper 에 푼다)
// 2) ffmpeg 가 없으면 설치를 시도한다 (m4a·webm·mp3 → wav 변환용, 없어도 wav 는 받는다)
// 3) 모델 파일이 없으면 ~/models 에 받는다 (.env 의 WHISPER_MODEL: large-v3-turbo 약 550MB / large-v3 약 1GB)
// 4) .env 의 WHISPER_BASE_URL 포트(기본 8090)로 서버를 켜고, 1초 무음을 보내 연결을 확인한다
//
// 옵션: --check  설치·다운로드만 하고 서버는 켜지 않는다
//       --cpu    NVIDIA GPU가 있어도 CPU판을 받는다 (CUDA판이 안 켜질 때 .tools 를 지우고 다시)

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = join(ROOT, ".tools", "whisper");
const MODELS_DIR = process.env.WHISPER_MODELS_DIR || join(homedir(), "models");
const IS_WIN = platform() === "win32";
const IS_MAC = platform() === "darwin";
const CHECK_ONLY = process.argv.includes("--check");
const FORCE_CPU = process.argv.includes("--cpu");

const MODEL_FILES = {
  "large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin",
  "large-v3": "ggml-large-v3-q5_0.bin",
};

const log = (msg) => console.log(`[whisper] ${msg}`);
const fail = (msg) => {
  console.error(`[whisper] 오류: ${msg}`);
  process.exit(1);
};

function readEnv() {
  const env = {};
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function which(cmd) {
  const r = spawnSync(IS_WIN ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

function run(cmd, args) {
  log(`실행: ${cmd} ${args.join(" ")}`);
  return spawnSync(cmd, args, { stdio: "inherit", shell: IS_WIN }).status === 0;
}

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "hansotbap-setup" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  let done = 0;
  let last = 0;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    done += chunk.length;
    const now = Date.now();
    if (total && now - last > 1000) {
      last = now;
      process.stdout.write(`\r[whisper] 받는 중 ${((done / total) * 100).toFixed(0)}% (${(done / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)}MB)`);
    }
  });
  const part = `${dest}.part`;
  await pipeline(body, createWriteStream(part));
  if (total) process.stdout.write("\n");
  renameSync(part, dest);
}

// ── 1) whisper-server ────────────────────────────────────────────────
async function ensureServer() {
  const exe = IS_WIN ? "whisper-server.exe" : "whisper-server";
  const local = findFile(TOOLS, exe);
  if (local) return local;
  const onPath = which("whisper-server");
  if (onPath) return onPath;

  if (IS_MAC) {
    if (!which("brew")) fail("Homebrew 가 없습니다. https://brew.sh 에서 설치한 뒤 다시 실행하세요");
    if (!run("brew", ["install", "whisper-cpp"])) fail("brew install whisper-cpp 실패");
    return which("whisper-server") || fail("설치 후에도 whisper-server 를 찾지 못했습니다");
  }

  // Windows·Linux: 공식 릴리스 바이너리. 최신 태그(v1.x)는 파일이 비어 있고 빌드 태그(bNNNN)에 올라온다
  const hasNvidia = !FORCE_CPU && !!which("nvidia-smi");
  const wanted = IS_WIN
    ? arch() === "arm64"
      ? ["whisper-bin-win-cpu-arm64.zip"]
      : [...(hasNvidia ? ["whisper-bin-win-cuda-12.4.0-x64.zip"] : []), "whisper-bin-x64.zip"]
    : ["whisper-bin-ubuntu-x64.tar.gz"];
  log(`whisper.cpp 릴리스에서 ${wanted.join(" 또는 ")} 를 찾는 중`);
  const res = await fetch("https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=10", {
    headers: { "User-Agent": "hansotbap-setup" },
  });
  if (!res.ok) fail(`GitHub 릴리스 목록을 받지 못했습니다 (HTTP ${res.status})`);
  let asset = null;
  for (const rel of await res.json()) {
    for (const name of wanted) {
      asset = rel.assets.find((a) => a.name === name);
      if (asset) {
        log(`${rel.tag_name} / ${asset.name} (${(asset.size / 1e6).toFixed(0)}MB)`);
        break;
      }
    }
    if (asset) break;
  }
  if (!asset) fail("이 OS용 whisper.cpp 바이너리를 찾지 못했습니다. https://github.com/ggml-org/whisper.cpp/releases 에서 받아 .tools/whisper 에 풀고 다시 실행하세요");

  mkdirSync(TOOLS, { recursive: true });
  const archive = join(TOOLS, asset.name);
  await download(asset.browser_download_url, archive);
  // Windows 10 이상의 내장 tar(bsdtar)는 zip 도 푼다. Git Bash 의 GNU tar 는 zip 을 못 풀어서 경로를 지정한다
  const tar = IS_WIN ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  if (spawnSync(tar, ["-xf", archive, "-C", TOOLS], { stdio: "inherit" }).status !== 0) {
    const ps = IS_WIN && spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${TOOLS}' -Force`], { stdio: "inherit" });
    if (!ps || ps.status !== 0) fail("압축 풀기 실패");
  }
  rmSync(archive);
  return findFile(TOOLS, exe) || fail("압축을 풀었지만 whisper-server 를 찾지 못했습니다");
}

// ── 2) ffmpeg ────────────────────────────────────────────────────────
function ensureFfmpeg() {
  if (which("ffmpeg")) return true;
  log("ffmpeg 가 없어 설치를 시도합니다 (m4a·webm·mp3 변환용)");
  if (IS_MAC && which("brew")) run("brew", ["install", "ffmpeg"]);
  else if (IS_WIN && which("winget")) {
    run("winget", ["install", "-e", "--id", "Gyan.FFmpeg", "--accept-source-agreements", "--accept-package-agreements"]);
    // winget 은 PATH 를 레지스트리에만 고친다 → 이번 실행(과 whisper-server --convert)에도 보이게 다시 읽어 붙인다
    const reg = spawnSync("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"], { encoding: "utf8" });
    if (reg.status === 0 && reg.stdout.trim()) process.env.PATH = `${reg.stdout.trim()};${process.env.PATH}`;
  } else if (which("apt-get")) run("sudo", ["apt-get", "install", "-y", "ffmpeg"]);
  if (which("ffmpeg")) return true;
  log("ffmpeg 를 쓸 수 없습니다. wav 파일만 받습니다 (Windows는 winget 설치 후 터미널을 새로 열면 잡힙니다)");
  return false;
}

// ── 3) 모델 ──────────────────────────────────────────────────────────
async function ensureModel(name) {
  const file = MODEL_FILES[name] || fail(`WHISPER_MODEL=${name} 은 지원하지 않습니다 (large-v3-turbo | large-v3)`);
  const dest = process.env.WHISPER_MODEL_PATH || join(MODELS_DIR, file);
  if (existsSync(dest)) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  log(`모델 ${file} 을 ${dirname(dest)} 에 받습니다`);
  await download(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`, dest);
  return dest;
}

// ── 4) 서버 켜기 + 연결 확인 ─────────────────────────────────────────
function silentWav(seconds = 1, rate = 16000) {
  const data = rate * seconds * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(data, 40);
  return buf;
}

async function checkConnection(baseUrl) {
  for (let i = 0; i < 120; i++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([silentWav()], { type: "audio/wav" }), "check.wav");
      form.append("response_format", "json");
      const res = await fetch(`${baseUrl}/audio/transcriptions`, { method: "POST", body: form });
      if (res.ok) return true;
    } catch {
      // 모델을 올리는 동안은 연결이 거절된다
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const env = readEnv();
  const baseUrl = (env.WHISPER_BASE_URL || "http://127.0.0.1:8090/v1").replace(/\/$/, "");
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    fail(`.env 의 WHISPER_BASE_URL(${baseUrl})이 이 PC가 아닙니다. 각자 PC 방식이면 http://127.0.0.1:8090/v1 로 둡니다`);
  }
  const port = url.port || "8090";
  if (port === "8000") fail("8000 은 백엔드 API 포트입니다. WHISPER_BASE_URL 을 8090 으로 바꾸세요");

  const server = await ensureServer();
  const hasFfmpeg = ensureFfmpeg();
  const model = await ensureModel(env.WHISPER_MODEL || "large-v3-turbo");
  log(`서버: ${server}`);
  log(`모델: ${model}`);
  if (CHECK_ONLY) return log("준비 완료 (--check: 서버는 켜지 않음)");

  const args = ["-m", model, "--host", "127.0.0.1", "--port", port, "--inference-path", "/v1/audio/transcriptions", "-l", "ko"];
  if (hasFfmpeg) args.push("--convert");
  log(`켜는 중… ${baseUrl}  (끄기: Ctrl+C)`);
  const child = spawn(server, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderrTail = "";
  child.stderr.on("data", (d) => (stderrTail = (stderrTail + d).slice(-2000)));
  child.on("exit", (code) => {
    // Windows 는 Ctrl+C 가 자식에게도 가서 0xC000013A 로 끝난다 → 정상 종료로 본다
    if (code === 0 || code === 3221225786 || code === null) process.exit(0);
    console.error(stderrTail);
    fail(`whisper-server 가 꺼졌습니다 (코드 ${code}). 포트 ${port} 를 다른 프로그램이 쓰고 있지 않은지 확인하세요`);
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (child.removeAllListeners("exit"), child.kill(), process.exit(0)));

  if (await checkConnection(baseUrl)) log(`연결 확인 완료. 백엔드가 ${baseUrl} 로 받아씁니다. 이 창을 켜 두세요`);
  else log("2분 안에 응답이 없습니다. 위 오류를 확인하세요");
}

main().catch((e) => fail(e.message));
