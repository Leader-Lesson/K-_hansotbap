// F6 AI 챗봇: 시안처럼 오른쪽 아래 [AI] 버튼 → 패널. 넓은 화면(1100px 이상)에서는 오른쪽에 고정하고 본문을 옆으로 민다.
// 답은 서버(POST /api/chat)가 조회 함수로 찾은 근거로만 쓴다. 협력사로 물으면 contractor 를 붙여 서버가 자기 범위로 거른다.
// 대화는 역할별로 따로 브라우저에 둔다(역할을 바꾸면 다른 회사 답이 보이지 않게). 저장이 막혀도 화면은 동작한다
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { MarkdownLite } from "@/components/MarkdownLite";
import { md } from "@/lib/partyColor";
import { useShell } from "@/lib/shell";
import type { ChatEvidence, ChatEvidenceKind, ChatResponse, ChatStatus, ChatTurn, ConflictRecord, Task, ViewerRole } from "@/types";
import "@/views/s6.css";

interface Props {
  role: ViewerRole;
  tasks: Task[]; // 근거 칩을 누르면 그 작업 날짜의 상황판으로 (서버가 역할에 맞게 거른 작업)
  conflicts: ConflictRecord[];
}

interface Msg {
  w: "u" | "a" | "sys";
  text: string;
  res?: Pick<ChatResponse, "evidence" | "notice" | "answer_by" | "provider" | "model" | "elapsed_ms" | "today">;
}

const OPEN_KEY = "hansotbap.chatOpen"; // 판정 후 강제 새로고침을 해도 열린 채로
const LOG_KEY = (r: ViewerRole) => `hansotbap.chat.${r.kind === "prime" ? "prime" : r.contractor}`;
const KEEP = 40; // 역할별로 남기는 메시지 수 [팀 설정값]
const HISTORY_TURNS = 6; // 서버에 넘기는 최근 대화 (ChatRequest.history 최대 6개)
const EV_KIND: Record<ChatEvidenceKind, string> = { task: "작업", conflict: "판정", risk: "위험 시간대", share: "공유" };

function load<T>(store: () => Storage, key: string, fallback: T): T {
  try {
    const v = store().getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(store: () => Storage, key: string, value: unknown) {
  try {
    store().setItem(key, JSON.stringify(value));
  } catch {
    /* 저장이 막혀도 이 화면에서는 대화가 남는다 */
  }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** 최근 대화를 서버 형식으로 (질문 → 바로 뒤 답) */
function turns(msgs: Msg[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  msgs.forEach((m, i) => {
    if (m.w !== "u") return;
    const next = msgs[i + 1];
    out.push({ question: m.text, answer: next?.w === "a" ? next.text : undefined });
  });
  return out.slice(-HISTORY_TURNS);
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const EV_SHOW = 4; // 근거 칩을 처음에 보여 주는 수 (나머지는 [더 보기]) [팀 설정값]

/** 답에 붙는 근거 칩: 작업·판정·위험 시간대·공유. 조문·원문은 칩에 올리면 보인다. 날짜를 알 수 있는 칩은 누르면 그날 상황판으로 */
function Evidence({ list, dayOf, onGo }: { list: ChatEvidence[]; dayOf: (ev: ChatEvidence) => string | null; onGo: (day: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, EV_SHOW);
  return (
    <div className="evs">
      <span className="sub" style={{ marginRight: 4 }}>
        근거 {list.length}건
      </span>
      {shown.map((ev) => {
        const day = dayOf(ev);
        const title = [ev.legal_basis, ev.source ? `${ev.source.file}${ev.source.locator ? ` ${ev.source.locator}` : ""}: ${ev.source.text}` : null, day ? `누르면 ${md(day)} 상황판으로` : null]
          .filter(Boolean)
          .join("\n");
        const body = (
          <>
            <span className="k">{EV_KIND[ev.kind]}</span> {cut(ev.label, 64)}
            {ev.rule_id && <span className="mono"> · {ev.rule_id}</span>}
            {ev.kind === "task" && ev.source && <span className="k"> · {ev.source.file}</span>}
          </>
        );
        return day ? (
          <button key={ev.ref} type="button" className="evc" title={title} onClick={() => onGo(day)}>
            {body}
          </button>
        ) : (
          <span key={ev.ref} className="evc" title={title || undefined}>
            {body}
          </span>
        );
      })}
      {list.length > EV_SHOW && (
        <button type="button" className="goto" onClick={() => setAll((v) => !v)}>
          {all ? "접기" : `근거 ${list.length - EV_SHOW}건 더 보기`}
        </button>
      )}
    </div>
  );
}

export function ChatDock({ role, tasks, conflicts }: Props) {
  const { date, setDate, setTab } = useShell();
  const me = role.kind === "contractor" ? role.contractor : undefined;
  const logKey = LOG_KEY(role);
  const [open, setOpen] = useState<boolean>(() => load(session, OPEN_KEY, false));
  // 대화는 어느 역할 것인지(key)와 함께 둔다 — 역할을 바꾼 순간 다른 역할 대화가 새 역할 이름으로 저장되지 않게
  const [log, setLog] = useState(() => ({ key: logKey, list: load<Msg[]>(local, logKey, []) }));
  const msgs = log.key === logKey ? log.list : load<Msg[]>(local, logKey, []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // 역할이 바뀌면 그 역할의 대화로 바꾸고, 하던 질문은 버린다
  useEffect(() => {
    if (log.key === logKey) return;
    abortRef.current?.abort();
    setBusy(false);
    setLog({ key: logKey, list: load<Msg[]>(local, logKey, []) });
  }, [log.key, logKey]);
  useEffect(() => save(local, log.key, log.list.slice(-KEEP)), [log]);
  const push = (key: string, m: Msg) => setLog((l) => (l.key === key ? { key, list: [...l.list, m] } : l));

  useEffect(() => {
    save(session, OPEN_KEY, open);
    document.body.classList.toggle("chat-dock", open);
    return () => document.body.classList.remove("chat-dock");
  }, [open]);
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);
  // 연결 상태는 처음 열 때 한 번만 본다 (서버가 LLM 에 짧은 질문을 보내 확인한다)
  useEffect(() => {
    if (!open || status) return;
    api.chatStatus().then(setStatus).catch(() => setStatus({ provider: "", model: "", ok: false, latency_ms: null, error: "연결 확인 실패", plan_timeout: 0, answer_timeout: 0, total_timeout: 0 }));
  }, [open, status]);
  // Esc: 패널 안에 있을 때만 닫는다 (계획서 올리기 창 같은 다른 창의 Esc 와 겹치지 않게)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panelRef.current?.contains(document.activeElement)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async (q: string) => {
    const question = q.trim().slice(0, 500);
    if (!question || busy) return;
    const before = msgs;
    const key = logKey;
    push(key, { w: "u", text: question });
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await api.chat({ question, today: date, history: turns(before) }, { contractor: me, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const { evidence, notice, answer_by, provider, model, elapsed_ms, today } = r;
      push(key, { w: "a", text: r.answer, res: { evidence, notice, answer_by, provider, model, elapsed_ms, today } });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      push(key, { w: "sys", text: `답을 받지 못했습니다: ${(e as Error).message}` });
      setInput(question);
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  // 근거 칩 → 그 날짜의 상황판 (찾을 수 있는 것만)
  const dayOf = (ev: ChatEvidence): string | null => {
    if (ev.kind === "conflict" || ev.kind === "share") {
      const c = conflicts.find((r) => r.conflict.id === ev.target_id)?.conflict;
      return c ? c.window_start.slice(0, 10) : null;
    }
    if (ev.kind === "task") {
      const t = tasks.find((x) => x.id === ev.target_id);
      if (!t) return null;
      return t.start.slice(0, 10) <= date && t.end.slice(0, 10) >= date ? date : t.start.slice(0, 10);
    }
    return null;
  };
  const goto = (day: string) => {
    setDate(day);
    setTab("board");
  };

  const sugg = useMemo(() => {
    const names = [...new Set(tasks.map((t) => t.contractor))].filter((c) => c.startsWith("가상-")).sort();
    const pick = names.find((c) => c.includes("배관")) ?? names[0];
    return [
      me ? "내 작업과 겹치는 작업은?" : "오늘 금지 충돌은?",
      "내일 노정에서 누가 무슨 작업?",
      "이번 주 풍구 위험 시간대는?",
      me ? "오늘 우리 작업 일정" : pick ? `${pick} 작업 일정` : "오늘 작업 일정",
      me ? "원청이 공유한 충돌은?" : "내 작업과 겹치는 작업은?",
    ];
  }, [tasks, me]);

  const ctx = me ? `${me} 권한` : "원청 권한";

  return (
    <>
      {!open && <div aria-hidden style={{ height: 72 }} />}
      {open && (
        <aside ref={panelRef} className="s6 chatp" aria-label="AI 챗봇">
          <header>
            <b style={{ fontWeight: 500 }}>AI에게 묻기</b>
            <span className="fx">F6</span>
            <span className="grow" />
            {status && (
              <span className="sub" title={status.ok ? `${status.provider} ${status.model}` : status.error ?? ""}>
                <span className="dot" style={{ background: status.ok ? "var(--ok)" : "var(--amber)", marginRight: 4 }} />
                {status.ok ? "AI 연결됨" : "AI 꺼짐 · 규칙 답"}
              </span>
            )}
            <button type="button" className="x" onClick={() => setOpen(false)} aria-label="닫기">
              ×
            </button>
            <span className="sub ctx">
              {ctx} · 기준 <span className="t">{md(date)}</span>            </span>
          </header>
          <div className="msgs" ref={msgsRef} aria-live="polite">
            <div className="msg a">
              <p>언제, 어디서, 어느 협력사가 무슨 작업을 하는지 물어보세요. 답에는 근거(작업·판정·조문)를 붙입니다.</p>
              <p className="sub" style={{ margin: 0 }}>
                {me ? `${me} 범위(우리 작업과 원청이 공유한 충돌) 안에서만 답합니다.` : "원청은 전체 협력사 범위로 답합니다."} 기준 날짜는 위 머리의 날짜입니다.
              </p>
            </div>
            {msgs.map((m, i) =>
              m.w === "u" ? (
                <div key={i} className="msg u">
                  {m.text}
                </div>
              ) : m.w === "sys" ? (
                <div key={i} className="msg sys">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="msg a">
                  <MarkdownLite text={m.text} className="ans-md" />
                  {m.res && m.res.evidence.length > 0 && <Evidence list={m.res.evidence} dayOf={dayOf} onGo={goto} />}
                  {m.res && (
                    <div className="meta">
                      {m.res.answer_by === "llm" ? <span className="ai">AI 문장</span> : <span className="fx">규칙 답</span>}
                      <span className="sub">
                        기준 {md(m.res.today)} · {(m.res.elapsed_ms / 1000).toFixed(1)}초
                      </span>
                      {m.res.notice && <span className="sub" style={{ color: "var(--amber)" }}>{m.res.notice}</span>}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <div className="msg a typing">답을 찾는 중… (AI가 늦으면 규칙으로 답합니다)</div>}
          </div>
          <div className="sugg">
            {sugg.map((s) => (
              <button key={s} type="button" onClick={() => void ask(s)} disabled={busy}>
                {s}
              </button>
            ))}
            {msgs.length > 0 && (
              <button type="button" onClick={() => setLog({ key: logKey, list: [] })} disabled={busy} title="이 역할의 대화만 지웁니다">
                대화 지우기
              </button>
            )}
          </div>
          <form className="cin" onSubmit={submit}>
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="질문 입력" autoComplete="off" aria-label="질문" maxLength={500} />
            <button className="btn pri" type="submit" disabled={busy || !input.trim()}>
              묻기
            </button>
          </form>
        </aside>
      )}
      <button type="button" className="s6 fab" onClick={() => setOpen((v) => !v)} aria-label={open ? "AI 챗봇 닫기" : "AI 챗봇 열기"} aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeWidth="2.6" />
        </svg>
        AI
      </button>
    </>
  );
}
