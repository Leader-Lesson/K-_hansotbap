// 상황판 「지금 조치할 것」(원청) / 「원청에서 받은 공지」(협력사) 카드 — 시안 app.js renderActs
// 금지 → 조건부 → 결함 순, 같은 등급이면 아직 안 끝난 것·시작이 가까운 것 먼저. 카드를 누르면 충돌 상세 서랍이 열린다.
// 협력사는 서버가 걸러 준 것(원청이 공유한 자기 충돌 · 자기 작업에 걸린 조정 · 자기 업체 공지)만 받는다
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/api/client";
import { CONFLICT_TYPE_LABEL, GRADE_RANK } from "@/lib/format";
import { conflictSentence, md, whenText, type TextCtx } from "@/lib/conflictText";
import type { AdjustmentRecord, ConflictRecord, Grade, TbmItem, Task, ViewerRole, Zone } from "@/types";
import "./actions.css";

export const GRADE_VAR: Record<Grade, string> = { 금지: "var(--red)", 조건부: "var(--amber)", 결함: "var(--violet)" };
export const GRADE_PILL: Record<Grade, string> = { 금지: "ban", 조건부: "cond", 결함: "def" };

/** 그날 07~19시 안에 걸린 충돌 (상황판 dayConflicts 와 같은 모양) */
export interface DayItem {
  rec: ConflictRecord;
  h0: number;
  h1: number;
}

interface Props {
  role: ViewerRole;
  date: string; // YYYY-MM-DD
  now: number; // 시연 시각
  items: DayItem[];
  tasks: Task[];
  zones: Zone[];
  latestPlanId: number | null; // 가장 최근 제출 — 그 제출이 드러낸 충돌에 '최근 제출' 표시
  selectedId: string | null;
  onSelect: (conflictId: string | null) => void;
}

const ruleOf = (conflictId: string) => conflictId.split(":")[0];

export function ActionCards({ role, date, now, items, tasks, zones, latestPlanId, selectedId, onSelect }: Props) {
  const me = role.kind === "contractor" ? role.contractor : undefined;
  const isPrime = !me;
  const ctx: TextCtx = useMemo(
    () => ({ taskById: new Map(tasks.map((t) => [t.id, t])), zoneById: new Map(zones.map((z) => [z.id, z])), me }),
    [tasks, zones, me],
  );

  // 협력사: 원청이 우리 작업에 적용한 조정 · 원청이 우리 업체·이 날짜로 남긴 공지 (둘 다 서버가 자기 업체 것만 준다)
  const [adjs, setAdjs] = useState<AdjustmentRecord[]>([]);
  const [notices, setNotices] = useState<TbmItem[]>([]);
  useEffect(() => {
    if (!me) {
      setAdjs([]);
      setNotices([]);
      return;
    }
    api.adjustments({ contractor: me }).then(setAdjs).catch(() => setAdjs([]));
    api
      .tbmChecklist(me, date)
      .then((c) => setNotices(c.items.filter((i) => i.kind === "notice")))
      .catch(() => setNotices([]));
  }, [me, date, items]);

  const acts = [...items].sort(
    (a, b) =>
      GRADE_RANK[b.rec.conflict.grade] - GRADE_RANK[a.rec.conflict.grade] || Number(a.h1 <= now) - Number(b.h1 <= now) || a.h0 - b.h0,
  );
  const nPair = acts.filter((d) => d.rec.conflict.type !== "sop_missing").length;
  const nDef = acts.length - nPair;
  // 그날에 걸친 조정만: 원래 일정이나 옮긴 일정이 이 날짜를 지나는 것
  const touches = (s: string, e: string) => s.slice(0, 10) <= date && date <= e.slice(0, 10);
  const dayAdjs = adjs.filter(
    (r) => r.status === "active" && (touches(r.adjustment.original_start, r.adjustment.original_end) || touches(r.adjustment.new_start, r.adjustment.new_end)),
  );

  return (
    <section className="acts">
      <div className="acts-h">
        <h2>{isPrime ? "지금 조치할 것" : "원청에서 받은 공지"}</h2>
        <span className="big" style={{ fontSize: 22, ...(acts.length ? { color: "var(--red)" } : {}) }}>
          {acts.length}
        </span>
        <span className="sub">
          건 · 겹침 {nPair}
          {nDef ? ` + 계획 결함 ${nDef}` : ""} · 금지 먼저, 시작이 가까운 순 · 카드를 누르면 {isPrime ? "근거와 조정안이" : "근거가"} 오른쪽에 열립니다
        </span>
      </div>
      <div className="acts-grid">
        {acts.map(({ rec, h0, h1 }) => {
          const c = rec.conflict;
          const on = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className="ac"
              style={{ ["--c" as string]: GRADE_VAR[c.grade] } as CSSProperties}
              aria-pressed={on}
              aria-haspopup="dialog"
              onClick={() => onSelect(on ? null : c.id)}
            >
              <span className="top2">
                <span className={`pill ${GRADE_PILL[c.grade]}`}>{c.grade}</span>
                <span>{CONFLICT_TYPE_LABEL[c.type]}</span>
                {latestPlanId != null && rec.plan_id === latestPlanId && (
                  <span className="kw" style={{ fontSize: 12 }}>
                    최근 제출
                  </span>
                )}
                {rec.shared_at && <span className="pill mute">{isPrime ? "협력사 공유됨" : "원청 공유"}</span>}
                {rec.status === "adjusted" && <span className="pill ok">조정 적용</span>}
                <span className="when">{c.type !== "sop_missing" ? whenText(h0, h1, now) : ""}</span>
              </span>
              <p>{conflictSentence(c, [h0, h1], ctx)}</p>
              <span className="ev">
                {c.rule_id} · {c.legal_basis.split(" / ")[0].split(/;\s*/)[0]}
              </span>
            </button>
          );
        })}

        {!isPrime &&
          notices.map((n) => (
            <div key={n.id} className="ac" style={{ ["--c" as string]: "var(--blue)" } as CSSProperties}>
              <span className="top2">
                <span className="pill mute">원청 공지</span>
                <span className="hq">원청</span>
              </span>
              <p>{n.text}</p>
              {(n.rule_ids.length > 0 || n.legal_basis.length > 0) && (
                <span className="ev">{[n.rule_ids.join(", "), n.legal_basis[0]].filter(Boolean).join(" · ")}</span>
              )}
            </div>
          ))}

        {!isPrime &&
          dayAdjs.map((r) => {
            const a = r.adjustment;
            const t = ctx.taskById.get(a.task_id);
            return (
              <div key={a.id} className="ac" style={{ ["--c" as string]: "var(--ok)" } as CSSProperties}>
                <span className="top2">
                  <span className="pill ok">조정 반영</span>
                  <span className="hq">원청</span>
                  <span className="when">
                    {md(a.decided_at)} {a.decided_at.slice(11, 16)}
                  </span>
                </span>
                <p>
                  {t?.name ?? a.task_id}{" "}
                  <span className="t">
                    {md(a.original_start)} {a.original_start.slice(11, 16)}
                  </span>{" "}
                  →{" "}
                  <span className="t">
                    {md(a.new_start)} {a.new_start.slice(11, 16)}–{a.new_end.slice(0, 10) === a.new_start.slice(0, 10) ? "" : `${md(a.new_end)} `}
                    {a.new_end.slice(11, 16)}
                  </span>
                </p>
                <span className="ev">
                  {a.decided_by} · {ruleOf(a.conflict_id)}
                </span>
              </div>
            );
          })}

        {acts.length === 0 && (isPrime || (notices.length === 0 && dayAdjs.length === 0)) && (
          <div className="empty">{isPrime ? "이 날 조치할 겹침이 없습니다" : "이 날 원청이 공유한 충돌·공지가 없습니다"}</div>
        )}
      </div>
    </section>
  );
}
