// F1 계획서 올리기 → 구조화 결과 확인(원문 근거·확인 필요) → F8 표준서 매칭 확인 → 제출(이 순간 F2 판정)
// 사람이 확인·수정한 뒤 제출한다. 구역은 고를 수 있고(파서가 못 읽은 구역 보정), 나머지는 원문 그대로 낸다
import { useState } from "react";
import { api } from "@/api/client";
import { SopMatchPanel } from "@/components/SopMatchPanel";
import { HAZARD_LABEL, fmtRange } from "@/lib/format";
import type { ExtractedTask, PlanExtraction, PlanSubmitResult, Task, Zone } from "@/types";

interface Props {
  contractor: string;
  zones: Zone[];
  onSubmitted: (result: PlanSubmitResult) => void;
}

export function PlanUpload({ contractor, zones, onSubmitted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"upload" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<PlanExtraction | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submittedBy, setSubmittedBy] = useState("");

  const upload = async () => {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const ext = await api.uploadPlan(file, { contractor });
      setExtraction(ext);
      setTasks(ext.tasks.map((t) => ({ ...t.task, contractor: t.task.contractor || contractor })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!extraction) return;
    setBusy("submit");
    setError(null);
    try {
      const result = await api.submitPlan({
        contractor,
        file: extraction.file,
        tasks,
        draft_id: extraction.draft_id,
        submitted_by: submittedBy.trim() || null,
      });
      onSubmitted(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setZone = (id: string, zone_id: string) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, zone_id } : t)));
  const reviewOf = (id: string): ExtractedTask | undefined => extraction?.tasks.find((t) => t.task.id === id);
  const needsReview = extraction?.tasks.filter((t) => t.needs_review).length ?? 0;
  const primaryMissing = extraction?.sop_matches.filter((m) => m.primary && m.missing_steps.length > 0) ?? [];

  return (
    <section className="rounded-lg bg-white p-4 text-sm shadow-sm">
      <h3 className="mb-2 font-semibold">계획서 올리기 (HWPX · 엑셀 · PDF)</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".hwpx,.xlsx,.xls,.pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setExtraction(null);
          }}
          className="text-sm"
        />
        <button
          type="button"
          onClick={upload}
          disabled={!file || busy !== null}
          className="rounded bg-sky-700 px-3 py-1.5 font-medium text-white disabled:opacity-40"
        >
          {busy === "upload" ? "읽는 중…" : "구조화 (F1)"}
        </button>
        <span className="text-xs text-stone-500">제출 순간 전체 일정과 대조해 판정합니다. 시스템은 작업을 승인·중지하지 않습니다.</span>
      </div>

      {error && <pre className="mt-3 whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">{error}</pre>}

      {extraction && (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span className="rounded bg-stone-100 px-2 py-0.5">{extraction.file}</span>
            <span>작업 {extraction.tasks.length}건</span>
            <span>추출 방법 {extraction.method === "llm" ? `LLM (${extraction.provider ?? ""} ${extraction.model ?? ""})` : "표 규칙"}</span>
            {extraction.cached && <span>이전 결과 재사용</span>}
            {needsReview > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">확인 필요 {needsReview}건</span>}
            {extraction.warnings.map((w, i) => (
              <span key={i} className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                {w}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">작업</th>
                  <th className="p-2">구역</th>
                  <th className="p-2">기간</th>
                  <th className="p-2">위험작업</th>
                  <th className="p-2">선행</th>
                  <th className="p-2">신뢰도</th>
                  <th className="p-2">원문 근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {tasks.map((t) => {
                  const r = reviewOf(t.id);
                  return (
                    <tr key={t.id} className={r?.needs_review ? "bg-amber-50/60" : ""}>
                      <td className="p-2 font-semibold">{t.id}</td>
                      <td className="p-2">{t.name}</td>
                      <td className="p-2">
                        <select value={t.zone_id} onChange={(e) => setZone(t.id, e.target.value)} className="rounded border border-stone-300 bg-white px-1 py-0.5">
                          {!zones.some((z) => z.id === t.zone_id) && <option value={t.zone_id}>{t.zone_id} (구역 선택 필요)</option>}
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap p-2">{fmtRange(t.start, t.end)}</td>
                      <td className="p-2">{t.hazards.map((h) => HAZARD_LABEL[h]).join(", ") || "—"}</td>
                      <td className="p-2">{t.predecessors.join(", ") || "—"}</td>
                      <td className="p-2">{r ? `${Math.round(r.confidence * 100)}%` : ""}</td>
                      <td className="max-w-[260px] p-2 text-stone-500" title={r?.sources.map((s) => s.text).join("\n")}>
                        {r?.sources[0]
                          ? `${r.sources[0].locator ?? ""} "${r.sources[0].text.slice(0, 50)}${r.sources[0].text.length > 50 ? "…" : ""}"`
                          : "—"}
                        {r?.warnings.length ? <div className="text-amber-700">{r.warnings.join(" · ")}</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="mb-1 font-semibold">
              작업표준서 매칭 (F8)
              {primaryMissing.length > 0 && (
                <span className="ml-2 rounded border border-purple-300 bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-800">
                  제출하면 결함 {primaryMissing.length}건
                </span>
              )}
            </h4>
            <SopMatchPanel matches={extraction.sop_matches} tasks={tasks} emptyText="이 계획서의 작업에 해당하는 표준서가 없습니다." />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
            <input
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="제출자 (선택)"
              className="rounded border border-stone-300 px-2 py-1"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy !== null}
              className="rounded bg-emerald-700 px-3 py-1.5 font-medium text-white disabled:opacity-40"
            >
              {busy === "submit" ? "판정 중…" : "제출 → 충돌 판정 (F2)"}
            </button>
            <span className="text-xs text-stone-500">구역이 넓게 잡히면 판정이 거칠어집니다. 가능한 한 정확한 구역을 고르세요.</span>
          </div>
        </div>
      )}
    </section>
  );
}
