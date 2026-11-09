// 충돌 목록 거르기: 등급 · 유형 · 업체 · 선택한 날짜만 · 검색. 표시용 필터일 뿐 권한은 서버가 거른다
import { useMemo, useState } from "react";
import { CONFLICT_TYPE_LABEL } from "@/lib/format";
import type { ConflictRecord, ConflictType, Grade, Task } from "@/types";

export interface ConflictFilterState {
  grades: Set<Grade>;
  type: ConflictType | "";
  contractor: string;
  onlyDate: boolean;
  text: string;
}

const ALL_GRADES: Grade[] = ["금지", "조건부", "결함"];

export function useConflictFilter(records: ConflictRecord[], tasks: Task[], date: string) {
  const [state, setState] = useState<ConflictFilterState>({ grades: new Set(ALL_GRADES), type: "", contractor: "", onlyDate: false, text: "" });
  const filtered = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    const q = state.text.trim().toLowerCase();
    return records.filter((r) => {
      const c = r.conflict;
      if (!state.grades.has(c.grade)) return false;
      if (state.type && c.type !== state.type) return false;
      const ts = c.task_ids.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
      if (state.contractor && !ts.some((t) => t.contractor === state.contractor)) return false;
      if (state.onlyDate && (new Date(c.window_start) > dayEnd || new Date(c.window_end) < dayStart)) return false;
      if (q) {
        const hay = [c.id, c.rule_id, c.reason, c.legal_basis, ...ts.map((t) => `${t.id} ${t.name} ${t.contractor}`)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, tasks, date, state]);
  return { state, setState, filtered };
}

interface Props {
  state: ConflictFilterState;
  onChange: (s: ConflictFilterState) => void;
  contractors: string[];
  date: string;
  total: number;
  shown: number;
}

export function ConflictFilter({ state, onChange, contractors, date, total, shown }: Props) {
  const toggleGrade = (g: Grade) => {
    const grades = new Set(state.grades);
    if (grades.has(g)) grades.delete(g);
    else grades.add(g);
    onChange({ ...state, grades });
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded bg-stone-50 p-2 text-xs">
      <span className="flex items-center gap-2">
        {ALL_GRADES.map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input type="checkbox" checked={state.grades.has(g)} onChange={() => toggleGrade(g)} /> {g}
          </label>
        ))}
      </span>
      <select value={state.type} onChange={(e) => onChange({ ...state, type: e.target.value as ConflictType | "" })} className="rounded border border-stone-300 bg-white px-1 py-0.5">
        <option value="">유형 전체</option>
        {(Object.keys(CONFLICT_TYPE_LABEL) as ConflictType[]).map((t) => (
          <option key={t} value={t}>
            {CONFLICT_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <select value={state.contractor} onChange={(e) => onChange({ ...state, contractor: e.target.value })} className="rounded border border-stone-300 bg-white px-1 py-0.5">
        <option value="">업체 전체</option>
        {contractors.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={state.onlyDate} onChange={(e) => onChange({ ...state, onlyDate: e.target.checked })} /> {date} 에 걸린 것만
      </label>
      <input
        value={state.text}
        onChange={(e) => onChange({ ...state, text: e.target.value })}
        placeholder="작업 ID·규칙·업체 검색"
        className="rounded border border-stone-300 px-2 py-0.5"
      />
      <span className="ml-auto text-stone-500">
        {shown} / {total}건
      </span>
    </div>
  );
}
