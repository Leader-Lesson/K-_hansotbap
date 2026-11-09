import type {
  AdjustmentApply,
  AdjustmentCandidate,
  AdjustmentRecord,
  AdjustmentResult,
  ConflictRecord,
  OverlapCandidate,
  PlanExtraction,
  PlanRecord,
  PlanSubmission,
  PlanSubmitResult,
  SopInfo,
  SopMatch,
  Task,
  Zone,
} from "@/types";

/** 서버 오류 본문(detail)을 사람이 읽을 문장으로 */
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    const d = body.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "problems" in d) {
      const p = d as { message?: string; problems?: string[] };
      return [p.message, ...(p.problems ?? [])].filter(Boolean).join("\n");
    }
    return text || `${res.status}`;
  } catch {
    return text || `${res.status}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const json = <T>(path: string, method: string, body: unknown) =>
  request<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** 협력사로 보면 `contractor`를 붙인다 — 권한은 서버에서 거른다 (프론트 필터로 대신하지 않는다) */
function qs(params: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === false || v === "") continue;
    q.set(k, v === true ? "true" : v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  zones: () => get<Zone[]>("/zones"),
  tasks: () => get<Task[]>("/tasks"),
  overlaps: () => get<OverlapCandidate[]>("/overlaps"),

  // ── F2 판정 결과 ───────────────────────────────────────────────────
  conflicts: (opts: { contractor?: string; includeResolved?: boolean } = {}) =>
    get<ConflictRecord[]>(`/conflicts${qs({ contractor: opts.contractor, include_resolved: opts.includeResolved })}`),

  // ── F1 계획서 업로드 → 구조화 → 제출(이 순간 F2 판정) ──────────────
  uploadPlan: async (file: File, opts: { contractor?: string; refresh?: boolean } = {}) => {
    const body = new FormData();
    body.append("file", file);
    if (opts.contractor) body.append("contractor", opts.contractor);
    const res = await fetch(`/api/plans${qs({ refresh: opts.refresh })}`, { method: "POST", body });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json() as Promise<PlanExtraction>;
  },
  submitPlan: (sub: PlanSubmission) => json<PlanSubmitResult>("/plans/submit", "POST", sub),
  plans: (contractor?: string) => get<PlanRecord[]>(`/plans${qs({ contractor })}`),

  // ── F8 작업표준서 ──────────────────────────────────────────────────
  sops: () => get<SopInfo[]>("/sops"),
  sop: (id: string) => get<SopInfo>(`/sops/${encodeURIComponent(id)}`),
  // 현재 일정(협력사별 최근 제출분)의 작업별 표준서 매칭. 협력사로 보면 자기 작업만
  sopMatches: (contractor?: string) => get<SopMatch[]>(`/sop-matches${qs({ contractor })}`),

  // ── F4 조정안 (원청 전용 — 협력사로 부르면 서버가 403) ─────────────
  // 충돌 ID에는 ':'와 '>'가 들어가므로 경로에 넣을 때 encodeURIComponent 를 쓴다
  adjustmentCandidates: (conflictId: string, polish = false) =>
    get<AdjustmentCandidate[]>(`/conflicts/${encodeURIComponent(conflictId)}/adjustments${qs({ polish })}`),
  applyAdjustment: (body: AdjustmentApply) => json<AdjustmentResult>("/adjustments", "POST", body),
  revertAdjustment: (adjustmentId: string, decidedBy: string) =>
    request<AdjustmentResult>(`/adjustments/${encodeURIComponent(adjustmentId)}${qs({ decided_by: decidedBy })}`, {
      method: "DELETE",
    }),
  adjustments: (opts: { contractor?: string; taskId?: string } = {}) =>
    get<AdjustmentRecord[]>(`/adjustments${qs({ contractor: opts.contractor, task_id: opts.taskId })}`),
};
