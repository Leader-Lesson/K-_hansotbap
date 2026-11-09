// 실사용 화면(React, API 연결). 시연용 정적 시안은 /prototype/index.html 에 따로 있다.
// 역할(원청/협력사)을 고르면 서버가 걸러 준 데이터로 원청 화면·협력사 화면을 보여 준다
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { AppHeader } from "@/components/AppHeader";
import { ChatDock } from "@/components/ChatDock";
import { UploadDialog } from "@/components/UploadDialog";
import { restrictionsFrom } from "@/lib/restrictions";
import { DATE_KEY, ShellProvider, useShell } from "@/lib/shell";
import type { AdjustmentResult, ConflictRecord, PlanRecord, PlanSubmitResult, SopInfo, SopMatch, Task, ViewerRole, Zone } from "@/types";
import { ContractorView } from "@/views/ContractorView";
import { PrimeView } from "@/views/PrimeView";

const ROLE_KEY = "hansotbap.role"; // 판정 후 강제 새로고침을 해도 고른 역할이 남게
const NOTICE_KEY = "hansotbap.notice"; // 새로고침 뒤에 보여 줄 제출·조정 결과

function loadRole(): ViewerRole {
  try {
    const v = sessionStorage.getItem(ROLE_KEY);
    return v ? (JSON.parse(v) as ViewerRole) : { kind: "prime" };
  } catch {
    return { kind: "prime" };
  }
}

export default function App() {
  return (
    <ShellProvider>
      <AppInner />
    </ShellProvider>
  );
}

function AppInner() {
  const shell = useShell();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [sopMatches, setSopMatches] = useState<SopMatch[]>([]);
  const [sops, setSops] = useState<SopInfo[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [allContractors, setAllContractors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ViewerRole>(loadRole);
  const [notice, setNotice] = useState<string | null>(() => sessionStorage.getItem(NOTICE_KEY));
  const [retry, setRetry] = useState(0); // API 연결 실패 뒤 다시 부르기
  // AI 챗봇의 '오늘'은 ChatDock 이 헤더 공통 날짜(useShell)로 넘긴다

  const contractor = role.kind === "contractor" ? role.contractor : undefined;

  // 역할에 맞게 서버에서 걸러 받는다 (협력사는 자기 작업 + 원청이 공유한 충돌의 상대 작업만)
  const load = useCallback(async () => {
    try {
      const [z, t, c, s, p, lib] = await Promise.all([
        api.zones(),
        api.tasks(contractor),
        api.conflicts({ contractor }),
        api.sopMatches(contractor),
        api.plans(contractor),
        api.sops(),
      ]);
      setZones(z);
      setTasks(t);
      setConflicts(c);
      setSopMatches(s);
      setPlans(p);
      setSops(lib);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      // npm run dev 는 웹(Vite)이 API(uvicorn)보다 먼저 뜬다 → 첫 요청이 실패해도 몇 초 뒤 다시 부른다 [팀 설정값: 3초]
      window.setTimeout(() => setRetry((n) => n + 1), 3000);
    }
  }, [contractor]);

  useEffect(() => {
    void load();
  }, [load, retry]);

  // 역할 선택 목록은 협력사 목록(작업 분해표 업체 + 제출 업체)에서 — 일정이 비어 있어도(USE_BASELINE=false) 고를 수 있게
  useEffect(() => {
    api.contractors().then(setAllContractors).catch(() => {});
  }, [retry]); // API가 늦게 뜨면 다시 받는다

  useEffect(() => {
    if (notice) sessionStorage.removeItem(NOTICE_KEY);
  }, [notice]);

  const changeRole = (r: ViewerRole) => {
    sessionStorage.setItem(ROLE_KEY, JSON.stringify(r));
    setRole(r);
    setNotice(null); // 협력사 제출 안내가 원청 화면 위에 남지 않게
  };

  // 기획서: 판정 후 화면을 한 번 강제 새로고침한다. 결과 요약은 새로고침 뒤에 띄운다
  const finishWithRefresh = (text: string, refresh: boolean) => {
    if (refresh) {
      sessionStorage.setItem(NOTICE_KEY, text);
      window.location.reload();
    } else {
      setNotice(text);
      void load();
    }
  };

  const onSubmitted = (r: PlanSubmitResult) => {
    const intro = r.diff?.introduced ?? [];
    const gone = r.diff?.resolved ?? [];
    // 제출 응답은 제출한 협력사에게 공유된 충돌만 담는다(#56). 원청 확인 전이면 보통 비어 있으므로 "충돌 0건"으로 쓰지 않는다
    const parts = [
      `${r.plan.contractor} 계획서 v${r.plan.version} 제출 · 작업 ${r.plan.task_count}건 · 판정 ${r.recheck_ms != null ? `${Math.round(r.recheck_ms)}ms` : ""}`,
      "충돌 판정 결과는 원청 확인 후 공유됩니다",
      r.conflicts.length ? `이미 공유된 충돌 ${r.conflicts.length}건` : "",
      intro.length ? `새로 생긴 공유 충돌 ${intro.length}건: ${intro.map((c) => `${c.id} (${c.grade})`).join(", ")}` : "",
      gone.length ? `해소된 공유 충돌 ${gone.length}건: ${gone.map((c) => c.id).join(", ")}` : "",
    ].filter(Boolean);
    sessionStorage.removeItem(DATE_KEY); // 원청 화면이 이 제출이 낸 충돌 날짜로 가게
    shell.setDate(null);
    finishWithRefresh(parts.join(" · "), r.refresh);
  };

  const onAdjusted = (r: AdjustmentResult) => {
    const a = r.record.adjustment;
    const what = r.record.status === "reverted" ? `조정 되돌림: ${a.task_id} 원래 일정으로` : `조정 적용: ${a.task_id} 일정 이동 (${a.decided_by})`;
    const text = `${what} · 사라진 충돌 ${r.diff.resolved.length}건 · 새로 생긴 충돌 ${r.diff.introduced.length}건 · 현재 충돌 ${r.conflicts.length}건`;
    // 적용 결과 카드를 잠깐 보여 준 뒤 새로고침 (기획서: 판정 후 강제 새로고침)
    window.setTimeout(() => finishWithRefresh(text, r.refresh), 1500);
  };

  const contractors = useMemo(() => {
    const fromTasks = [...new Set(tasks.map((t) => t.contractor))].filter((c) => c.startsWith("가상-"));
    return [...new Set([...allContractors, ...fromTasks])].sort();
  }, [tasks, allContractors]);
  // 금지 판정 → 구역별 출입 제한 (안내 패널과 3D가 같이 쓴다). 협력사는 서버가 걸러 준 충돌 기준이라 자기 것만 나온다
  const restrictions = useMemo(() => restrictionsFrom(conflicts.map((r) => r.conflict), tasks), [conflicts, tasks]);

  return (
    <div className="min-h-screen text-ink">
      <AppHeader role={role} contractors={contractors} onRole={changeRole} onUpload={() => setUploadOpen(true)} apiError={error} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} role={role} contractors={contractors} zones={zones} onSubmitted={onSubmitted} />

      <main className="mx-auto max-w-[1480px] px-4 py-4 xl:px-6">
        {error && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
            API 연결 실패: {error} — 백엔드(8000)가 켜져 있는지, 8000 포트를 다른 프로그램이 쓰고 있지 않은지 확인하세요.
          </p>
        )}
        {notice && (
          <div className="mb-4 flex items-start gap-3 rounded border border-ok bg-ok-soft p-3 text-sm text-ok">
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs text-ok underline">
              닫기
            </button>
          </div>
        )}

        {role.kind === "prime" ? (
          <PrimeView
            zones={zones}
            tasks={tasks}
            conflicts={conflicts}
            sopMatches={sopMatches}
            sops={sops}
            plans={plans}
            restrictions={restrictions}
            onAdjusted={onAdjusted}
            onReload={() => void load()}
            onViewAs={changeRole}
          />
        ) : (
          <ContractorView
            contractor={role.contractor}
            zones={zones}
            tasks={tasks}
            conflicts={conflicts}
            sopMatches={sopMatches}
            sops={sops}
            plans={plans}
            restrictions={restrictions}
          />
        )}
      </main>
      <ChatDock role={role} tasks={tasks} conflicts={conflicts} />
    </div>
  );
}
