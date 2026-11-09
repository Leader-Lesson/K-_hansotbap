// F8 작업표준서 매칭: 작업마다 매칭된 표준서·이유·신뢰도, 필수 단계의 기재 여부. 주 표준서의 빠진 핵심 단계는 F2 '결함'이 된다
import { useState } from "react";
import type { SopMatch, Task } from "@/types";

interface Props {
  matches: SopMatch[];
  tasks?: Task[]; // 작업명 표시용 (없으면 ID만)
  emptyText?: string;
}

export function SopMatchPanel({ matches, tasks = [], emptyText = "매칭된 표준서가 없습니다." }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const nameOf = (id: string) => tasks.find((t) => t.id === id)?.name ?? "";

  if (matches.length === 0) return <p className="text-sm text-stone-500">{emptyText}</p>;

  return (
    <ul className="divide-y divide-stone-200 text-sm">
      {matches.map((m) => {
        const key = `${m.task_id}:${m.sop_id}`;
        const missing = m.primary && m.missing_steps.length > 0;
        const isOpen = open === key;
        return (
          <li key={key} className="py-2">
            <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <b>{m.task_id}</b>
              <span className="text-stone-600">{nameOf(m.task_id)}</span>
              <span className="mx-1 text-stone-400">→</span>
              <span className="font-medium">
                {m.sop_id} {m.title}
              </span>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">신뢰도 {Math.round(m.score * 100)}%</span>
              {m.primary ? (
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">주 표준서</span>
              ) : (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">참고</span>
              )}
              {missing && (
                <span className="rounded border border-purple-300 bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-800">
                  핵심 단계 {m.missing_steps.length}개 누락 → 결함
                </span>
              )}
              <span className="ml-auto text-xs text-stone-400">{isOpen ? "접기 ▲" : "단계 보기 ▼"}</span>
            </button>
            <p className="mt-1 text-xs text-stone-500">매칭 이유: {m.reason}</p>
            {isOpen && (
              <ol className="mt-2 space-y-1 rounded bg-stone-50 p-2 text-xs">
                {m.steps.map((s) => (
                  <li key={s.no} className={`flex gap-2 ${s.critical && !s.found ? "text-purple-800" : s.found ? "text-stone-700" : "text-stone-500"}`}>
                    <span className="w-5 shrink-0 text-right">{s.no}.</span>
                    <span className="shrink-0">{s.found ? "✅" : s.critical ? "❌" : "—"}</span>
                    <span>
                      {s.text}
                      {s.critical && <span className="ml-1 rounded bg-stone-200 px-1 text-[10px]">핵심</span>}
                      {s.evidence && (
                        <span className="ml-1 text-stone-500" title={s.evidence.locator ?? ""}>
                          · 원문 "{s.evidence.text.slice(0, 60)}
                          {s.evidence.text.length > 60 ? "…" : ""}"
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
