// 충돌 상세 서랍 — 시안 app.js renderDrawer 의 "conf"(충돌 상세)·"result"(조정 결과)
// 상세: 한 줄 문장 · 두 작업 카드 · 근거(규칙 ID · 법 조문 · 판정 이유 · 계획서 원문 · 매칭 표준서) · 조정안(F4) · 협력사 공유(F5) · 3D로 보기
// 판정·조정안 계산은 서버 규칙이 한 것이고 여기서는 보여 주고 사람이 고르게만 한다. 조정 적용·되돌리기·공유는 원청만(서버가 403으로 막는다).
// 협력사는 서버가 걸러 준 것만 받는다: 원청이 공유한 자기 충돌, 자기 계획서 원문 (타사 원문·인원은 서버가 비워 보낸다)
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/api/client";
import { GRADE_PILL } from "@/components/ActionCards";
import { CONFLICT_TYPE_LABEL, fmtDateTime } from "@/lib/format";
import { conflictLabel, conflictSentence, daySpan, hzLabel, isOther, mdw, short, type TextCtx } from "@/lib/conflictText";
import { usePerson } from "@/lib/person";
import type { AdjustmentCandidate, AdjustmentResult, Conflict, ConflictRecord, Rule, SopMatch, Task, ViewerRole, Zone } from "@/types";
import "./actions.css";

// 조정을 적용하면 App 이 화면을 한 번 강제 새로고침한다(기획서). 결과 서랍(되돌리기)이 새로고침 뒤에도 다시 열리게 남겨 둔다
const LAST_KEY = "hansotbap.lastAdjust";
function readLast(): AdjustmentResult | null {
  try {
    const v = sessionStorage.getItem(LAST_KEY);
    return v ? (JSON.parse(v) as AdjustmentResult) : null;
  } catch {
    return null;
  }
}
function writeLast(r: AdjustmentResult | null) {
  try {
    if (r) sessionStorage.setItem(LAST_KEY, JSON.stringify(r));
    else sessionStorage.removeItem(LAST_KEY);
  } catch {
    /* 저장이 막혀도 이 화면에서는 결과를 보여 준다 */
  }
}

// 규칙 표(R01~R30)는 바뀌지 않으므로 한 번만 받는다
let rulesOnce: Promise<Rule[]> | null = null;
const loadRules = () =>
  (rulesOnce ??= api.rules().catch(() => {
    rulesOnce = null;
    return [] as Rule[];
  }));
/** 규칙 이름: 'R08 노내/설비 내부 작업 미완료 × 가스·냉각수·동력 라인 복구/연결' (괄호 설명은 뗀다) */
const ruleTitle = (r: Rule | undefined) => (r ? [r.task_a, r.task_b].map((s) => s.replace(/\s*\([^)]*\)/g, "").trim()).join(" × ") : "");
/** '규칙 조문; 다른 근거 / 산안법 제64조…' → 조문 하나씩 */
const laws = (basis: string) =>
  basis
    .split(" / ")
    .flatMap((s) => s.split(/;\s*/))
    .map((s) => s.trim())
    .filter(Boolean);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const hm = (iso: string) => iso.slice(11, 16);
/** 기간: 같은 날이면 '2/26(금) 07:00–19:00', 여러 날이면 '2/26(금)~3/4(목)' */
const rng = (s: string, e: string) => (s.slice(0, 10) === e.slice(0, 10) ? `${mdw(s)} ${hm(s)}–${hm(e)}` : `${mdw(s)}~${mdw(e)}`);

interface Props {
  record: ConflictRecord | null; // 연 충돌 (없으면 직전 조정 결과가 있을 때만 결과 서랍)
  date: string; // 상황판이 보는 날짜 — 문장의 시각을 그날 기준으로
  role: ViewerRole;
  tasks: Task[];
  zones: Zone[];
  colorOf: (contractor: string) => string; // 시간표·3D와 같은 업체 색
  onClose: () => void;
  onOpen: (conflictId: string) => void; // 결과 서랍의 '새 충돌'을 눌렀을 때
  onAdjusted?: (r: AdjustmentResult) => void; // 적용·되돌리기 뒤 (App 이 새로고침)
  onShared?: () => void; // 공유 뒤 다시 불러오기
  onShow3D?: (taskId: string, record: ConflictRecord) => void;
}

export function ConflictDrawer(props: Props) {
  const { record, role, onClose, onAdjusted } = props;
  const isPrime = role.kind === "prime";
  const [last, setLast] = useState<AdjustmentResult | null>(() => (isPrime ? readLast() : null));
  const openId = record?.conflict.id;
  useEffect(() => {
    if (!openId) return;
    setLast(null); // 다른 충돌을 열면 지난 결과 서랍은 닫는다
    writeLast(null);
  }, [openId]);

  if (record)
    return (
      <ConflictDetail
        key={record.conflict.id}
        {...props}
        record={record}
        onApplied={(res) => {
          writeLast(res);
          setLast(res);
          onClose(); // 상세를 닫고 결과 서랍으로 (시안: 적용 → 결과 서랍)
          onAdjusted?.(res);
        }}
      />
    );
  if (last && isPrime)
    return (
      <AdjustResultDrawer
        result={last}
        {...props}
        onClose={() => {
          writeLast(null);
          setLast(null);
        }}
      />
    );
  return null;
}

/** 서랍 틀: 오른쪽 고정 · Esc 로 닫기 · 열리면 닫기 단추로 초점 (모달이 아니라 뒤의 카드·시간표를 계속 누를 수 있다) */
function Drawer({ label, head, tools, children, onClose }: { label: string; head: ReactNode; tools?: ReactNode; children: ReactNode; onClose: () => void }) {
  const x = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    x.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <aside className="drawer pop" role="dialog" aria-label={label}>
      <header>
        {head}
        <span className="grow" />
        {tools}
        <button ref={x} type="button" className="x" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>
      <div className="body">{children}</div>
    </aside>
  );
}

function ConflictDetail({
  record: r,
  date,
  role,
  tasks,
  zones,
  colorOf,
  onClose,
  onShared,
  onShow3D,
  onApplied,
}: Props & { record: ConflictRecord; onApplied: (res: AdjustmentResult) => void }) {
  const c = r.conflict;
  const me = role.kind === "contractor" ? role.contractor : undefined;
  const isPrime = !me;
  const ctx: TextCtx = useMemo(
    () => ({ taskById: new Map(tasks.map((t) => [t.id, t])), zoneById: new Map(zones.map((z) => [z.id, z])), me }),
    [tasks, zones, me],
  );
  const ts = c.task_ids.map((id) => ctx.taskById.get(id));
  const [rules, setRules] = useState<Rule[]>([]);
  const [sops, setSops] = useState<SopMatch[]>([]);
  useEffect(() => {
    void loadRules().then(setRules);
    api.sopMatches(me).then(setSops).catch(() => setSops([]));
  }, [me]);

  const tc = (t: Task | undefined, id: string) => {
    if (!t)
      return (
        <div className="tc" style={{ ["--pc" as string]: "var(--ink-3)" } as CSSProperties}>
          <div className="sub">{id}</div>
          <div>현재 일정에 없는 작업</div>
        </div>
      );
    const z = ctx.zoneById.get(t.zone_id);
    const time = (
      <span className="t">
        {hm(t.start)}–{hm(t.end)}
      </span>
    );
    if (isOther(t, me))
      return (
        <div className="tc" style={{ ["--pc" as string]: "var(--ink-3)" } as CSSProperties}>
          <div className="sub">타사 · 우리 작업에 영향</div>
          <div>
            {t.name} · {hzLabel(t)}
          </div>
          <div className="l">
            {z?.name ?? t.zone_id} · {time}
          </div>
          <div className="l">인원·계획서 원문은 원청만 봅니다</div>
        </div>
      );
    return (
      <div className="tc" style={{ ["--pc" as string]: colorOf(t.contractor) } as CSSProperties}>
        <div className="sub">
          {t.id} · {short(t.contractor)}
        </div>
        <div>
          {t.name}
          {t.crew != null && (
            <>
              {" "}
              · <b>{t.crew}명</b>
            </>
          )}
        </div>
        <div className="l">
          {z?.name ?? t.zone_id}
          {z?.description ? ` (${z.description})` : ""} · {time}
        </div>
        <div className="l">
          {mdw(t.start)}~{mdw(t.end)}
        </div>
      </div>
    );
  };
  const [a, b] = ts;
  const rel = (() => {
    if (c.type === "sequence") return "선행 →";
    if (c.type === "vertical") {
      const za = a && ctx.zoneById.get(a.zone_id);
      const zb = b && ctx.zoneById.get(b.zone_id);
      return za && zb && za.vertical_order < zb.vertical_order ? "아래 ↕ 위" : "위 ↕ 아래";
    }
    if (c.type === "hot_gas") return "화기·가스";
    return "겹침";
  })();

  // 매칭 표준서(F8): 이 충돌에 걸린 작업 중 볼 수 있는 작업마다 주 표준서(없으면 가장 비슷한 표준서).
  // 표준서 누락 판정은 규칙 ID가 'SOP:<표준서 ID>' 라 그 표준서를 고른다
  const sopOf = c.type === "sop_missing" ? c.rule_id.replace(/^SOP:/, "") : null;
  const sopLines = ts.flatMap((t) => {
    if (!t || isOther(t, me)) return [];
    const ms = sops.filter((m) => m.task_id === t.id);
    const m = (sopOf && ms.find((x) => x.sop_id === sopOf)) || ms.find((x) => x.primary) || [...ms].sort((x, y) => y.score - x.score)[0];
    return m ? [{ t, m }] : [];
  });
  const missing = c.type === "sop_missing" ? sopLines.flatMap(({ m }) => m.missing_steps) : [];
  const hidden = !!me && ts.some((t) => isOther(t, me));
  // 3D: 원청은 문제를 일으킨 쪽(순서 위반의 후행·위아래의 아래)을, 협력사는 자기 작업을 비춘다
  const focusId = (me ? c.task_ids.find((id) => !isOther(ctx.taskById.get(id), me)) : c.task_ids[1]) ?? c.task_ids[0];

  return (
    <Drawer
      label="충돌 상세"
      onClose={onClose}
      head={
        <>
          <span className={`pill ${GRADE_PILL[c.grade]}`}>{c.grade}</span>
          <span>{CONFLICT_TYPE_LABEL[c.type]}</span>
          <span className="mono">{c.rule_id}</span>
        </>
      }
      tools={
        onShow3D && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              onClose();
              onShow3D(focusId, r);
            }}
          >
            3D로 보기
          </button>
        )
      }
    >
      <p className="lead">{conflictSentence(c, daySpan(c.window_start, c.window_end, date), ctx)}</p>

      {ts.length === 1 ? (
        tc(a, c.task_ids[0])
      ) : (
        <div className="pair">
          {tc(a, c.task_ids[0])}
          <div className="rel">{rel}</div>
          {tc(b, c.task_ids[1])}
        </div>
      )}
      {ts.length > 2 && (
        <div className="sec">
          <span className="h">함께 겹치는 작업 {ts.length - 2}건 더</span>
          <div className="chips">
            {c.task_ids.slice(2).map((id) => {
              const t = ctx.taskById.get(id);
              return (
                <span key={id} className="chip">
                  {!t ? id : isOther(t, me) ? `타사 ${t.name}` : `${id} ${short(t.contractor)} ${t.name}`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="sec">
        <span className="h">
          근거 <span className="fx">F2</span>
        </span>
        <div className="chips">
          <span className="chip">
            {c.rule_id} {ruleTitle(rules.find((x) => x.id === c.rule_id))}
          </span>
          {laws(c.legal_basis).map((l) => (
            <span key={l} className="chip law">
              {l}
            </span>
          ))}
        </div>
        <p className="why">
          <span className="sub">판정 이유 · </span>
          {c.reason}
        </p>
        {c.sources.map((s, i) => (
          <blockquote key={i}>
            {s.text}
            <cite>
              {s.file}
              {s.locator ? ` · ${s.locator}` : ""}
            </cite>
          </blockquote>
        ))}
        {hidden && <blockquote className="sub">타사 계획서 원문은 원청만 볼 수 있습니다.</blockquote>}
        <div className="sub">
          매칭 표준서 <span className="fx">F8</span>{" "}
          {sopLines.length ? sopLines.map(({ t, m }) => `${m.sop_id} ${m.title} (${m.score.toFixed(2)})${sopLines.length > 1 ? ` · ${t.id}` : ""}`).join(" · ") : "—"}
        </div>
        {missing.length > 0 && (
          <div className="case">
            계획서에 빠진 표준서 단계: <span className="kw">{missing.join(", ")}</span>
          </div>
        )}
        <div className="sub">
          판정 {fmtDateTime(r.judged_at)}
          {r.plan_id != null ? ` · 제출 #${r.plan_id}` : ""} · 겹치는 기간 {rng(c.window_start, c.window_end)}
        </div>
      </div>

      {isPrime && r.status !== "resolved" ? (
        <AdjustPanel record={r} ctx={ctx} onApplied={onApplied} onShared={onShared} />
      ) : (
        <div className="sec">
          <span className="h">
            조정안 <span className="fx">F4</span>
          </span>
          {c.suggestion && (
            <div className="prop">
              <div>
                <div className="k">규칙 조정안</div>
                <div>{c.suggestion}</div>
              </div>
            </div>
          )}
          <p className="note">조정은 원청이 합니다. 원청이 조정을 적용하면 「원청에서 받은 공지」에 ‘조정 반영’으로 알려 드립니다.</p>
        </div>
      )}
      <p className="note">시스템은 작업을 승인하거나 중지하지 않습니다. 적용하면 즉시 다시 대조하고 결정과 책임자를 기록합니다.</p>
    </Drawer>
  );
}

/** F4 조정안 + F5 공유 (원청 전용). 서랍을 열면 후보를 바로 부른다(규칙 계산, 1~2초) */
function AdjustPanel({
  record: r,
  ctx,
  onApplied,
  onShared,
}: {
  record: ConflictRecord;
  ctx: TextCtx;
  onApplied: (res: AdjustmentResult) => void;
  onShared?: () => void;
}) {
  const c = r.conflict;
  const [cands, setCands] = useState<AdjustmentCandidate[] | null>(null);
  const [polished, setPolished] = useState<Set<string>>(new Set());
  const [polishing, setPolishing] = useState(false);
  const [polishNote, setPolishNote] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sharedAt, setSharedAt] = useState<string | null>(r.shared_at);
  const [err, setErr] = useState<string | null>(null);
  const [person, setPerson] = usePerson();
  const who = useRef<HTMLInputElement>(null);

  const load = (polish = false) =>
    api.adjustmentCandidates(c.id, polish).then(
      (xs) => xs,
      (e) => {
        setErr(msg(e));
        return null;
      },
    );
  useEffect(() => {
    let live = true;
    void load().then((xs) => live && setCands(xs ?? []));
    return () => {
      live = false;
    };
  }, [c.id]); // 충돌이 바뀔 때만 다시 계산
  useEffect(() => setSharedAt(r.shared_at), [r.shared_at]);

  // 이유 문장만 LLM 으로 다듬는다 (후보·적용은 그대로 규칙). 다듬기가 안 되면 서버가 규칙 문장을 그대로 돌려준다
  const polish = async () => {
    if (!cands) return;
    setPolishing(true);
    setPolishNote(null);
    const xs = await load(true);
    setPolishing(false);
    if (!xs) return;
    const before = new Map(cands.map((x) => [x.id, x.reason]));
    const changed = new Set(xs.filter((x) => before.has(x.id) && before.get(x.id) !== x.reason).map((x) => x.id));
    setCands(xs);
    setPolished(changed);
    if (!changed.size) setPolishNote("AI 문장 다듬기를 쓸 수 없어 규칙 문장을 그대로 씁니다");
  };

  const needPerson = (what: string) => {
    if (person.trim()) return false;
    setErr(`${what}한 책임자 이름을 적어 주세요 (이행 기록에 남습니다)`);
    who.current?.focus();
    return true;
  };

  const apply = async (cand: AdjustmentCandidate) => {
    if (needPerson("적용")) return;
    setApplying(cand.id);
    setErr(null);
    try {
      onApplied(await api.applyAdjustment({ conflict_id: c.id, candidate_id: cand.id, decided_by: person.trim() }));
    } catch (e) {
      setErr(msg(e));
      if (msg(e).includes("유효하지")) void load().then((xs) => xs && setCands(xs)); // 409: 일정이 바뀜 → 후보 다시
      setApplying(null);
    }
  };

  const share = async () => {
    if (needPerson("공유")) return;
    setSharing(true);
    setErr(null);
    try {
      const rs = await api.share({ conflict_ids: [c.id], shared_by: person.trim() });
      setSharedAt(rs.find((x) => x.conflict.id === c.id)?.shared_at ?? new Date().toISOString());
      onShared?.();
    } catch (e) {
      setErr(msg(e));
    } finally {
      setSharing(false);
    }
  };

  const noCandidate =
    c.type === "sop_missing"
      ? "표준서 필수 단계 누락은 일정 이동으로 풀리지 않습니다. 협력사가 절차를 보완해 다시 제출해야 합니다."
      : c.task_ids.some((id) => ctx.taskById.get(id)?.zone_id === "ALL")
        ? "전 구역에 걸친 작업은 위치를 정해 다시 제출해야 합니다."
        : "규칙이 낼 수 있는 일정 이동안이 없습니다. 협력사와 협의해 다시 제출합니다.";

  return (
    <div className="sec">
      <span className="h">
        조정안 <span className="fx">F4</span> 규칙이 계산한 일정 이동 · 원청이 직접 적용합니다
        {cands && cands.length > 0 && (
          <button type="button" className="link" onClick={polish} disabled={polishing} style={{ marginLeft: 6 }}>
            {polishing ? "다듬는 중… (LLM, 1분까지 걸릴 수 있음)" : "AI로 문장 다듬기"}
          </button>
        )}
      </span>
      {polishNote && <p className="note">{polishNote}</p>}
      {cands === null && !err && <p className="note">조정안 계산 중…</p>}
      {cands && cands.length === 0 && <p className="note">{noCandidate}</p>}
      {cands?.map((cand) => {
        const t = ctx.taskById.get(cand.task_id);
        const n = cand.new_conflict_ids.length;
        return (
          <div key={cand.id} className="prop">
            <div>
              <div className="k">일정 이동{cand.recommended ? " · 추천" : ""}</div>
              <div>
                {polished.has(cand.id) && <span className="ai">AI 문장</span>}
                {cand.reason}
              </div>
              <div className="mv">
                <b>{t?.name ?? cand.task_id}</b> <span className="t">{rng(cand.original_start, cand.original_end)}</span> →{" "}
                <span className="t">
                  <b>{rng(cand.new_start, cand.new_end)}</b>
                </span>
              </div>
              <div className="eff">
                {cand.resolves ? "이 충돌 해소" : <span className="kw">이 충돌은 남음</span>} · 새 충돌 <b>{n}건</b>
                {n > 0 && ` (${cand.new_conflict_ids.join(", ")})`}
                {cand.affected_successors.length > 0 && ` · 영향 받는 후행 작업 ${cand.affected_successors.join(", ")}`}
              </div>
            </div>
            <button type="button" className={`btn ${cand.recommended ? "pri" : ""}`} onClick={() => apply(cand)} disabled={applying !== null}>
              {applying === cand.id ? "재판정 중…" : "적용"}
            </button>
          </div>
        );
      })}
      <div className="row2">
        <label htmlFor={`who-${c.id}`}>책임자</label>
        <input id={`who-${c.id}`} ref={who} type="text" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="이름 (이행 기록에 남음)" />
        {sharedAt ? (
          <span>
            <span className="pill mute">협력사 공유됨</span> {fmtDateTime(sharedAt)}
          </span>
        ) : (
          <button type="button" className="btn sm" onClick={share} disabled={sharing}>
            {sharing ? "공유 중…" : "조정 전에 공유"}
          </button>
        )}
      </div>
      <p className="note">
        공유하면 관련 협력사에게 자기 작업과 겹친 내용·위험 요소·인계 조건만 내려갑니다. 조정을 적용하면 함께 공유됩니다.
      </p>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/** 조정 적용 결과: 재대조로 해소·새로 생긴 충돌 · 되돌리기 (시안 renderDrawer "result") */
function AdjustResultDrawer({
  result,
  tasks,
  onClose,
  onOpen,
  onAdjusted,
}: Props & { result: AdjustmentResult; onClose: () => void }) {
  const a = result.record.adjustment;
  const d = result.diff;
  const ctx = useMemo(() => ({ taskById: new Map(tasks.map((t) => [t.id, t])) }), [tasks]);
  const target = d.resolved.find((x) => x.id === a.conflict_id);
  const t = ctx.taskById.get(a.task_id);
  const label = (x: Conflict) => conflictLabel(x, ctx);
  const byId = new Map(result.conflicts.map((x) => [x.id, x]));
  const [person, setPerson] = usePerson();
  const [state, setState] = useState<"idle" | "busy" | "done" | "gone">(result.record.status === "active" ? "idle" : "gone");
  const [undone, setUndone] = useState<AdjustmentResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 이력 탭 등에서 이미 되돌렸으면 되돌리기 단추를 숨긴다
  useEffect(() => {
    api
      .adjustments({ taskId: a.task_id })
      .then((rs) => {
        const x = rs.find((y) => y.adjustment.id === a.id);
        if (x && x.status !== "active") setState((s) => (s === "idle" ? "gone" : s));
      })
      .catch(() => {});
  }, [a.id, a.task_id]);

  const undo = async () => {
    if (!person.trim()) {
      setErr("되돌린 책임자 이름을 적어 주세요 (이행 기록에 남습니다)");
      return;
    }
    setState("busy");
    setErr(null);
    try {
      const res = await api.revertAdjustment(a.id, person.trim());
      writeLast(null);
      setUndone(res);
      setState("done");
      onAdjusted?.(res);
    } catch (e) {
      setErr(msg(e));
      setState(msg(e).includes("이미 되돌렸") ? "gone" : "idle");
    }
  };

  return (
    <Drawer
      label="조정 결과"
      onClose={onClose}
      head={
        <>
          <span className="pill ok">조정 적용</span>
          <span className="sub">
            {fmtDateTime(a.decided_at)} · {a.decided_by}
          </span>
        </>
      }
    >
      <h3>{target ? label(target) : a.conflict_id}</h3>
      <p style={{ margin: 0 }}>{a.reason}</p>
      <div className="mv">
        <b>{t?.name ?? a.task_id}</b> <span className="t">{rng(a.original_start, a.original_end)}</span> →{" "}
        <span className="t">
          <b>{rng(a.new_start, a.new_end)}</b>
        </span>
      </div>
      <div className="sec">
        <span className="h">재대조 결과 · {result.recheck_ms.toFixed(1)}ms</span>
        <ul className="res">
          {d.resolved.map((x) => (
            <li key={x.id}>
              <span className="pill ok">해소</span>
              <span>
                {label(x)} <span className="mono">{x.rule_id}</span>
              </span>
            </li>
          ))}
          {d.resolved.length === 0 && <li className="sub">해소된 충돌 없음</li>}
          {d.introduced.map((x) => (
            <li key={x.id}>
              <span className="pill ban">새 충돌</span>
              <span>
                <button type="button" className="link" style={{ padding: 0, whiteSpace: "normal", textAlign: "left" }} onClick={() => onOpen(x.id)}>
                  {label(x)}
                </button>{" "}
                <span className="mono">
                  {x.rule_id} · {x.grade}
                </span>
              </span>
            </li>
          ))}
          {d.grade_changed.map((g) => {
            const x = byId.get(g.conflict_id);
            return (
              <li key={g.conflict_id}>
                <span className="pill mute">등급 변화</span>
                <span>
                  {x ? label(x) : g.conflict_id} · {g.before} → {g.after}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {d.introduced.length > 0 && (
        <div className="case">
          조정 때문에 <span className="kw">새 충돌</span> <b>{d.introduced.length}건</b>이 생겼습니다. 다른 조정안을 고르거나 되돌리세요.
        </div>
      )}
      {state === "done" && undone ? (
        <div className="okbox" role="status">
          조정을 되돌렸습니다 · 다시 생긴 충돌 <b>{undone.diff.introduced.length}건</b> · 화면을 새로 고칩니다
        </div>
      ) : (
        <div className="row2">
          {state === "gone" ? (
            <span className="pill mute">이미 되돌린 조정</span>
          ) : (
            <>
              <label htmlFor="who-undo">책임자</label>
              <input id="who-undo" type="text" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="이름 (이행 기록에 남음)" />
              <button type="button" className="btn" onClick={undo} disabled={state === "busy"}>
                {state === "busy" ? "되돌리는 중…" : "되돌리기"}
              </button>
            </>
          )}
          <span>조정 결정과 책임자는 이력 탭에 이행 기록(제64조)으로 남고, 관련 협력사에 공유됐습니다.</span>
        </div>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </Drawer>
  );
}
