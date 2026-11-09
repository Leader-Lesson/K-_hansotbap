import type { ConflictRecord, OverlapCandidate, Task, Zone } from "@/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  zones: () => get<Zone[]>("/zones"),
  tasks: () => get<Task[]>("/tasks"),
  overlaps: () => get<OverlapCandidate[]>("/overlaps"),
  // 협력사로 보면 자기 작업이 걸린 충돌만 온다 (권한은 서버에서 거른다)
  conflicts: (opts: { contractor?: string; includeResolved?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.contractor) q.set("contractor", opts.contractor);
    if (opts.includeResolved) q.set("include_resolved", "true");
    const qs = q.toString();
    return get<ConflictRecord[]>(`/conflicts${qs ? `?${qs}` : ""}`);
  },
  uploadPlan: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/plans", { method: "POST", body });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ file: string; chars: number; text: string }>;
  },
};
