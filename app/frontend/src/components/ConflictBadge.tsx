import { CONFLICT_TYPE_LABEL, GRADE_CLASS } from "@/lib/format";
import type { ConflictType, Grade } from "@/types";

export function GradeBadge({ grade, className = "" }: { grade: Grade; className?: string }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${GRADE_CLASS[grade]} ${className}`}>
      {grade}
    </span>
  );
}

export function TypeBadge({ type }: { type: ConflictType }) {
  return (
    <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
      {CONFLICT_TYPE_LABEL[type]}
    </span>
  );
}
