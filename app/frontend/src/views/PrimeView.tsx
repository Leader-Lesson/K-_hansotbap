// 원청 대시보드(현재상황판): 상단 요약 + [현황판: 시간표형 간트 + 고로 3D] / [3D·충돌: scene3d] / [충돌 목록: 규칙·조문·원문·조정안] / [표준서 매칭]
// TODO: 음성으로 묻기(F6), 위험 시간대 띠(F9), 협력사 공유(F5)
import { useEffect, useMemo, useState } from "react";
import { ConflictFilter, useConflictFilter } from "@/components/ConflictFilter";
import { ConflictList } from "@/components/ConflictList";
import { GradeBadge } from "@/components/ConflictBadge";
import { SopMatchPanel } from "@/components/SopMatchPanel";
import { TimetableGantt } from "@/components/TimetableGantt";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GRADE_RANK, fmtRange, worstGrade } from "@/lib/format";
import { groupByZone, restrictionsOn, type ZoneRestriction } from "@/lib/restrictions";
import { FURNACE_LEVELS, FurnaceScene } from "@/scene/FurnaceScene";
import type { AdjustmentResult, ConflictRecord, Grade, OverlapCandidate, PlanRecord, SopInfo, SopMatch, Task, Zone } from "@/types";
import { HistoryView } from "@/views/HistoryView";
import { RestrictionPanel } from "@/views/RestrictionPanel";
import { Scene3DTab } from "@/views/Scene3DTab";
import { SopLibrary } from "@/views/SopLibrary";

export const DATE_KEY = "hansotbap.date";

interface Props {
  zones: Zone[];
  tasks: Task[];
  overlaps: OverlapCandidate[];
  conflicts: ConflictRecord[]; // 서버 판정 결과 (해소된 것 제외)
  sopMatches: SopMatch[];
  sops: SopInfo[]; // 원청 작업표준서 목록 (공통 4 + 작업별)
  plans: PlanRecord[]; // 제출 이력 (가장 최근 제출을 찾는 데 쓴다)
  restrictions: ZoneRestriction[]; // 금지 판정 → 구역별 출입 제한 (안내 패널·3D 공용)
  onAdjusted: (result: AdjustmentResult) => void;
}

export function PrimeView({ zones, tasks, overlaps, conflicts, sopMatches, sops, plans, restrictions, onAdjusted }: Props) {
  // 기본 날짜: 가장 최근 제출한 협력사의 작업이 걸린 충돌 중 가장 높은 등급(같으면 먼저 시작)의 시작일.
  // 제출 직후 그 협력사가 낸 충돌이 있는 날로 바로 간다. 제출이 없으면 기준 일정의 한 날
  const defaultDate = useMemo(() => {
    const latest = [...plans].sort((a, b) => b.id - a.id)[0];
    if (!latest) return "2027-01-21";
    const mine = new Set(tasks.filter((t) => t.contractor === latest.contractor).map((t) => t.id));
    const top = conflicts
      .filter((r) => r.conflict.task_ids.some((id) => mine.has(id)))
      .sort((a, b) => GRADE_RANK[b.conflict.grade] - GRADE_RANK[a.conflict.grade] || a.conflict.window_start.localeCompare(b.conflict.window_start))[0];
    return (top?.conflict.window_start ?? "2027-01-21").slice(0, 10);
  }, [conflicts, tasks, plans]);
  // 판정 후 강제 새로고침을 해도 보던 날짜가 남게 한다 (새 제출이 오면 App 이 지워서 새 충돌 날짜로 간다)
  const [dateOverride, setDateOverride] = useState<string | null>(() => sessionStorage.getItem(DATE_KEY));
  const date = dateOverride ?? defaultDate;
  const setDate = setDateOverride;
  useEffect(() => sessionStorage.setItem(DATE_KEY, date), [date]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [tab, setTab] = useState("board");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [sopView, setSopView] = useState<"matches" | "library">("matches");
  const blockedZones = useMemo(() => groupByZone(restrictionsOn(restrictions, date), zones).length, [restrictions, date, zones]);

  const open = useMemo(() => conflicts.map((r) => r.conflict), [conflicts]);
  const todays = useMemo(() => {
    const dayStart = new Date(`${date}T07:00:00`);
    const dayEnd = new Date(`${date}T19:00:00`);
    return tasks.filter((t) => new Date(t.start) < dayEnd && new Date(t.end) > dayStart);
  }, [tasks, date]);
  const contractors = new Set(todays.map((t) => t.contractor));
  const selectedLevel = FURNACE_LEVELS.find((l) => l.id === zoneId);

  // 구역별 가장 높은 등급 (오늘 걸린 충돌만) → 고로 3D 층 색
  const highlights = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    const byZone: Record<string, Grade[]> = {};
    for (const c of open) {
      if (new Date(c.window_start) > dayEnd || new Date(c.window_end) < dayStart) continue;
      for (const id of c.task_ids) {
        const t = tasks.find((x) => x.id === id);
        if (t) (byZone[t.zone_id] ??= []).push(c.grade);
      }
    }
    return Object.fromEntries(Object.entries(byZone).map(([z, g]) => [z, worstGrade(g)!]));
  }, [open, tasks, date]);

  const filter = useConflictFilter(conflicts, tasks, date);
  const allContractors = useMemo(() => [...new Set(tasks.map((t) => t.contractor))].sort(), [tasks]);

  const counts = { 금지: 0, 조건부: 0, 결함: 0 } as Record<Grade, number>;
  for (const c of open) counts[c.grade] += 1;

  const zoneConflicts = conflicts.filter((r) => r.conflict.task_ids.some((id) => tasks.find((t) => t.id === id)?.zone_id === zoneId));

  // 충돌 상세의 [3D로 보기]: 충돌이 걸린 날짜로 옮기고 3D 탭에서 그 작업을 고른다
  const show3D = (taskId: string, r: ConflictRecord) => {
    const day = r.conflict.window_start.slice(0, 10);
    if (day !== date) setDate(day);
    setSelectedTask(taskId);
    setTab("scene3d");
  };

  return (
    <div className="grid gap-4">
      <section className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3 text-sm shadow-sm">
        <label className="flex items-center gap-2">
          날짜
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1"
          />
        </label>
        <span>업체 {contractors.size}곳</span>
        <span>작업 {todays.length}건</span>
        <span className="text-stone-500">겹침 후보(전체 공정) {overlaps.length}쌍</span>
        <span className="ml-auto flex items-center gap-2">
          충돌 {open.length}건
          {(["금지", "조건부", "결함"] as Grade[]).map(
            (g) =>
              counts[g] > 0 && (
                <span key={g} className="flex items-center gap-1">
                  <GradeBadge grade={g} />
                  <span className="text-xs text-stone-600">{counts[g]}</span>
                </span>
              ),
          )}
        </span>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="board">현황판</TabsTrigger>
          <TabsTrigger value="scene3d">3D·충돌</TabsTrigger>
          <TabsTrigger value="conflicts">충돌 목록 {open.length > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-[10px] text-white">{open.length}</span>}</TabsTrigger>
          <TabsTrigger value="restrictions">출입 제한 {blockedZones > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-[10px] text-white">{blockedZones}</span>}</TabsTrigger>
          <TabsTrigger value="sops">표준서</TabsTrigger>
          <TabsTrigger value="history">이력</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="grid gap-4">
          <TimetableGantt date={date} zones={zones} tasks={todays} conflicts={open} onSelectTask={(id) => show3D(id, { conflict: { window_start: date } } as ConflictRecord)} />

          <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="h-[420px] overflow-hidden rounded-lg border border-stone-200">
              <FurnaceScene highlights={highlights} selected={zoneId} onSelect={setZoneId} />
            </div>
            <aside className="rounded-lg bg-white p-3 text-sm shadow-sm">
              <h3 className="mb-2 font-semibold">
                {selectedLevel ? `${selectedLevel.label} 작업` : "층을 눌러 작업을 봅니다"}
              </h3>
              <ul className="space-y-1">
                {todays
                  .filter((t) => t.zone_id === zoneId)
                  .map((t) => (
                    <li key={t.id}>
                      <b>{t.id}</b> {t.contractor} · {t.name} <span className="text-xs text-stone-500">{fmtRange(t.start, t.end)}</span>
                    </li>
                  ))}
              </ul>
              {zoneId && zoneConflicts.length > 0 && (
                <>
                  <h4 className="mt-3 mb-1 font-semibold">이 구역의 충돌 {zoneConflicts.length}건</h4>
                  <ConflictList records={zoneConflicts} tasks={tasks} role={{ kind: "prime" }} onShow3D={show3D} onAdjusted={onAdjusted} />
                </>
              )}
            </aside>
          </section>
        </TabsContent>

        {/* scene3d(public/scene3d, three.js 정적 화면)를 iframe으로 — 전체 작업과 서버 판정을 넘기면 위치별 목록·3D·조치 카드가 그려짐 */}
        <TabsContent
          value="scene3d"
          className="h-[calc(100vh-180px)] min-h-[560px] overflow-hidden rounded-lg border border-stone-200"
        >
          <Scene3DTab date={date} tasks={tasks} conflicts={open} restrictions={restrictions} role={{ kind: "prime" }} selectTaskId={selectedTask} />
        </TabsContent>

        <TabsContent value="restrictions">
          <RestrictionPanel
            restrictions={restrictions}
            tasks={tasks}
            zones={zones}
            date={date}
            onShow3D={(taskId) => {
              setSelectedTask(taskId);
              setTab("scene3d");
            }}
          />
        </TabsContent>

        <TabsContent value="conflicts" className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">판정된 충돌 (규칙 ID · 법 조문 · 원문 근거 · 조정안)</h3>
          <ConflictFilter state={filter.state} onChange={filter.setState} contractors={allContractors} date={date} total={conflicts.length} shown={filter.filtered.length} />
          <ConflictList
            records={filter.filtered}
            tasks={tasks}
            role={{ kind: "prime" }}
            onShow3D={show3D}
            onAdjusted={onAdjusted}
            emptyText="아직 판정된 충돌이 없습니다. 협력사 화면에서 계획서를 올려 제출하면 그 순간 판정합니다."
          />
        </TabsContent>

        <TabsContent value="sops" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="inline-flex rounded-lg bg-stone-200/70 p-[3px] text-xs">
              {(["matches", "library"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSopView(v)} className={`rounded-md px-3 py-1 font-medium ${sopView === v ? "bg-white shadow-sm" : "text-stone-600"}`}>
                  {v === "matches" ? `제출 계획서 매칭 ${sopMatches.length}` : `표준서 목록 ${sops.length}`}
                </button>
              ))}
            </div>
            <span className="text-xs text-stone-500">
              {sopView === "matches" ? "제출된 계획서의 작업마다 매칭된 표준서와 필수 단계 기재 여부 (F8). 주 표준서의 핵심 단계가 빠지면 결함" : "원청 작업표준서: 공통(유형별) 4종 + 작업별(P01~P37). 보라색 단계가 빠지면 결함"}
            </span>
          </div>
          {sopView === "matches" ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <SopMatchPanel matches={sopMatches} tasks={tasks} emptyText="제출된 계획서가 없습니다. 협력사가 계획서를 제출하면 작업별 표준서 매칭이 여기에 나옵니다." />
            </div>
          ) : (
            <SopLibrary sops={sops} tasks={tasks} />
          )}
        </TabsContent>

        <TabsContent value="history">
          <HistoryView plans={plans} tasks={tasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
