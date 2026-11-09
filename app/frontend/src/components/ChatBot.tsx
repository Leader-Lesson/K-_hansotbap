// F6 AI 챗봇: 오른쪽 아래 버튼 → 대화 창. 질문 → 서버가 조회 함수로 찾아 근거 붙은 답.
// 답의 범위(권한)는 서버가 contractor 로 거른다. 화면은 보는 사람을 바꾸면 대화를 비운다 (App 이 key 로 새로 만든다)
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, ChevronDown, LoaderCircle, MessageCircle, RotateCcw, SendHorizontal, X } from "lucide-react";
import { api, CHAT_CLIENT_TIMEOUT_MS } from "@/api/client";
import { MarkdownLite } from "@/components/MarkdownLite";
import type { ChatEvidence, ChatResponse, ChatStatus, ChatTurn } from "@/types";

const MAX_HISTORY = 6; // 서버 ChatRequest.history 최대 (오래된 것부터)
const MAX_LEN = 500; // 서버 ChatRequest.question 최대 글자 수

const PROVIDER_LABEL: Record<string, string> = { claude: "Claude", unsloth: "Unsloth", lmstudio: "LM Studio" };

const EXAMPLES = {
  prime: ["내일 노정에서 누가 무슨 작업?", "이번 주 풍구 위험 시간대는?", "3월 12일 겹치는 작업 있어?"],
  contractor: ["내 작업과 겹치는 작업은?", "원청에서 받은 공지 있어?", "이번 주 내 작업 일정은?"],
};

type NewMsg = { kind: "user"; text: string } | { kind: "bot"; res: ChatResponse } | { kind: "error"; text: string };
type Msg = NewMsg & { id: number };

/** 앞선 대화 → 서버에 보낼 history (질문 다음에 답이 온 쌍만, 최근 MAX_HISTORY 개) */
function historyOf(msgs: Msg[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  msgs.forEach((m, i) => {
    const next = msgs[i + 1];
    if (m.kind === "user" && next?.kind === "bot") turns.push({ question: m.text, answer: next.res.answer });
  });
  return turns.slice(-MAX_HISTORY);
}

function providerText(provider: string, model: string): string {
  return `${PROVIDER_LABEL[provider] ?? provider}${model ? ` · ${model}` : ""}`;
}

function Evidence({ items }: { items: ChatEvidence[] }) {
  if (!items.length) return null;
  return (
    <details className="group mt-2 rounded border border-line-2 bg-surface-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 font-medium text-ink-2">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        근거 {items.length}건
      </summary>
      <ul className="space-y-1.5 border-t border-line-2 px-2 py-2">
        {items.map((e) => (
          <li key={e.ref} className="leading-snug">
            <div className="flex flex-wrap items-center gap-1">
              {e.rule_id && <span className="rounded bg-brand-soft px-1 font-semibold text-brand">{e.rule_id}</span>}
              <span className="text-ink">{e.label}</span>
            </div>
            {e.legal_basis && <div className="text-ink-3">{e.legal_basis}</div>}
            {e.source && (
              <blockquote className="mt-0.5 border-l-2 border-line pl-2 text-ink-2">
                “{e.source.text}”
                <span className="ml-1 text-ink-3">
                  — {e.source.file}
                  {e.source.locator ? ` · ${e.source.locator}` : ""}
                </span>
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function BotMessage({ res }: { res: ChatResponse }) {
  const by = res.answer_by === "llm" ? providerText(res.provider, res.model) : "규칙으로 답함 (AI 없이)";
  return (
    <div data-chat="bot" className="mr-6 rounded-lg bg-surface-2 px-3 py-2">
      <MarkdownLite text={res.answer} />
      {res.notice && <p className="mt-1.5 rounded bg-warn-soft px-2 py-1 text-xs text-warn">{res.notice}</p>}
      <Evidence items={res.evidence} />
      <div className="mt-1.5 text-[11px] text-ink-3">
        {by} · {(res.elapsed_ms / 1000).toFixed(1)}초 · 기준일 {res.today}
      </div>
    </div>
  );
}

export function ChatBot({ contractor }: { contractor?: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const nextId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 처음 열 때 한 번만 연결 확인 (서버가 LLM 에 짧은 질문을 보내 본다 — 몇 초 걸릴 수 있다)
  const checked = useRef(false);
  useEffect(() => {
    if (!open || checked.current) return;
    checked.current = true;
    api
      .chatStatus()
      .then(setStatus)
      .catch((e: Error) => setStatusError(e.message));
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 새 메시지가 오면 아래로
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 보는 사람을 바꾸면(컴포넌트가 새로 만들어지면) 진행 중인 질문을 끊는다
  useEffect(() => () => abortRef.current?.abort(), []);

  const push = (m: NewMsg) => setMsgs((prev) => [...prev, { ...m, id: nextId.current++ }]);

  const ask = async (text: string) => {
    const question = text.trim().slice(0, MAX_LEN);
    if (!question || busy) return;
    const history = historyOf(msgs);
    push({ kind: "user", text: question });
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await api.chat({ question, history }, { contractor, signal: ctrl.signal });
      push({ kind: "bot", res });
    } catch (e) {
      push({ kind: "error", text: ctrl.signal.aborted ? "질문을 취소했습니다" : (e as Error).message });
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 글자 확정이라 보내지 않는다. Shift+Enter 는 줄바꿈
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(input);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMsgs([]);
    setInput("");
  };

  const examples = contractor ? EXAMPLES.contractor : EXAMPLES.prime;
  const scope = contractor ? `협력사 ${contractor} · 자기 작업과 원청이 공유한 충돌만` : "원청 · 전체 열람";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-haspopup="dialog"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        AI 챗봇
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="AI 챗봇"
      className="fixed inset-x-3 bottom-3 z-40 flex h-[min(640px,calc(100dvh-5rem))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[420px]"
    >
      <header className="flex items-start gap-2 border-b border-line-2 px-3 py-2.5">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">AI 챗봇</h2>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">합성 데이터</span>
          </div>
          <p className="truncate text-[11.5px] text-ink-3" title={scope}>
            {scope}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-ink-3">
            <span
              className={`h-1.5 w-1.5 rounded-full ${status?.ok ? "bg-ok" : status || statusError ? "bg-danger" : "bg-stone-300"}`}
              aria-hidden="true"
            />
            {status
              ? status.ok
                ? `${providerText(status.provider, status.model)} 연결됨`
                : `AI 연결 안 됨 — 규칙으로 답합니다 (${status.error ?? "원인 모름"})`
              : statusError
                ? `연결 확인 실패: ${statusError}`
                : "AI 연결 확인 중…"}
          </p>
        </div>
        <button type="button" onClick={reset} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="새 대화" aria-label="새 대화">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" title="닫기 (Esc)" aria-label="닫기">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-3 text-sm text-ink-2">
            <p>현장 작업 일정, 겹침(충돌), 위험 시간대, 원청 공지를 물어볼 수 있습니다. 답에는 근거(규칙 번호·법 조문·원문)가 붙습니다.</p>
            <div className="flex flex-col items-start gap-1.5">
              {examples.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  className="rounded-full border border-line px-3 py-1 text-left text-xs text-ink-2 hover:border-brand hover:bg-brand-soft hover:text-brand"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3">작업 승인·중지는 판단하지 않습니다. 확인을 돕고 결정은 사람이 합니다.</p>
          </div>
        )}
        {msgs.map((m) =>
          m.kind === "user" ? (
            <div key={m.id} data-chat="user" className="ml-10 rounded-lg bg-brand px-3 py-2 text-sm whitespace-pre-wrap text-white">
              {m.text}
            </div>
          ) : m.kind === "bot" ? (
            <BotMessage key={m.id} res={m.res} />
          ) : (
            <p key={m.id} data-chat="error" className="mr-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {m.text}
            </p>
          ),
        )}
        {busy && (
          <div className="mr-6 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-3">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            답을 찾는 중… (최대 {CHAT_CLIENT_TIMEOUT_MS / 1000}초)
            <button type="button" onClick={() => abortRef.current?.abort()} className="ml-auto text-xs text-ink-2 underline">
              취소
            </button>
          </div>
        )}
      </div>

      <form
        className="border-t border-line-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="chatbot-input" className="sr-only">
            질문
          </label>
          <textarea
            id="chatbot-input"
            ref={inputRef}
            rows={2}
            value={input}
            maxLength={MAX_LEN}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="질문을 입력하세요 (Enter 보내기 · Shift+Enter 줄바꿈)"
            className="min-h-[2.75rem] flex-1 resize-none rounded border border-line px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-[2.75rem] items-center gap-1 rounded bg-brand px-3 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-40"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            보내기
          </button>
        </div>
        {input.length > MAX_LEN - 50 && (
          <p className="mt-1 text-right text-[11px] text-ink-3">
            {input.length}/{MAX_LEN}자
          </p>
        )}
      </form>
    </section>
  );
}
