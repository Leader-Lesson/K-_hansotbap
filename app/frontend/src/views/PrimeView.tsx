// 원청 대시보드(현재상황판): 상단 요약 + 시간표형 간트(메인) + 고로 3D
// TODO: 조치 카드, 충돌 상세(규칙 ID·법 조문·원문·조정안·적용 버튼), 음성으로 묻기(F6)
import { useMemo, useState } from "react";
import { TimetableGantt } from "@/components/TimetableGantt";
import { FURNACE_LEVELS, FurnaceScene } from "@/scene/FurnaceScene";
import type { OverlapCandidate, Task, Zone } from "@/types";

interface Props {
  zones: Zone[];
  tasks: Task[];
  overlaps: OverlapCandidate[];
}

export function PrimeView({ zones, tasks, overlaps }: Props) {
  const [date, setDate] = useState("2027-01-21");
  const [zoneId, setZoneId] = useState<string | null>(null);

  const todays = useMemo(() => {
    const dayStart = new Date(`${date}T07:00:00`);
    const dayEnd = new Date(`${date}T19:00:00`);
    return tasks.filter((t) => new Date(t.start) < dayEnd && new Date(t.end) > dayStart);
  }, [tasks, date]);
  const contractors = new Set(todays.map((t) => t.contractor));
  const selectedLevel = FURNACE_LEVELS.find((l) => l.id === zoneId);

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
        <span>겹침 후보(전체 공정) {overlaps.length}쌍</span>
      </section>

      <TimetableGantt date={date} zones={zones} tasks={todays} />

      <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="h-[420px] overflow-hidden rounded-lg border border-stone-200">
          <FurnaceScene selected={zoneId} onSelect={setZoneId} />
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
                  <b>{t.id}</b> {t.contractor} · {t.name}
                </li>
              ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
