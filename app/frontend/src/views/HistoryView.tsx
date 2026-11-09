// 이력(F5): 시안(public/prototype #history) 배치를 서버 데이터로 — 숫자 4칸 · 제64조 이행 기록 표(구분 칩·CSV·엑셀) · 업체별 계획서 버전 · 공유 현황
// 아래에 조정 기록(F4, 원청은 되돌리기)을 둔다. 협력사로 보면 모든 목록을 서버가 자기 범위로 걸러 준다 (프론트에서 거르지 않는다)
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { fmtRange } from "@/lib/format";
import { mdhm, partyColor } from "@/lib/partyColor";
import { usePerson } from "@/lib/person";
import { useShell } from "@/lib/shell";
import type { AdjustmentRecord, AdjustmentResult, ConflictRecord, HistoryEvent, HistoryEventKind, PlanRecord, SharedItem, Task, ViewerRole } from "@/types";
import { PlanStatusChip } from "@/views/ApprovalPanel";
import "./s6.css";

interface Props {
  plans: PlanRecord[];
  tasks: Task[];
  contractor?: string; // 협력사로 보면 서버가 자기 것만 준다
  onAdjusted?: (result: AdjustmentResult) => void; // 원청이 조정을 되돌린 뒤 (있으면 [되돌리기]를 보여 준다)
  onViewAs?: (role: ViewerRole) => void; // 원청: 공유 현황에서 [그 회사 화면으로 보기]
}

const ADJ_STATUS: Record<AdjustmentRecord["status"], string> = { active: "적용 중", reverted: "되돌림", stale: "무효(재제출)" };
// 서버 기록 종류 → 화면 구분 이름. 현장 기록(field_record)의 구분(교대 인계·착수 승인 …)과 같은 이름은 칩 하나로 묶이게 시안 이름을 쓴다
const KIND_LABEL: Record<HistoryEventKind, string> = {
  plan_submitted: "계획서 제출",
  plan_approved: "원청 승인",
  plan_rejected: "원청 반려",
  conflict_judged: "충돌 판정",
  conflict_shared: "공유",
  adjustment_replaced: "조정 대체",
  adjustment_applied: "조정",
  conflict_resolved: "충돌 해소",
  adjustment_reverted: "되돌림",
  adjustment_stale: "조정 무효",
  tbm_checked: "TBM 확인",
  field_record: "현장 기록",
};
// 칩 순서 (시안 HTYPES 순서 + 서버에만 있는 구분)
const ORDER = [
  "전체 알림", "착수 보류", "착수 승인", "착수", "긴급 작업", "지연 보고", "잔업 계획", "잔업 승인", "교대 인계", "TBM 확인", "계획 변경", "반려", "재제출",
  "조정", "조정 대체", "되돌림", "조정 무효", "공유", "위험 공지", "알림", "충돌 해소", "판정", "계획 수정", "계획서 제출", "구조화", "충돌 판정",
];
// 구분 글자색 (시안 tc 와 같음)
const TYPE_COLOR: Record<string, string> = {
  "잔업 계획": "var(--amber)", "잔업 승인": "var(--ok)", "교대 인계": "var(--amber)", "전체 알림": "var(--red)", "착수 보류": "var(--red)",
  "긴급 작업": "var(--red)", "착수 승인": "var(--ok)", 착수: "var(--blue)", "TBM 확인": "var(--blue)", "지연 보고": "var(--red)",
  조정: "var(--blue)", "조정 대체": "var(--blue)", 공유: "var(--ok)", "계획 변경": "var(--red)", 반려: "var(--red)", 재제출: "var(--ok)",
  알림: "var(--red)", "위험 공지": "var(--amber)", 되돌림: "var(--amber)", "조정 무효": "var(--amber)", "충돌 해소": "var(--ok)",
};
const HIDDEN = "충돌 판정"; // 공정 전체 판정 줄은 수가 많아 [전체]에서는 숨기고 이 칩을 눌러야 보인다 (엑셀·CSV에는 모두 들어간다)
const ALL = "전체";

interface Row {
  e: HistoryEvent;
  type: string;
  sum: string; // 내용
  dec: string; // 결정
}

/** 기록 한 줄을 시안 표의 칸(구분·내용·결정)으로 나눈다. 현장 기록은 서버가 '요약 — 결정'으로 이어 붙여 둔다 */
function toRow(e: HistoryEvent): Row {
  const type = e.kind === "field_record" ? e.label ?? KIND_LABEL.field_record : KIND_LABEL[e.kind];
  const cut = e.detail.indexOf(" — ");
  if (cut > 0) return { e, type, sum: e.detail.slice(0, cut), dec: e.detail.slice(cut + 3) };
  const parties = e.contractors.join("·");
  switch (e.kind) {
    case "conflict_judged":
      return { e, type, sum: e.detail.replace(/^\[(금지|조건부|결함)\]\s*/, ""), dec: e.detail.match(/^\[(금지|조건부|결함)\]/)?.[1] ?? "" };
    case "conflict_shared":
      return { e, type, sum: `충돌 ${e.target_id} → ${parties}`, dec: e.detail };
    case "plan_submitted":
    case "tbm_checked":
      return { e, type, sum: parties ? `${parties} · ${e.detail}` : e.detail, dec: "" };
    default:
      return { e, type, sum: `충돌 ${e.target_id}${parties ? ` · ${parties}` : ""}`, dec: e.detail };
  }
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function HistoryView({ plans, tasks, contractor, onAdjusted, onViewAs }: Props) {
  const isPrime = !contractor;
  const { date } = useShell();
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [shares, setShares] = useState<SharedItem[]>([]);
  const [filter, setFilter] = useState(ALL);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [csvBox, setCsvBox] = useState<string | null>(null); // 복사가 막히면 내용을 펼쳐 보여 준다
  const [person, setPerson] = usePerson();
  const [reverting, setReverting] = useState<string | null>(null);
  const colorOf = useMemo(() => partyColor(tasks), [tasks]);
  const taskOf = (id: string) => tasks.find((t) => t.id === id);

  useEffect(() => {
    Promise.all([api.adjustments({ contractor }), api.conflicts({ contractor, includeResolved: true }), api.history(contractor), api.shares(contractor)])
      .then(([a, c, h, s]) => {
        setAdjustments(a);
        setConflicts(c);
        setEvents(h);
        setShares(s);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [contractor, plans]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const rows = useMemo(() => [...events].reverse().map(toRow), [events]); // 최신이 위
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return m;
  }, [rows]);
  const chips = useMemo(() => {
    const present = [...typeCounts.keys()];
    return [...ORDER.filter((t) => typeCounts.has(t)), ...present.filter((t) => !ORDER.includes(t))];
  }, [typeCounts]);
  const shown = filter === ALL ? rows.filter((r) => r.type !== HIDDEN) : rows.filter((r) => r.type === filter);
  const hiddenCount = typeCounts.get(HIDDEN) ?? 0;

  const open = conflicts.filter((r) => r.status === "open").length;
  const resolved = conflicts.filter((r) => r.status === "resolved").length;
  const activeAdj = adjustments.filter((r) => r.status === "active").length;

  // 업체별 계획서 버전 (서버가 협력사에게는 자기 제출만 준다)
  const planGroups = useMemo(() => {
    const m = new Map<string, PlanRecord[]>();
    for (const p of [...plans].sort((a, b) => b.version - a.version || b.id - a.id)) m.set(p.contractor, [...(m.get(p.contractor) ?? []), p]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans]);

  // 공유 현황: 업체별 공유 건수 · 미조치(열린) 충돌 건수
  const shareRows = useMemo(() => {
    const ofTask = new Map(tasks.map((t) => [t.id, t.contractor]));
    const partiesOf = (ids: string[]) => new Set(ids.map((id) => ofTask.get(id)).filter((c): c is string => !!c));
    const stat = new Map<string, { shared: number; open: number }>();
    const bump = (c: string, k: "shared" | "open") => {
      if (!c.startsWith("가상-")) return;
      const s = stat.get(c) ?? { shared: 0, open: 0 };
      s[k] += 1;
      stat.set(c, s);
    };
    for (const s of shares) for (const c of new Set([...partiesOf(s.my_task_ids), ...s.adjacent_tasks.map((t) => t.contractor)])) bump(c, "shared");
    for (const r of conflicts) if (r.status === "open") for (const c of partiesOf(r.conflict.task_ids)) bump(c, "open");
    let list = [...stat.entries()];
    if (contractor) list = list.filter(([c]) => c === contractor);
    if (contractor && !list.length) list = [[contractor, { shared: 0, open: 0 }]];
    return list.sort((a, b) => b[1].open - a[1].open || b[1].shared - a[1].shared || a[0].localeCompare(b[0]));
  }, [shares, conflicts, tasks, contractor]);

  const csvText = () =>
    [["시각", "구분", "내용", "결정", "책임자", "규칙", "근거"], ...rows.map((r) => [r.e.at.replace("T", " ").slice(0, 16), r.type, r.sum, r.dec, r.e.actor ?? "시스템", r.e.rule_id ?? "", r.e.legal_basis ?? ""])]
      .map((line) => line.map(csvCell).join(","))
      .join("\n");

  const downloadCsv = () => {
    try {
      const url = URL.createObjectURL(new Blob(["﻿" + csvText()], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `한솥밥_이행기록_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setFlash(`이행 기록 ${rows.length}건을 CSV 파일로 내려받았습니다`);
    } catch {
      setFlash("내려받기가 막혀 있습니다 · 복사를 눌러 주세요");
    }
  };
  const copyCsv = () => {
    const text = csvText();
    const fallback = () => {
      setCsvBox(text);
      setFlash("복사가 막혀 있어 내용을 펼쳤습니다");
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => setFlash(`이행 기록 ${rows.length}건을 CSV로 복사했습니다`), fallback);
    else fallback();
  };

  const revert = async (id: string) => {
    if (!person.trim()) {
      setError("되돌린 책임자 이름을 적어 주세요 (이행 기록에 남습니다)");
      return;
    }
    setReverting(id);
    setError(null);
    try {
      onAdjusted?.(await api.revertAdjustment(id, person.trim()));
    } catch (e) {
      setError((e as Error).message);
      setReverting(null);
    }
  };

  const stat = (k: string, v: number, d?: string) => (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">
        <span className="big">{v}</span>
        <small>건</small>
      </span>
      {d && <span className="d">{d}</span>}
    </div>
  );

  return (
    <div className="s6">
      {error && <p className="err" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="hgrid">
        {stat("착수 전 찾아낸 충돌 누계", conflicts.length, `해소 ${resolved} · 조정 적용 ${conflicts.filter((r) => r.status === "adjusted").length}`)}
        {stat("조정 결정", adjustments.length, `적용 중 ${activeAdj}`)}
        {stat("미조치", open, isPrime ? "열린 충돌 (공유 전 포함)" : "공유된 내 충돌 중 열린 것")}
        {stat("이행 기록", events.length, hiddenCount ? `충돌 판정 줄 ${hiddenCount} 포함` : undefined)}
      </div>

      <div className="two">
        <section className="card">
          <header>
            <h2>이행 기록</h2>
            <span className="sub">산안법 제64조 혼재작업 확인·조정 기록{contractor ? ` · ${contractor} 관련만 (서버에서 거름)` : ""}</span>
            <span className="grow" />
            {flash && <span className="flash" role="status">{flash}</span>}
            <button type="button" className="btn sm" onClick={downloadCsv}>
              CSV 내려받기
            </button>
            <button type="button" className="btn sm" onClick={copyCsv}>
              복사
            </button>
            <a className="btn sm" href={api.historyExportUrl(contractor)} download title="제64조 이행 기록 엑셀 (합성 데이터 표시, 보는 사람의 권한 범위만)">
              엑셀 내려받기
            </a>
          </header>
          <div style={{ padding: "10px 14px" }} className="filt">
            {[ALL, ...chips].map((t) => (
              <button key={t} type="button" className="fchip" aria-pressed={filter === t} onClick={() => setFilter(t)}>
                {t}
                <small>{t === ALL ? rows.length - hiddenCount : typeCounts.get(t)}</small>
              </button>
            ))}
            {filter === ALL && hiddenCount > 0 && <span className="sub">충돌 판정 줄 {hiddenCount}건은 [충돌 판정]을 눌러야 보입니다 (CSV·엑셀에는 모두)</span>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="lt">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>구분</th>
                  <th>내용</th>
                  <th>결정</th>
                  <th>책임자</th>
                  <th>근거</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      기록이 없습니다
                    </td>
                  </tr>
                ) : (
                  shown.map((r, i) => (
                    <tr key={`${r.e.target_id}-${r.e.kind}-${r.e.at}-${i}`}>
                      <td className="t" style={{ whiteSpace: "nowrap" }}>
                        {mdhm(r.e.at)}
                      </td>
                      <td>
                        <span className="ty" style={{ color: TYPE_COLOR[r.type] ?? "var(--ink-3)" }}>
                          {r.type}
                        </span>
                      </td>
                      <td>
                        {r.type === "반려" && <span className="hq">원청</span>} {r.sum}
                      </td>
                      <td>{r.dec}</td>
                      <td>{r.e.actor ?? "시스템"}</td>
                      <td>
                        {r.e.rule_id && <span className="mono">{r.e.rule_id}</span>} <span className="sub">{r.e.legal_basis}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {csvBox != null && (
            <div style={{ padding: "0 14px 14px" }}>
              <textarea className="csvta" readOnly value={csvBox} onFocus={(e) => e.currentTarget.select()} aria-label="이행 기록 CSV" />
            </div>
          )}
        </section>

        <section className="card">
          <header>
            <h2>계획서 버전</h2>
          </header>
          <div className="vers">
            {planGroups.length === 0 ? (
              <div className="ver">
                <span className="sub">아직 제출된 계획서가 없습니다</span>
              </div>
            ) : (
              planGroups.map(([c, ps]) => (
                <div key={c} className="ver">
                  <span className="nm">
                    <span className="dot" style={{ background: colorOf(c) }} />
                    <span>
                      {c} · v<b>{ps[0].version}</b>
                    </span>
                  </span>
                  <span className="sub">{ps[0].file}</span>
                  {ps.map((p) => (
                    <span key={p.id} className="sub">
                      v{p.version} · {mdhm(p.submitted_at)} · {p.submitted_by ?? "제출자 미기재"} · 작업 {p.task_count}건 <PlanStatusChip status={p.status} />
                      {p.decided_by && ` ${p.decided_by}`}
                      {p.decision_note && ` · ${p.decision_note}`}
                    </span>
                  ))}
                </div>
              ))
            )}
          </div>
          <header style={{ borderTop: "1px solid var(--line-2)" }}>
            <h2>공유 현황</h2>
            <span className="sub">{isPrime ? "업체별 공유한 충돌 · 열린 충돌" : "원청이 우리에게 공유한 충돌"}</span>
          </header>
          <div className="vers">
            {shareRows.length === 0 ? (
              <div className="ver">
                <span className="sub">공유했거나 열린 충돌이 없습니다</span>
              </div>
            ) : (
              shareRows.map(([c, s]) => (
                <div key={c} className="ver">
                  <span className="nm">
                    <span className="dot" style={{ background: colorOf(c) }} /> {c}
                  </span>
                  <span className="sub">
                    공유 <b>{s.shared}</b>건 · 미조치 <b>{s.open}</b>건
                  </span>
                  {isPrime && onViewAs && (
                    <span>
                      <button type="button" className="link" style={{ padding: 0 }} onClick={() => onViewAs({ kind: "contractor", contractor: c })}>
                        {c} 화면으로 보기
                      </button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <header>
          <h2>조정 기록</h2>
          <span className="fx">F4</span>
          <span className="sub">적용한 책임자가 남습니다{onAdjusted ? " · 되돌리면 협력사 원본 일정으로 돌아가고 바로 다시 판정합니다" : ""}</span>
          <span className="grow" />
          {onAdjusted && <input className="person" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="되돌린 책임자 (필수)" aria-label="되돌린 책임자" />}
        </header>
        {adjustments.length === 0 ? (
          <p className="empty">적용한 조정이 없습니다</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="lt">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>작업</th>
                  <th>이동</th>
                  <th>푼 충돌</th>
                  <th>책임자</th>
                  <th>상태</th>
                  {onAdjusted && <th />}
                </tr>
              </thead>
              <tbody>
                {adjustments.map((r) => {
                  const a = r.adjustment;
                  const t = taskOf(a.task_id);
                  return (
                    <tr key={a.id}>
                      <td className="t" style={{ whiteSpace: "nowrap" }}>
                        {mdhm(a.decided_at)}
                      </td>
                      <td>
                        <span className="mono">{a.task_id}</span> {t ? `${t.contractor} · ${t.name}` : ""}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {fmtRange(a.original_start, a.original_end)} → <b>{fmtRange(a.new_start, a.new_end)}</b>
                      </td>
                      <td className="mono">{a.conflict_id}</td>
                      <td>{a.decided_by}</td>
                      <td>
                        <span className={`pill ${r.status === "active" ? "ok" : "mute"}`}>{ADJ_STATUS[r.status]}</span>
                      </td>
                      {onAdjusted && (
                        <td>
                          {r.status === "active" && (
                            <button type="button" className="btn sm rej" onClick={() => revert(a.id)} disabled={reverting !== null} title="협력사 원본 일정으로 돌아가고 바로 재판정합니다">
                              {reverting === a.id ? "재판정 중…" : "되돌리기"}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
