// F3 ① 메인: 시간표형 간트 (07~19시, 30분 칸, 구역 위→아래, 지금 선)
// 담당: 프론트. TODO: 겹침 구간 색 띠(F2·F9), 아래 조치 카드
import { useEffect, useRef } from "react";
import { DataSet, Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import type { Task, Zone } from "@/types";

interface Props {
  date: string; // YYYY-MM-DD
  zones: Zone[];
  tasks: Task[];
  onSelectTask?: (taskId: string) => void;
}

const DAY_START = "07:00";
const DAY_END = "19:00";

export function TimetableGantt({ date, zones, tasks, onSelectTask }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const start = new Date(`${date}T${DAY_START}:00`);
    const end = new Date(`${date}T${DAY_END}:00`);

    const groups = new DataSet(
      [...zones]
        .sort((a, b) => b.vertical_order - a.vertical_order)
        .map((z) => ({ id: z.id, content: z.name })),
    );
    const items = new DataSet(
      tasks
        .filter((t) => new Date(t.start) < end && new Date(t.end) > start)
        .map((t) => ({
          id: t.id,
          group: t.zone_id,
          content: `${t.contractor} · ${t.name}`,
          start: t.start,
          end: t.end,
          title: `${t.id} ${t.name}`,
        })),
    );

    const timeline = new Timeline(ref.current, items, groups, {
      start,
      end,
      min: start,
      max: end,
      zoomable: false,
      moveable: false,
      stack: true,
      orientation: "top",
      showCurrentTime: true,
      timeAxis: { scale: "minute", step: 30 },
      format: { minorLabels: { minute: "HH:mm" } },
    });
    timeline.on("select", (props: { items: string[] }) => {
      if (props.items[0]) onSelectTask?.(props.items[0]);
    });
    return () => timeline.destroy();
  }, [date, zones, tasks, onSelectTask]);

  return <div ref={ref} className="rounded-lg border border-stone-200 bg-white" />;
}
