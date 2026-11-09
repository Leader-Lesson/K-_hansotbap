// 업체 색: 상황판(BoardView)·3D(scene3d/src/adapter.js)와 같은 팔레트·같은 순서(가상 업체 이름순) — 같은 업체가 어느 화면에서나 같은 색
import type { Task } from "@/types";

const PALETTE = ["#2e6fd0", "#8a3fa0", "#1f8a8a", "#b08300", "#a0522d", "#3f7f4f", "#b03a5b", "#5b6ad0", "#7c6f64", "#9b5d7a", "#1f4e8c", "#6b7682"];

export function partyColor(tasks: Task[]): (contractor: string) => string {
  const names = [...new Set(tasks.map((t) => t.contractor))].filter((c) => !c.startsWith("원청")).sort();
  return (c) => {
    if (c.startsWith("원청")) return "#8a929b";
    const i = names.indexOf(c);
    return i < 0 ? "var(--ink-3)" : PALETTE[i % PALETTE.length];
  };
}

/** 'YYYY-MM-DD…' → 'M/D' */
export const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
/** 'YYYY-MM-DDTHH:MM…' → 'M/D HH:MM' (시안 이력 시각과 같은 꼴) */
export const mdhm = (iso: string) => `${md(iso)} ${iso.slice(11, 16)}`;
const WD = "일월화수목금토";
/** 'YYYY-MM-DD' → 'YYYY.MM.DD(요일)' */
export const ymdw = (iso: string) => `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}(${WD[new Date(`${iso.slice(0, 10)}T00:00:00`).getDay()]})`;
