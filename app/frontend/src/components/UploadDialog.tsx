// 헤더 "계획서 올리기" 창: 시안처럼 어느 화면에서든 띄운다. 안의 흐름(파일 → 추출 표 → 표준서 매칭 → 제출·판정)은 PlanUpload 그대로
// 협력사는 자기 업체로만 올리고, 원청은 어느 협력사 계획서를 올리는지 고른다
import { useEffect, useState } from "react";
import { PlanUpload } from "@/components/PlanUpload";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PlanSubmitResult, ViewerRole, Zone } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: ViewerRole;
  contractors: string[];
  zones: Zone[];
  onSubmitted: (r: PlanSubmitResult) => void;
}

export function UploadDialog({ open, onOpenChange, role, contractors, zones, onSubmitted }: Props) {
  const fixed = role.kind === "contractor" ? role.contractor : null;
  const [pick, setPick] = useState<string>("");
  useEffect(() => {
    if (!fixed && !pick && contractors.length) setPick(contractors[0]);
  }, [fixed, pick, contractors]);
  const contractor = fixed ?? pick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>계획서 올리기</DialogTitle>
          <DialogDescription>
            지금 쓰는 양식(HWPX · 엑셀 · PDF) 그대로 올리면 작업 표로 정리하고, 표준서를 붙이고, 제출하는 순간 충돌을 판정합니다. 구형 HWP는 받지 않습니다.
          </DialogDescription>
        </DialogHeader>
        {!fixed && (
          <label className="flex items-center gap-2 text-sm">
            제출 협력사
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded border border-line bg-surface-2 px-2 py-1">
              {contractors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-3">원청이 협력사 대신 올리는 경우</span>
          </label>
        )}
        {contractor ? (
          <PlanUpload
            key={contractor}
            contractor={contractor}
            zones={zones}
            onSubmitted={(r) => {
              onOpenChange(false);
              onSubmitted(r);
            }}
          />
        ) : (
          <p className="text-sm text-ink-3">협력사 목록을 불러오는 중입니다…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
