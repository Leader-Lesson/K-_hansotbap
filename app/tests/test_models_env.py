"""npm run models 가 .env 를 고칠 때 고른 줄만 바꾸고 주석·순서·다른 값은 그대로 두는지."""

import llm.models as M


def test_set_env_replaces_only_chosen_lines(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# 주석\nLLM_PROVIDER=claude\nANTHROPIC_API_KEY=secret\nLMSTUDIO_CHAT_MODEL=a\n", encoding="utf-8")
    monkeypatch.setattr(M, "ENV_FILE", env)

    M.set_env({"LLM_PROVIDER": "lmstudio", "LMSTUDIO_CHAT_MODEL": "b/c:Q4", "NEW_KEY": "x"})

    assert env.read_text(encoding="utf-8").splitlines() == [
        "# 주석",
        "LLM_PROVIDER=lmstudio",
        "ANTHROPIC_API_KEY=secret",
        "LMSTUDIO_CHAT_MODEL=b/c:Q4",
        "NEW_KEY=x",
    ]


def test_embedding_guess():
    assert M._looks_like_embedding("text-embedding-nomic-embed-text-v1.5")
    assert M._looks_like_embedding("BAAI/bge-m3")
    assert not M._looks_like_embedding("unsloth/Qwen3.8-Flash-Next-GGUF")
