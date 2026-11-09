// 올린 계획서 1건의 확인 화면: F1 추출 표(원문 근거 강조 · 기간·위치·인원 수정) + F8 작업표준서 매칭 열 → 제출(이 순간 F2 판정) → 판정 결과 요약
// 사람이 확인·수정한 뒤 제출한다. 고친 값은 제출할 때 판정에 들어간다(제출 전 미리 대조하는 API는 없다)
// 화면 모양은 시안(public/prototype) 업로드 팝업의 추출 표를 따른다. 스타일은 upload.css (.up-)
import { Fragment, useState, type ReactNode } from "react";
import { api } from "@/api/client";
import { UNKNOWN_COMPANY, docCompanies, type PlanDraft, type PlanOutcome } from "@/components/planDraft";
import { CONFLICT_TYPE_LABEL, HAZARD_LABEL } from "@/lib/format";
import { PROJECT_D0, dayNo, shiftDay } from "@/lib/shell";
import type { Conflict, ExtractedTask, Grade, PlanExtraction, PlanRecord, SopMatch, Task, ViewerRole, Zone } from "@/types";

interface Props {
  extraction: PlanExtraction;
  draft: PlanDraft;
  setDraft: (fn: (d: PlanDraft) => PlanDraft) => void;
  outcome: PlanOutcome | null;
  role: ViewerRole;
  contractors: string[]; // 원청이 고를 제출 협력사
  zones: Zone[];
  knownTasks: Task[]; // 선행 작업 이름 찾기 (서버가 권한대로 걸러 준 현재 일정)
  plans: PlanRecord[]; // 다음 버전 번호 (v1 · v2 …)
  onSubmitted: (o: PlanOutcome) => void;
  onFinish: () => void; // 창을 닫고 화면 새로고침
}

const GRADE_PILL: Record<Grade, string> = { 금지: "ban", 조건부: "cond", 결함: "def" };
const PRIMARY_FIRST = (a: SopMatch, b: SopMatch) => Number(b.primary) - Number(a.primary) || b.score - a.score;

export function PlanUpload({ extraction, draft, setDraft, outcome, role, contractors, zones, knownTasks, plans, onSubmitted, onFinish }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSteps, setOpenSteps] = useState<string | null>(null);

  const isPrime = role.kind === "prime";
  const done = outcome != null;
  const { tasks, confirmed } = draft;
  const submitAs = draft.contractor;
  const reviewOf = (id: string): ExtractedTask | undefined => extraction.tasks.find((t) => t.task.id === id);
  const matchesOf = (id: string) => extraction.sop_matches.filter((m) => m.task_id === id).sort(PRIMARY_FIRST);
  const nameOf = (id: string) => tasks.find((t) => t.id === id)?.name ?? knownTasks.find((t) => t.id === id)?.name;

  // ── 고치기: 값을 고치면 그 작업은 사람이 확인한 것으로 본다 (시안과 같음)
  const patch = (id: string, fn: (t: Task) => Task) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? fn(t) : t)), confirmed: { ...d.confirmed, [id]: true } }));
  const setConfirmed = (id: string, v: boolean) => setDraft((d) => ({ ...d, confirmed: { ...d.confirmed, [id]: v } }));
  const setZone = (id: string, zone_id: string) => patch(id, (t) => ({ ...t, zone_id }));
  const setCrew = (id: string, v: string) =>
    patch(id, (t) => ({ ...t, crew: v.trim() === "" ? null : Math.max(0, Math.round(Number(v)) || 0) }));
  // 날짜만 바꾸고 시각은 그대로. 시작이 종료를 넘으면(또는 반대) 다른 쪽도 같은 날수만큼 옮겨 기간을 지킨다
  const setDate = (id: string, which: "start" | "end", d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    patch(id, (t) => {
      const delta = dayNo(d) - dayNo(t[which]);
      const next = { ...t, [which]: d + t[which].slice(10) };
      if (next.start < next.end) return next;
      const other = which === "start" ? "end" : "start";
      return { ...next, [other]: shiftDay(t[other].slice(0, 10), delta) + t[other].slice(10) };
    });
  };

  // ── 제출 전 확인
  const fromDoc = docCompanies(tasks);
  const mismatch = submitAs ? fromDoc.filter((c) => c !== submitAs) : [];
  const unconfirmed = tasks.filter((t) => !confirmed[t.id]);
  const noZone = tasks.filter((t) => !zones.some((z) => z.id === t.zone_id));
  const primaryMissing = extraction.sop_matches.filter((m) => m.primary && m.missing_steps.length > 0);
  const needReview = extraction.tasks.filter((t) => t.needs_review).length;
  const blockers = [
    !submitAs && "제출 협력사를 골라 주세요",
    unconfirmed.length > 0 && `확인하지 않은 작업 ${unconfirmed.length}건 — 값을 보고 '확인'에 표시해 주세요`,
    noZone.length > 0 && `구역을 고르지 않은 작업 ${noZone.length}건`,
  ].filter(Boolean) as string[];
  const nextVersion = plans.filter((p) => p.contractor === submitAs).length + 1;
  const options = [...new Set([...contractors, ...fromDoc])].sort();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // 업체를 못 읽은 작업은 제출 협력사로 낸다. 문서의 업체와 다르면 위에서 막는다(서버도 422로 막는다)
      const body = tasks.map((t) => (!t.contractor || t.contractor === UNKNOWN_COMPANY ? { ...t, contractor: submitAs } : t));
      const result = await api.submitPlan({
        contractor: submitAs,
        file: extraction.file,
        tasks: body,
        draft_id: extraction.draft_id,
        submitted_by: draft.submittedBy.trim() || null,
      });
      let revealed: Conflict[] | null = null;
      let touching: Conflict[] | null = null;
      if (isPrime) {
        // 제출 응답은 협력사에게 공유된 것만 담는다. 원청은 저장된 전체 판정에서 이 제출이 드러낸 충돌을 읽는다
        const ids = new Set(body.map((t) => t.id));
        const all = await api.conflicts().catch(() => null);
        if (all) {
          revealed = all.filter((r) => r.plan_id === result.plan.id).map((r) => r.conflict);
          touching = all.filter((r) => r.conflict.task_ids.some((id) => ids.has(id))).map((r) => r.conflict);
        }
      }
      onSubmitted({ result, revealed, touching });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {outcome && <ResultCard outcome={outcome} isPrime={isPrime} onFinish={onFinish} />}

      <div className="up-sec">
        <span className="h">
          {extraction.file} 추출 결과{" "}
          {extraction.method === "llm" ? (
            <span className="up-ai" title={`${extraction.provider ?? ""} ${extraction.model ?? ""}`.trim()}>
              AI 추출
            </span>
          ) : (
            <span className="up-rule" title="표 머리글을 규칙으로 읽었습니다 (LLM을 부르지 않음)">
              표 규칙
            </span>
          )}
          {done ? "제출한 값입니다" : "값을 고치면 제출할 때 다시 판정합니다"} · 원문에서 <mark>노란 부분</mark>이 추출에 쓴 값
        </span>

        <div className="up-row2">
          <span className="up-chip">작업 {tasks.length}건</span>
          {fromDoc.length > 0 && <span className="up-chip">문서의 업체 {fromDoc.join(", ")}</span>}
          {needReview > 0 && <span className="up-chip warn">확인 필요 {needReview}건</span>}
          {primaryMissing.length > 0 && <span className="up-chip def">제출하면 표준서 누락 결함 {primaryMissing.length}건</span>}
          {extraction.cached && <span className="up-chip">같은 파일의 이전 추출 결과</span>}
          {extraction.warnings.map((w, i) => (
            <span key={i} className="up-chip warn">
              {w}
            </span>
          ))}
        </div>

        {isPrime && !done && (
          <label className="up-row2">
            제출 협력사
            <select
              value={submitAs}
              onChange={(e) => setDraft((d) => ({ ...d, contractor: e.target.value }))}
              aria-label="제출 협력사"
              style={!submitAs ? { borderColor: "var(--amber)" } : undefined}
            >
              {!submitAs && <option value="">고르세요</option>}
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="up-sub">원청이 협력사 대신 올리는 경우 · 문서에 적힌 업체로 고릅니다</span>
          </label>
        )}

        {mismatch.length > 0 && !done && (
          <p className="up-alert">
            {isPrime ? (
              <>
                이 계획서의 업체는 <b>{mismatch.join(", ")}</b>입니다. 제출 협력사를 <b>{mismatch[0]}</b>(으)로 고르세요.
              </>
            ) : (
              <>
                이 계획서의 업체는 <b>{mismatch.join(", ")}</b>입니다. 지금 <b>{submitAs}</b>(으)로 보고 있어 제출할 수 없습니다 — 오른쪽 위
                "보는 사람"을 <b>{mismatch[0]}</b>(으)로 바꾼 뒤 다시 올려 주세요.
              </>
            )}
          </p>
        )}

        <div className="up-xt-wrap">
          <table className="up-xt">
            <thead>
              <tr>
                <th>확인</th>
                <th>작업 · 원문 근거</th>
                <th>기간 (날짜 입력 · 일차 자동)</th>
                <th>시간 · 주야간</th>
                <th>위치</th>
                <th>인원</th>
                <th>유형</th>
                <th>선행 조건</th>
                <th>작업표준서 매칭</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const r = reviewOf(t.id);
                const ms = matchesOf(t.id);
                const top = ms[0];
                const missList = ms.filter((m) => m.primary && m.missing_steps.length > 0); // 주 표준서마다 결함 1건 (rules/engine.py defects_from_sop)
                const zoneOk = zones.some((z) => z.id === t.zone_id);
                const d0 = dayNo(t.start), d1 = dayNo(t.end);
                return (
                  <Fragment key={t.id}>
                    <tr className={confirmed[t.id] ? "" : "need"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!confirmed[t.id]}
                          disabled={done}
                          onChange={(e) => setConfirmed(t.id, e.target.checked)}
                          aria-label={`${t.id} 확인`}
                        />
                        {r?.needs_review && <div className="up-flag">신뢰도 {r.confidence.toFixed(2)}</div>}
                      </td>
                      <td>
                        <span className="up-mono">{t.id}</span> {t.name}
                        {r?.wbs_id && r.wbs_id !== t.id && <span className="up-sub"> · 기준 {r.wbs_id}</span>}
                        {(r?.sources.length ? r.sources : t.source ? [t.source] : []).map((s, i) => (
                          <div key={i} className="up-srcq" title={s.text}>
                            {s.locator && <span className="loc">{s.locator}</span>}
                            {highlight(s.text, r ? needlesOf(r) : [])}
                          </div>
                        ))}
                        {r?.warnings.map((w, i) => (
                          <div key={i} className="up-flag">
                            {w}
                          </div>
                        ))}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <input
                          type="date"
                          min={PROJECT_D0}
                          value={t.start.slice(0, 10)}
                          disabled={done}
                          onChange={(e) => setDate(t.id, "start", e.target.value)}
                          aria-label={`${t.id} 시작 날짜`}
                        />{" "}
                        ~{" "}
                        <input
                          type="date"
                          min={PROJECT_D0}
                          value={t.end.slice(0, 10)}
                          disabled={done}
                          onChange={(e) => setDate(t.id, "end", e.target.value)}
                          aria-label={`${t.id} 종료 날짜`}
                        />
                        <div className="up-sub">
                          D<b>{d0}</b>~D<b>{d1}</b> · {d1 - d0 + 1}일
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="up-t">
                          {t.start.slice(11, 16)}–{t.end.slice(11, 16)}
                        </span>
                        <div className="up-sub">{shiftLabel(t)}</div>
                      </td>
                      <td>
                        <select
                          value={t.zone_id}
                          disabled={done}
                          onChange={(e) => setZone(t.id, e.target.value)}
                          aria-label={`${t.id} 위치`}
                          style={!zoneOk ? { borderColor: "var(--amber)", background: "var(--amber-soft)" } : undefined}
                        >
                          {!zoneOk && <option value={t.zone_id}>{t.zone_id ? `${t.zone_id} (구역 선택 필요)` : "구역 선택 필요"}</option>}
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                        {r?.raw.location && <div className="up-sub">원문: {r.raw.location}</div>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <input
                          type="number"
                          min={0}
                          value={t.crew ?? ""}
                          disabled={done}
                          onChange={(e) => setCrew(t.id, e.target.value)}
                          className={t.crew == null ? "empty" : ""}
                          title={r?.raw.crew ? `원문: ${r.raw.crew}` : "계획서에 인원이 없습니다"}
                          aria-label={`${t.id} 인원`}
                        />{" "}
                        명
                      </td>
                      <td>{t.hazards.map((h) => HAZARD_LABEL[h]).join("·") || "—"}</td>
                      <td style={{ minWidth: 120 }}>
                        {t.predecessors.length ? (
                          t.predecessors.map((id) => (
                            <div key={id}>
                              <span className="up-mono">{id}</span> {nameOf(id) ?? ""}
                            </div>
                          ))
                        ) : (
                          <span className="up-sub">없음</span>
                        )}
                        {r?.raw.precondition && <div className="up-sub">원문: {r.raw.precondition}</div>}
                      </td>
                      <td>
                        {top ? (
                          <>
                            <span className="up-mono">{top.sop_id}</span> {top.title}
                            <div className="up-sub" title={top.reason}>
                              신뢰도 {top.score.toFixed(2)} · {top.primary ? "주 표준서" : "참고"} · 매칭 이유: {basisText(top)}
                            </div>
                            {missList.map((m) => (
                              <div key={m.sop_id} className="up-miss">
                                필수 단계 누락{m.sop_id !== top.sop_id ? ` (${m.sop_id})` : ""}: {m.missing_steps.join(", ")}
                              </div>
                            ))}
                            {missList.length > 0 && <div className="up-miss">→ 제출하면 결함 {missList.length}건</div>}
                            <button
                              type="button"
                              className="up-link"
                              aria-expanded={openSteps === t.id}
                              onClick={() => setOpenSteps(openSteps === t.id ? null : t.id)}
                            >
                              {openSteps === t.id ? "단계 접기 ▲" : `단계 보기 ▼${ms.length > 1 ? ` · 표준서 ${ms.length}건` : ""}`}
                            </button>
                          </>
                        ) : (
                          <span className="up-sub">매칭된 표준서가 없습니다</span>
                        )}
                      </td>
                    </tr>
                    {openSteps === t.id && ms.length > 0 && (
                      <tr className="steps">
                        <td />
                        <td colSpan={8}>
                          <SopSteps matches={ms} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && <pre className="up-alert">{error}</pre>}

      {!done && (
        <div className="up-submit">
          <input
            type="text"
            value={draft.submittedBy}
            onChange={(e) => setDraft((d) => ({ ...d, submittedBy: e.target.value }))}
            placeholder="제출자 (선택)"
            aria-label="제출자"
          />
          <button type="button" className="up-btn pri" onClick={submit} disabled={busy || blockers.length > 0 || mismatch.length > 0}>
            {busy ? "판정 중…" : `${submitAs ? `v${nextVersion} ` : ""}제출 → 충돌 판정`}
          </button>
          {blockers.length > 0 ? (
            <span className="up-flag">{blockers.join(" · ")}</span>
          ) : (
            <span className="up-sub">제출 순간 전체 일정과 대조해 판정합니다. 시스템은 작업을 승인·중지하지 않습니다.</span>
          )}
        </div>
      )}
    </>
  );
}

/** 표준서 필수 단계: 계획서에 있으면 ✓, 핵심 단계가 없으면 ✗(결함), 핵심 아닌 단계가 없으면 — */
function SopSteps({ matches }: { matches: SopMatch[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {matches.map((m) => (
        <div key={m.sop_id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <span className="up-mono">{m.sop_id}</span> <b>{m.title}</b>
            <span className="up-sub">
              {" "}
              · {m.primary ? "주 표준서 (빠진 핵심 단계는 결함)" : "참고"} · 신뢰도 {m.score.toFixed(2)} · 매칭 이유: {m.reason}
            </span>
          </div>
          <ol className="up-stds">
            {m.steps.map((s) => (
              <li key={s.no} className={s.found ? "" : s.critical ? "miss" : "opt"}>
                <span className="no">{s.no}.</span>
                <span aria-label={s.found ? "있음" : "없음"}>{s.found ? "✓" : s.critical ? "✗" : "—"}</span>
                <span>
                  {s.text}
                  {s.critical && <span className="up-crit">핵심</span>}
                  {!s.found && s.critical && " · 계획서에 빠짐"}
                  {s.evidence && (
                    <span className="ev" title={s.evidence.locator ?? ""}>
                      {" "}
                      · 원문 “{clip(s.evidence.text, 70)}”
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** 제출 결과 요약. 협력사는 원청이 공유한 충돌만 보고, 원청은 이 제출이 드러낸 충돌을 본다 */
function ResultCard({ outcome, isPrime, onFinish }: { outcome: PlanOutcome; isPrime: boolean; onFinish: () => void }) {
  const { result: r, revealed, touching } = outcome;
  const intro = r.diff?.introduced ?? [];
  const gone = r.diff?.resolved ?? [];
  const list = isPrime ? revealed : r.conflicts;
  return (
    <div className="up-result" role="status">
      <div className="hd">
        <b>
          {r.plan.contractor} 계획서 v{r.plan.version} 제출 완료
        </b>
        <span className="up-sub">
          작업 {r.plan.task_count}건 · 제출 순간 전체 일정 판정{r.recheck_ms != null ? ` ${r.recheck_ms.toFixed(1)}ms` : ""}
        </span>
      </div>
      {isPrime ? (
        revealed ? (
          <span className="up-row2">
            이 제출로 새로 드러난 충돌 <b>{revealed.length}</b>건{revealed.length > 0 && ` (${gradeCount(revealed)})`}
            {touching ? ` · 이 계획서 작업이 걸린 미해결 충돌 ${touching.length}건` : ""}
          </span>
        ) : (
          <span className="up-flag">판정 결과를 읽지 못했습니다. 상황판에서 확인해 주세요.</span>
        )
      ) : (
        <span className="up-row2">
          충돌 판정 결과는 원청 확인 후 공유됩니다 · 지금 공유된 충돌 <b>{r.conflicts.length}</b>건
          {intro.length > 0 && ` · 새로 생긴 공유 충돌 ${intro.length}건`}
          {gone.length > 0 && ` · 해소된 공유 충돌 ${gone.length}건`}
        </span>
      )}
      {list && list.length > 0 && (
        <ul>
          {list.slice(0, 6).map((c) => (
            <li key={c.id}>
              <span className={`up-pill ${GRADE_PILL[c.grade]}`}>{c.grade}</span>
              <span>
                <b>{CONFLICT_TYPE_LABEL[c.type]}</b> <span className="up-mono">{c.task_ids.join(" ↔ ")} · {c.rule_id}</span> {clip(c.reason, 90)}
              </span>
            </li>
          ))}
          {list.length > 6 && <li className="up-sub">외 {list.length - 6}건 — 상황판에서 모두 봅니다</li>}
        </ul>
      )}
      <div className="up-row2">
        <button type="button" className="up-btn pri" onClick={onFinish}>
          닫고 화면에 반영
        </button>
        <span className="up-sub">판정이 끝나 화면을 한 번 새로고침합니다. 다른 계획서를 더 올린 뒤 닫아도 됩니다.</span>
      </div>
    </div>
  );
}

// ── 표시 도우미 ─────────────────────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 표 칸에 넣는 짧은 매칭 이유: 서버가 준 매칭 근거(basis). 긴 설명(reason)은 '단계 보기'와 말풍선에 */
const BASIS_LABEL: Record<string, string> = { wbs_example: "원청 적용 목록", name: "작업명", hazard: "작업 유형", embedding: "작업 설명 문장" };
const basisText = (m: SopMatch) => {
  if (m.basis.length === 1 && m.basis[0] === "embedding") return "작업 설명 문장이 가장 비슷함";
  const labels = m.basis.filter((b) => b !== "embedding").map((b) => BASIS_LABEL[b] ?? b);
  return labels.length ? `${labels.join("·")} 일치` : clip(m.reason, 40);
};

function gradeCount(cs: Conflict[]): string {
  const n = (g: Grade) => cs.filter((c) => c.grade === g).length;
  return (["금지", "조건부", "결함"] as Grade[])
    .filter((g) => n(g))
    .map((g) => `${g} ${n(g)}`)
    .join(" · ");
}

/** 주야간: 계획서의 근무 구분, 없으면 시각으로. 주간조 07:00–19:00 · 야간조 19:00–07:00 [팀 설정값] (시안 README의 2교대) */
function shiftLabel(t: Task): string {
  if (t.shift === "day") return "주간";
  if (t.shift === "night") return "야간";
  const h0 = Number(t.start.slice(11, 13)), h1 = Number(t.end.slice(11, 13)) || 24;
  if (h0 >= 7 && h1 <= 19) return "주간";
  if (h0 >= 19 || h1 <= 7) return "야간";
  return "주·야간";
}

/** 원문에 적힌 그대로의 값(raw) 중 원문 강조에 쓸 것: 기간·시간·주야간·위치·인원·유형·선행 조건 (작업명·업체는 빼고) */
function needlesOf(r: ExtractedTask): string[] {
  const keys = ["period", "time", "shift", "location", "crew", "hazards", "precondition"];
  return keys
    .flatMap((k) => (r.raw[k] ?? "").split(/\s*~\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/** 원문 문장에서 추출에 쓴 부분을 <mark>로. 숫자만인 값(인원 '14')은 날짜·시각 속 숫자에 붙지 않게 따로 떨어진 것만 */
function highlight(text: string, needles: string[]): ReactNode {
  const marks: [number, number][] = [];
  for (const n of needles) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(/^\d+$/.test(n) ? `(?<![\\d.:/-])${esc}(?![\\d.:/-])` : esc, "g");
    for (const m of text.matchAll(re)) marks.push([m.index, m.index + m[0].length]);
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([...m]);
  }
  const out: ReactNode[] = [];
  let at = 0;
  merged.forEach(([a, b], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}
