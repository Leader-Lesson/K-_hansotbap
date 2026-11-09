"""모델 조회·선택: 각 서버에서 모델 목록을 받아 번호로 고르면 .env 에 저장한다.

    npm run models            # 조회 후 번호로 고르기
    npm run models -- --list  # 조회만 (.env 는 그대로)

Claude 는 /v1/models, Unsloth Studio·LM Studio 는 OpenAI 호환 /v1/models 를 쓴다.
LM Studio 는 /api/v0/models 로 채팅·임베딩 구분과 로드 여부까지 받는다.
"""

import re
import sys
from dataclasses import dataclass

import httpx

from config import REPO_ROOT, settings

ENV_FILE = REPO_ROOT / ".env"
PROVIDERS = ("claude", "unsloth", "lmstudio")
LABEL = {"claude": "Claude API", "unsloth": "Unsloth Studio", "lmstudio": "LM Studio"}


@dataclass
class Model:
    id: str
    kind: str  # chat | embedding
    loaded: bool | None = None  # 로컬 서버만. None = 알 수 없음


def _looks_like_embedding(model_id: str) -> bool:
    return bool(re.search(r"embed|bge|e5-|gte-", model_id, re.I))


def list_claude() -> list[Model]:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 없습니다")
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return [Model(m.id, "chat") for m in client.models.list(limit=100)]


def list_unsloth() -> list[Model]:
    if not settings.unsloth_base_url:
        raise RuntimeError("UNSLOTH_BASE_URL 이 없습니다")
    headers = {"Authorization": f"Bearer {settings.unsloth_api_key}"} if settings.unsloth_api_key else {}
    res = httpx.get(settings.unsloth_base_url.rstrip("/") + "/models", headers=headers, timeout=10)
    res.raise_for_status()
    return [
        Model(m["id"], "embedding" if _looks_like_embedding(m["id"]) else "chat", m.get("loaded"))
        for m in res.json()["data"]
    ]


def list_lmstudio() -> list[Model]:
    base = settings.lmstudio_base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.lmstudio_api_key}"} if settings.lmstudio_api_key else {}
    # LM Studio 고유 API: type(llm·vlm·embeddings)과 state(loaded·not-loaded)를 준다
    rich = re.sub(r"/v1$", "/api/v0/models", base)
    try:
        res = httpx.get(rich, headers=headers, timeout=10)
        res.raise_for_status()
        return [
            Model(m["id"], "embedding" if m.get("type") == "embeddings" else "chat", m.get("state") == "loaded")
            for m in res.json()["data"]
        ]
    except (httpx.HTTPError, KeyError):
        res = httpx.get(base + "/models", headers=headers, timeout=10)
        res.raise_for_status()
        return [Model(m["id"], "embedding" if _looks_like_embedding(m["id"]) else "chat") for m in res.json()["data"]]


LISTERS = {"claude": list_claude, "unsloth": list_unsloth, "lmstudio": list_lmstudio}


def current(provider: str, kind: str) -> str:
    if provider == "claude":
        return settings.claude_model if kind == "chat" else ""
    return getattr(settings, f"{provider}_{'chat' if kind == 'chat' else 'embedding'}_model")


def env_key(provider: str, kind: str) -> str:
    if provider == "claude":
        return "CLAUDE_MODEL"
    return f"{provider.upper()}_{'CHAT' if kind == 'chat' else 'EMBEDDING'}_MODEL"


def set_env(updates: dict[str, str]) -> None:
    """.env 의 해당 줄만 바꾼다. 없으면 끝에 붙인다. 주석·순서는 그대로 둔다."""
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    left = dict(updates)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0]
        if key in left:
            lines[i] = f"{key}={left.pop(key)}"
    lines += [f"{k}={v}" for k, v in left.items()]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def show(models_by: dict[str, list[Model] | Exception]) -> None:
    for p in PROVIDERS:
        mark = " ← LLM_PROVIDER" if p == settings.llm_provider else ""
        mark += " ← EMBEDDING_PROVIDER" if p == settings.embedding_provider else ""
        print(f"\n[{LABEL[p]}]{mark}")
        got = models_by[p]
        if isinstance(got, Exception):
            print(f"  조회 실패: {got}")
            continue
        for kind in ("chat", "embedding"):
            items = [m for m in got if m.kind == kind]
            if not items:
                continue
            print(f"  {'채팅' if kind == 'chat' else '임베딩'}:")
            for m in items:
                sel = "*" if m.id == current(p, kind) else " "
                state = "" if m.loaded is None else (" (로드됨)" if m.loaded else " (로드 안 됨)")
                print(f"   {sel} {m.id}{state}")


def ask(prompt: str, options: list[str], default: str | None) -> str | None:
    """번호 목록에서 고른다. 엔터 = 그대로(default)."""
    if not options:
        return default
    print(f"\n{prompt}")
    for i, o in enumerate(options, 1):
        print(f"  {i}) {o}{'  (현재)' if o == default else ''}")
    while True:
        raw = input(f"번호 [엔터: {default or '건너뛰기'}] > ").strip()
        if not raw:
            return default
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1]
        print("  목록의 번호를 넣어 주세요")


def pick(models_by: dict[str, list[Model] | Exception]) -> dict[str, str]:
    ok = [p for p in PROVIDERS if not isinstance(models_by[p], Exception)]
    updates: dict[str, str] = {}

    llm = ask("F1 추출·문장 생성에 쓸 곳 (LLM_PROVIDER)", ok, settings.llm_provider if settings.llm_provider in ok else None)
    if llm:
        updates["LLM_PROVIDER"] = llm
        chats = [m.id for m in models_by[llm] if m.kind == "chat"]  # type: ignore[union-attr]
        chosen = ask(f"{LABEL[llm]} 채팅 모델 ({env_key(llm, 'chat')})", chats, current(llm, "chat") or None)
        if chosen:
            updates[env_key(llm, "chat")] = chosen

    local = [p for p in ok if p != "claude"]
    emb = ask("F8 임베딩을 받을 곳 (EMBEDDING_PROVIDER)", local, settings.embedding_provider if settings.embedding_provider in local else None)
    if emb:
        updates["EMBEDDING_PROVIDER"] = emb
        embs = [m.id for m in models_by[emb] if m.kind == "embedding"]  # type: ignore[union-attr]
        if not embs:
            print(f"  {LABEL[emb]} 에 임베딩 모델이 없습니다. 서버에서 먼저 받아 두세요")
        chosen = ask(f"{LABEL[emb]} 임베딩 모델 ({env_key(emb, 'embedding')})", embs, current(emb, "embedding") or None)
        if chosen:
            updates[env_key(emb, "embedding")] = chosen
    return updates


def main() -> None:
    models_by: dict[str, list[Model] | Exception] = {}
    for p in PROVIDERS:
        try:
            models_by[p] = LISTERS[p]()
        except Exception as e:  # 서버 하나가 꺼져 있어도 나머지는 보여 준다
            models_by[p] = e
    show(models_by)
    if "--list" in sys.argv or not sys.stdin.isatty():
        return

    updates = pick(models_by)
    changed = {k: v for k, v in updates.items() if v != _env_value(k)}
    if not changed:
        print("\n바뀐 것이 없습니다")
        return
    set_env(changed)
    print("\n.env 에 저장했습니다:")
    for k, v in changed.items():
        print(f"  {k}={v}")
    print("npm run dev 가 켜져 있으면 백엔드를 다시 켜야 반영됩니다")
    for k, v in changed.items():
        if k.endswith("_MODEL") and k.startswith(("UNSLOTH", "LMSTUDIO")):
            p = k.split("_")[0].lower()
            m = next((m for m in models_by[p] if m.id == v), None)  # type: ignore[union-attr]
            if m and m.loaded is False:
                print(f"  참고: {v} 는 아직 {LABEL[p]} 에 로드되지 않았습니다. 첫 요청 때 올리느라 느릴 수 있습니다")


def _env_value(key: str) -> str | None:
    if not ENV_FILE.exists():
        return None
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1]
    return None


if __name__ == "__main__":
    main()
