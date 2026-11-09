"""F7 TBM 전달 확인 평가: (a) 대본 글로 항목별 언급 여부 판정, (b) 합성 음성 받아쓰기(STT) 후 글자 오류율(CER)과 재판정.

    cd app/backend && uv run python ../samples/eval_tbm.py
    cd app/backend && uv run python ../samples/eval_tbm.py --no-stt                 # 받아쓰기 건너뜀
    cd app/backend && uv run python ../samples/eval_tbm.py --transcript stt.txt     # 이미 받아쓴 글로 (b)
    cd app/backend && uv run python ../samples/eval_tbm.py --json ../samples/answers/_eval_tbm.json

정답: samples/tbm/TBM_2027-02-26_expected.json (공유 항목 4건, 일부러 뺀 항목 expected_missing)

(a) 항목 판정
- 서비스의 실제 판정은 LLM(llm/tbm_check.py)이 근거 문장을 뽑고, 규칙(rules/tbm.py verify)이 그 문장이 전사문에 정말
  있는지 검사한다. 지금은 LLM 키가 없으므로 LLM 자리를 낱말 대조로 바꿔 넣는다 [평가용 대체]:
  · 항목의 keywords(정답 파일)를 띄어쓰기·문장부호 무시하고 전사문에서 찾아, 절반 이상 나오면 '말함'
  · 근거 문장 = 처음 찾은 낱말이 든 전사문 문장 → rules/tbm.py verify 로 그대로 검사 (실제 서비스와 같은 검사)
- 지표: 일부러 뺀 항목을 찾았는가, 잘못 '빠짐'(말했는데 빠졌다고 함) 건수, 잘못 '말함'(빠졌는데 말했다고 함) 건수

(b) 받아쓰기 (내려받기 없음 — 이미 있는 것만 쓴다)
- 1순위: .env 의 WHISPER_BASE_URL whisper.cpp 서버가 켜져 있으면 stt/whisper.py transcribe 로
- 2순위: 서버가 없으면 scripts/whisper.mjs 가 설치해 두는 .tools/whisper 의 whisper-cli 와
  ~/models(또는 WHISPER_MODELS_DIR)의 모델 파일로 직접 받아쓴다
- 둘 다 없으면 건너뛰고 이유를 찍는다
- CER = 글자 편집 거리 / 대본 글자 수 (공백·문장부호 제외, 숫자 표기 차이도 오류로 센다)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from eval_common import HERE, save_json

from config import REPO_ROOT, settings  # noqa: E402
from rules.tbm import _squash, verify  # noqa: E402
from schemas import TbmItem, TbmItemJudgement, TbmItemKind  # noqa: E402
from stt.whisper import DEFAULT_PROMPT  # noqa: E402

TBM = HERE / "tbm"
EXPECTED = TBM / "TBM_2027-02-26_expected.json"
WAV = TBM / "TBM_2027-02-26_가상-배관O_합성음성_16k.wav"
KIND = {"conflict_adjustment": TbmItemKind.ADJUSTMENT, "risk_window": TbmItemKind.RISK_WINDOW,
        "notice": TbmItemKind.NOTICE, "sop_step": TbmItemKind.NOTICE}  # 표준서 단계는 원청 공지로 전달된다
MODEL_FILES = {"large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin", "large-v3": "ggml-large-v3-q5_0.bin"}  # scripts/whisper.mjs 와 같다
KEYWORD_SHARE = 0.5  # 항목 낱말 중 이 비율 이상 나오면 '말함' [평가용 설정값]


def script_transcript(path: Path) -> str:
    """대본 .md 에서 '## 대본' 아래 읽은 글만 꺼낸다."""
    text = path.read_text(encoding="utf-8")
    body = text.split("## 대본", 1)[1].split("\n", 1)[1]
    return "\n".join(line.strip() for line in body.splitlines() if line.strip()).strip()


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?。])\s+|\n", text) if s.strip()]


def keyword_judgements(shared: list[dict], transcript: str) -> list[TbmItemJudgement]:
    """LLM 대신 낱말 대조로 항목별 답을 만든다 (근거 문장은 전사문에서 그대로 꺼낸다)."""
    sq = _squash(transcript)
    out = []
    for item in shared:
        hits = [k for k in item["keywords"] if _squash(k) in sq]
        said = len(hits) >= KEYWORD_SHARE * len(item["keywords"])
        quote = next((s for s in sentences(transcript) if _squash(hits[0]) in _squash(s)), None) if said and hits else None
        out.append(TbmItemJudgement(item_id=item["id"], mentioned=said and quote is not None, quote=quote))
    return out


def judge_items(expected: dict, transcript: str) -> dict:
    shared = expected["shared_items"]
    items = [TbmItem(id=s["id"], kind=KIND[s["kind"]], text=s["text"]) for s in shared]
    t0 = time.perf_counter()
    results = verify(items, keyword_judgements(shared, transcript), transcript)
    ms = (time.perf_counter() - t0) * 1000
    truth = {s["id"]: s["mentioned"] for s in shared}
    rows = [{"id": r.item.id, "kind": r.item.kind.value, "truth": truth[r.item.id], "got": r.mentioned,
             "quote": r.quote, "note": r.note} for r in results]
    judged_missing = {r["id"] for r in rows if not r["got"]}
    exp_missing = set(expected["expected_missing"])
    return {
        "rows": rows, "ms": round(ms, 2),
        "found_intended_missing": exp_missing <= judged_missing,
        "false_missing": sum(1 for r in rows if r["truth"] and not r["got"]),
        "false_mentioned": sum(1 for r in rows if not r["truth"] and r["got"]),
        "correct": sum(1 for r in rows if r["truth"] == r["got"]), "total": len(rows),
    }


def print_judgement(label: str, j: dict) -> None:
    print(f"\n[{label}]")
    print(f"{'항목':16} {'종류':12} {'정답':6} {'판정':6} 근거 문장")
    for r in j["rows"]:
        mark = lambda b: "말함" if b else "빠짐"  # noqa: E731
        ok = "" if r["truth"] == r["got"] else "  ← 틀림"
        print(f"{r['id']:16} {r['kind']:12} {mark(r['truth']):6} {mark(r['got']):6} {(r['quote'] or r['note'] or '-')[:60]}{ok}")
    print(f"항목 판정 {j['correct']}/{j['total']} 맞음 · 일부러 뺀 항목 찾음: {'○' if j['found_intended_missing'] else '✗'} · "
          f"잘못 '빠짐' {j['false_missing']}건 · 잘못 '말함' {j['false_mentioned']}건 · 판정 {j['ms']}ms")


# ── 받아쓰기 ──────────────────────────────────────────────────────────
def server_up() -> bool:
    import httpx

    try:
        httpx.get(settings.whisper_base_url.rstrip("/").rsplit("/v1", 1)[0] + "/", timeout=2)
        return True
    except Exception:
        return False


def local_cli() -> tuple[Path | None, Path | None]:
    exe = "whisper-cli.exe" if os.name == "nt" else "whisper-cli"
    tools = REPO_ROOT / ".tools" / "whisper"
    cli = next(iter(sorted(tools.rglob(exe))), None) if tools.exists() else None
    models_dir = Path(os.environ.get("WHISPER_MODELS_DIR") or Path.home() / "models")
    model = models_dir / MODEL_FILES[settings.whisper_model]
    return cli, model if model.exists() else None


def transcribe(wav: Path) -> tuple[str | None, str, float]:
    """(받아쓴 글 또는 None, 방법·건너뛴 이유, 초)."""
    t0 = time.perf_counter()
    if server_up():
        from stt.whisper import transcribe as via_server

        try:
            return via_server(wav), f"whisper.cpp 서버 ({settings.whisper_base_url}, {settings.whisper_model})", time.perf_counter() - t0
        except Exception as e:
            return None, f"서버 받아쓰기 실패: {type(e).__name__}: {e}"[:200], time.perf_counter() - t0
    cli, model = local_cli()
    if cli is None or model is None:
        why = []
        if cli is None:
            why.append(".tools/whisper 에 whisper-cli 가 없음")
        if model is None:
            why.append(f"모델 파일 {MODEL_FILES[settings.whisper_model]} 이 ~/models(WHISPER_MODELS_DIR)에 없음")
        return None, (f"STT 건너뜀: whisper 서버({settings.whisper_base_url})가 꺼져 있고 " + ", ".join(why)
                      + " — 내려받지 않는다 (npm run whisper -- --check 로 준비)"), 0.0
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "stt"
        cmd = [str(cli), "-m", str(model), "-f", str(wav), "-l", "ko", "-nt", "-np", "-otxt", "-of", str(out),
               "-t", str(os.cpu_count() or 4), "--prompt", DEFAULT_PROMPT]
        res = subprocess.run(cmd, capture_output=True, timeout=settings.whisper_timeout)
        txt = out.with_suffix(".txt")
        if res.returncode != 0 or not txt.exists():
            err = res.stderr.decode("utf-8", "replace")[-300:]
            return None, f"whisper-cli 실패 (코드 {res.returncode}): {err}", time.perf_counter() - t0
        text = txt.read_text(encoding="utf-8", errors="replace").strip()
    return text, f"whisper-cli 직접 실행 ({cli.relative_to(REPO_ROOT)}, {model.name}, CPU {os.cpu_count()}스레드)", time.perf_counter() - t0


def cer(ref: str, hyp: str) -> tuple[float, int, int]:
    """(CER, 편집 거리, 대본 글자 수). 공백·문장부호는 빼고 비교한다."""
    r, h = _squash(ref), _squash(hyp)
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hc in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc))
        prev = cur
    dist = prev[-1]
    return (dist / len(r) if r else 0.0), dist, len(r)


def main() -> None:
    ap = argparse.ArgumentParser(description="F7 TBM 항목 판정·받아쓰기 CER (합성 음성 1건)")
    ap.add_argument("--no-stt", action="store_true", help="받아쓰기를 건너뛴다")
    ap.add_argument("--transcript", help="이미 받아쓴 글 파일 (주면 받아쓰기 대신 이 글로 (b))")
    ap.add_argument("--json", help="결과를 JSON 으로 저장할 경로")
    args = ap.parse_args()

    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    script_path = TBM / expected["transcript_source"]
    t0 = time.perf_counter()
    script = script_transcript(script_path)
    ms_read = (time.perf_counter() - t0) * 1000
    llm_note = ("LLM 판정(llm/tbm_check.py)은 부르지 않음 — "
                + ("ANTHROPIC_API_KEY 없음" if settings.llm_provider == "claude" and not settings.anthropic_api_key
                   else "평가 스크립트는 유료·원격 LLM 을 부르지 않는다")
                + ". 낱말 대조로 근거 문장을 뽑고 rules/tbm.py verify 로 검사")
    print(f"판정 방식: {llm_note}")
    print(f"대본: {script_path.name} ({len(script)}자, 읽기 {ms_read:.1f}ms)")

    a = judge_items(expected, script)
    print_judgement("(a) 대본 글로 판정", a)

    report: dict = {"method": llm_note, "script_chars": len(script), "script_judgement": a, "stt": None}
    if args.no_stt:
        print("\n(b) 받아쓰기: --no-stt 로 건너뜀")
    else:
        if args.transcript:
            text, how, sec = Path(args.transcript).read_text(encoding="utf-8").strip(), f"파일 {args.transcript}", 0.0
        else:
            print(f"\n(b) 받아쓰기: {WAV.name} …")
            text, how, sec = transcribe(WAV)
        if text is None:
            print(f"(b) {how}")
            report["stt"] = {"skipped": how}
        else:
            t1 = time.perf_counter()
            rate, dist, n = cer(script, text)
            ms_cer = (time.perf_counter() - t1) * 1000
            print(f"(b) 받아쓰기 방법: {how}")
            print(f"    받아쓰기 시간 {sec:.1f}초 · 받아쓴 글 {len(text)}자")
            print(f"    CER {100 * rate:.1f}% (편집 거리 {dist} / 대본 {n}자, 공백·문장부호 제외, 계산 {ms_cer:.0f}ms)")
            print(f"    받아쓴 글: {text[:300]}{'…' if len(text) > 300 else ''}")
            b = judge_items(expected, text)
            print_judgement("(b) 받아쓴 글로 판정", b)
            report["stt"] = {"method": how, "seconds": round(sec, 1), "text": text, "cer": round(100 * rate, 2),
                             "edit_distance": dist, "ref_chars": n, "judgement": b}
    save_json(args.json, report)


if __name__ == "__main__":
    main()
