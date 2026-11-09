// 원청 작업표준서 열람 (F8): 공통 표준서(유형별) + 작업별 표준서(P01~P37). 목록·검색 → 본문(마크다운) · 필수 단계 · 핵심 단계
// 협력사로 보면 내 작업에 적용되는 표준서를 맨 위에 모은다. 표준서는 data/sop 의 파일이고 여기서는 읽기만 한다
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { MarkdownLite } from "@/components/MarkdownLite";
import { HAZARD_LABEL } from "@/lib/format";
import type { Hazard, SopInfo, Task } from "@/types";

interface Props {
  sops: SopInfo[];
  tasks: Task[];
  contractor?: string; // 협력사로 볼 때: 내 작업의 표준서를 먼저
  initialSopId?: string | null;
}

const isPerTask = (s: SopInfo) => /^SOP-P\d+/.test(s.id);

export function SopLibrary({ sops, tasks, contractor, initialSopId = null }: Props) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "mine" | "common" | "task">(contractor ? "mine" : "all");
  const [openId, setOpenId] = useState<string | null>(initialSopId);
  const [detail, setDetail] = useState<Record<string, SopInfo>>({});
  const [loading, setLoading] = useState(false);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const myTaskIds = useMemo(() => new Set(tasks.filter((t) => t.contractor === contractor).map((t) => t.id)), [tasks, contractor]);
  const isMine = (s: SopInfo) => s.wbs_examples.some((id) => myTaskIds.has(id));

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    return sops
      .filter((s) => (kind === "mine" ? isMine(s) : kind === "common" ? !isPerTask(s) : kind === "task" ? isPerTask(s) : true))
      .filter((s) => {
        if (!text) return true;
        const hay = [s.id, s.title, ...s.wbs_examples, ...s.wbs_examples.map((id) => taskById.get(id)?.name ?? ""), ...s.wbs_examples.map((id) => taskById.get(id)?.contractor ?? ""), ...s.steps].join(" ").toLowerCase();
        return hay.includes(text);
      })
      .sort((a, b) => Number(isPerTask(a)) - Number(isPerTask(b)) || a.id.localeCompare(b.id, undefined, { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sops, q, kind, myTaskIds, taskById]);

  useEffect(() => {
    if (!openId || detail[openId]) return;
    let alive = true;
    setLoading(true);
    api
      .sop(openId)
      .then((s) => alive && setDetail((d) => ({ ...d, [s.id]: s })))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [openId, detail]);

  const open = openId ? (detail[openId] ?? sops.find((s) => s.id === openId) ?? null) : null;
  const common = sops.filter((s) => !isPerTask(s)).length;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <aside className="rounded-lg border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-2 text-xs">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="표준서·작업·업체 검색" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1" />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded border border-stone-300 bg-white px-1 py-1">
            {contractor && <option value="mine">내 작업 표준서</option>}
            <option value="all">전체 {sops.length}</option>
            <option value="common">공통(유형별) {common}</option>
            <option value="task">작업별 {sops.length - common}</option>
          </select>
        </div>
        <ul className="max-h-[70vh] divide-y divide-stone-100 overflow-y-auto text-sm">
          {list.length === 0 && <li className="p-3 text-stone-500">해당하는 표준서가 없습니다.</li>}
          {list.map((s) => {
            const t = isPerTask(s) ? taskById.get(s.wbs_examples[0]) : undefined;
            const active = s.id === openId;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)} className={`w-full px-3 py-2 text-left hover:bg-stone-50 ${active ? "bg-sky-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-stone-500">{s.id}</span>
                    {isPerTask(s) ? (
                      <span className="rounded bg-stone-100 px-1.5 text-[10px] text-stone-600">작업별</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">공통</span>
                    )}
                    {contractor && isMine(s) && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-800">내 작업</span>}
                  </div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-stone-500">
                    {t ? `${t.contractor} · ${t.zone_id}` : `적용 작업 ${s.wbs_examples.length}건`} · 필수 {s.steps.length}단계 · 핵심 {s.critical_steps.length}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="min-h-[320px] rounded-lg border border-stone-200 bg-white p-4">
        {!open ? (
          <p className="text-sm text-stone-500">왼쪽에서 표준서를 고르면 본문·필수 단계·핵심 단계(빠지면 결함)가 여기에 나옵니다.</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-stone-500">{open.id}</span>
              <h3 className="text-base font-semibold">{open.title}</h3>
              {open.hazards.map((h) => (
                <span key={h} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
                  {HAZARD_LABEL[h as Hazard] ?? h}
                </span>
              ))}
              <span className="ml-auto rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">합성 문서 · 실제 사업장 표준서 아님</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
              <span>
                적용 작업:{" "}
                {open.wbs_examples.map((id) => {
                  const t = taskById.get(id);
                  return (
                    <span key={id} className="mr-1 rounded bg-stone-100 px-1.5 py-0.5" title={t ? `${t.contractor} · ${t.name}` : ""}>
                      {id}
                      {t ? ` ${t.name}` : ""}
                    </span>
                  );
                })}
              </span>
              <span className="basis-full">출처: {open.source}</span>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-3">
              <div className="mb-1 text-xs font-semibold text-stone-600">필수 단계 — 보라색이 핵심 단계(계획서에 없으면 결함)</div>
              <ol className="grid gap-1 text-sm sm:grid-cols-2">
                {open.steps.map((s, i) => {
                  const critical = open.critical_steps.includes(i + 1);
                  return (
                    <li key={i} className={`flex gap-2 rounded px-2 py-1 ${critical ? "bg-purple-100 text-purple-900" : "bg-white"}`}>
                      <span className="w-5 shrink-0 text-right font-mono text-xs text-stone-500">{i + 1}</span>
                      <span>
                        {s}
                        {critical && <span className="ml-1 text-[10px] font-semibold">핵심</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            {loading && !open.text && <p className="text-xs text-stone-500">본문 불러오는 중…</p>}
            {open.text && (
              <details open className="rounded border border-stone-200 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-stone-600">본문 ({open.file})</summary>
                <MarkdownLite text={open.text} className="mt-2" />
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
