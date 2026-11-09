// 협력사 화면: 계획서 올리기·제출(F1→F8→F2), 내 작업, 나와 겹친 충돌, 매칭된 표준서, 내 작업 3D
// 권한: 충돌·표준서 매칭은 서버가 contractor 로 거른 것만 받는다. 작업 목록은 F5(PR #34)가 들어오면 서버에서 걸러진다
import { useMemo, useState } from "react";
import { ConflictList } from "@/components/ConflictList";
import { PlanUpload } from "@/components/PlanUpload";
import { SopMatchPanel } from "@/components/SopMatchPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GRADE_RANK, HAZARD_LABEL, fmtRange } from "@/lib/format";
import type { ConflictRecord, PlanSubmitResult, SopMatch, Task, Zone } from "@/types";
import { Scene3DTab } from "@/views/Scene3DTab";

interface Props {
  contractor: string;
  zones: Zone[];
  tasks: Task[];
  conflicts: ConflictRecord[]; // 서버가 이 협력사 작업이 걸린 것만 준다
  sopMatches: SopMatch[];
  onSubmitted: (result: PlanSubmitResult) => void;
}

export function ContractorView({ contractor, zones, tasks, conflicts, sopMatches, onSubmitted }: Props) {
  const mine = tasks.filter((t) => t.contractor === contractor);
  // 3D 기본 날짜: 내 충돌 중 가장 높은 등급(같으면 먼저 시작하는 것)의 시작일 → 없으면 내 첫 작업 시작일
  const defaultDate = useMemo(() => {
    const top = [...conflicts].sort(
      (a, b) => GRADE_RANK[b.conflict.grade] - GRADE_RANK[a.conflict.grade] || a.conflict.window_start.localeCompare(b.conflict.window_start),
    )[0];
    return (top?.conflict.window_start ?? [...mine].sort((a, b) => a.start.localeCompare(b.start))[0]?.start ?? "2027-01-21").slice(0, 10);
  }, [conflicts, mine]);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const date = dateOverride ?? defaultDate;
  const setDate = setDateOverride;
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="grid gap-4">
      <PlanUpload contractor={contractor} zones={zones} onSubmitted={onSubmitted} />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">내 작업 {mine.length}</TabsTrigger>
          <TabsTrigger value="conflicts">
            나와 겹친 충돌 {conflicts.length > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-[10px] text-white">{conflicts.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="sops">매칭된 표준서</TabsTrigger>
          <TabsTrigger value="scene3d">내 작업 3D</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="rounded-lg bg-white p-4 text-sm shadow-sm">
          <h2 className="mb-2 font-semibold">{contractor} — 내 작업 {mine.length}건</h2>
          {mine.length === 0 ? (
            <p className="text-stone-500">계획서를 올려 제출하면 이 협력사의 작업이 여기에 나옵니다.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">작업</th>
                  <th className="p-2">구역</th>
                  <th className="p-2">기간</th>
                  <th className="p-2">위험작업</th>
                  <th className="p-2">선행</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {mine.map((t) => (
                  <tr key={t.id}>
                    <td className="p-2 font-semibold">{t.id}</td>
                    <td className="p-2">{t.name}</td>
                    <td className="p-2">{zoneName(t.zone_id)}</td>
                    <td className="whitespace-nowrap p-2">{fmtRange(t.start, t.end)}</td>
                    <td className="p-2">{t.hazards.map((h) => HAZARD_LABEL[h]).join(", ") || "—"}</td>
                    <td className="p-2">{t.predecessors.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="conflicts" className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">나와 겹친 충돌 — 내 작업이 걸린 것만 (서버에서 거름)</h3>
          <ConflictList records={conflicts} tasks={tasks} role={{ kind: "contractor", contractor }} emptyText="내 작업이 걸린 충돌이 없습니다." />
        </TabsContent>

        <TabsContent value="sops" className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">매칭된 작업표준서 (F8) — 빠진 핵심 단계를 보완해 재제출하면 결함이 해소됩니다</h3>
          <SopMatchPanel matches={sopMatches} tasks={tasks} emptyText="제출한 계획서가 없습니다." />
        </TabsContent>

        <TabsContent value="scene3d" className="grid gap-2">
          <label className="flex items-center gap-2 text-sm">
            날짜
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-stone-300 px-2 py-1" />
          </label>
          <div className="h-[calc(100vh-260px)] min-h-[520px] overflow-hidden rounded-lg border border-stone-200">
            <Scene3DTab date={date} tasks={tasks} conflicts={conflicts.map((r) => r.conflict)} role={{ kind: "contractor", contractor }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
