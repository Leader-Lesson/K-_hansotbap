// 계획서 올리기 창(UploadDialog · PlanUpload)이 같이 쓰는 값과 도우미. 컴포넌트 파일과 나눠 둬야 개발 중 화면 갱신(Fast Refresh)이 상태를 지킨다
import type { Conflict, PlanExtraction, PlanSubmitResult, Task } from "@/types";

/** 확인·수정 중인 값 (창을 닫았다 열어도 남게 UploadDialog 가 들고 있는다) */
export interface PlanDraft {
  tasks: Task[];
  confirmed: Record<string, boolean>; // 작업별 "확인" 표시. 확인 필요가 아닌 작업은 처음부터 확인됨
  contractor: string; // 제출 협력사 (협력사는 자기 업체 고정, 원청은 고른다)
  submittedBy: string;
}

/** 제출 뒤 결과. 원청은 GET /api/conflicts 의 plan_id 로 이 제출이 드러낸 충돌을 본다 */
export interface PlanOutcome {
  result: PlanSubmitResult;
  revealed: Conflict[] | null; // 원청: 이 제출로 새로 드러난 충돌 / 협력사: null (공유 전에는 볼 수 없다)
  touching: Conflict[] | null; // 원청: 이 계획서 작업이 걸린 미해결 충돌 전체
}

export const UNKNOWN_COMPANY = "(업체 미상)"; // 추출기가 업체를 못 찾았을 때 쓰는 값 (llm/extract.py)

/** 문서에서 읽은 업체 (업체 미상·빈칸 제외) */
export const docCompanies = (tasks: Task[]) => [...new Set(tasks.map((t) => t.contractor))].filter((c) => c && c !== UNKNOWN_COMPANY);

export function makeDraft(ext: PlanExtraction, fixed: string | null, contractors: string[]): PlanDraft {
  const tasks = ext.tasks.map((t) => t.task);
  const fromDoc = ext.contractor && ext.contractor !== UNKNOWN_COMPANY ? ext.contractor : docCompanies(tasks)[0];
  return {
    tasks,
    confirmed: Object.fromEntries(ext.tasks.map((t) => [t.task.id, !t.needs_review])),
    contractor: fixed ?? fromDoc ?? (contractors.length === 1 ? contractors[0] : ""),
    submittedBy: "",
  };
}
