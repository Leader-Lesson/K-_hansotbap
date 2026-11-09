import type { OverlapCandidate, Task, Zone } from "@/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  zones: () => get<Zone[]>("/zones"),
  tasks: () => get<Task[]>("/tasks"),
  overlaps: () => get<OverlapCandidate[]>("/overlaps"),
  uploadPlan: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/plans", { method: "POST", body });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ file: string; chars: number; text: string }>;
  },
};
