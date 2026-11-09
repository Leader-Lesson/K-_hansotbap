// F3 고로 3D·충돌 탭: scene3d(Vite가 함께 빌드하는 /scene3d/index.html, three.js)를 iframe으로 넣고 postMessage로 데이터·역할을 넘긴다
// scene3d 쪽 메시지 규칙은 app/frontend/scene3d/src/app.js 의 'iframe 연동' 주석 참고
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ZoneRestriction } from "@/lib/restrictions";
import type { Conflict, Task, ViewerRole } from "@/types";

interface Props {
  date: string; // 'YYYY-MM-DD' — 그날 작업 시간 07:00 ~ 19:00 을 보여준다 (야간조 없음)
  tasks: Task[];
  conflicts?: Conflict[]; // 서버 판정(GET /api/conflicts). 없으면 scene3d 브라우저 규칙 엔진이 계산한다
  restrictions?: ZoneRestriction[]; // 서버 금지 판정에서 만든 구역별 출입 제한 → scene3d 가 안전띠·출입 금지 표지를 세운다
  role: ViewerRole;
  now?: string; // 'YYYY-MM-DDTHH:MM' 시작 시각 (기본 그날 10:00)
  selectTaskId?: string | null; // 충돌 목록의 [3D로 보기]에서 고른 작업
  onSelect?: (sel: { taskId: string | null; zoneId: string | null }) => void;
  onDecision?: (d: { changeId: string; taskId: string; decision: "approved" | "rejected" }) => void;
}

const MIN_H = 560; // 이보다 작으면 3D·목록·조치 패널이 다 안 들어감
const GAP = 16; // 화면 아래 여백

export function Scene3DTab({ date, tasks, conflicts, restrictions, role, now, selectTaskId, onSelect, onDecision }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(MIN_H);

  // 높이: 이 탭이 시작하는 곳부터 화면 아래까지 채운다 (헤더 높이가 화면마다 달라 고정 calc 대신 직접 잰다)
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(MIN_H, Math.floor(window.innerHeight - top - GAP)));
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(fit); // 위쪽 헤더·안내 줄 높이가 바뀌어도 다시 맞춤
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", fit);
      ro.disconnect();
    };
  }, []);
  const [ready, setReady] = useState(false);
  const cb = useRef({ onSelect, onDecision });
  cb.current = { onSelect, onDecision };

  const send = (msg: Record<string, unknown>) =>
    ref.current?.contentWindow?.postMessage(
      { source: "hansotbap", ...msg },
      window.location.origin,
    );

  // scene3d → 부모: ready / select / decision
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "scene3d") return;
      if (e.data.type === "ready") setReady(true);
      else if (e.data.type === "select")
        cb.current.onSelect?.({ taskId: e.data.taskId, zoneId: e.data.zoneId });
      else if (e.data.type === "decision") cb.current.onDecision?.(e.data);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  useEffect(() => setReady(false), [date]); // 날짜가 바뀌면 iframe을 새로 띄우므로 다시 ready를 기다림
  useEffect(() => {
    if (ready) send({ type: "data", tasks, conflicts, restrictions });
  }, [ready, tasks, conflicts, restrictions]);
  useEffect(() => {
    if (ready) send({ type: "role", role });
  }, [ready, role]);
  useEffect(() => {
    // 데이터·역할을 보낸 뒤에 선택해야 scene3d가 그 작업을 찾는다
    if (ready && selectTaskId) send({ type: "selectTask", taskId: selectTaskId });
  }, [ready, selectTaskId, tasks, conflicts]);

  const src = `/scene3d/index.html?embed=1&date=${date}${now ? `&now=${now}` : ""}`;
  return (
    <div ref={box} style={{ height }} className="w-full overflow-hidden rounded-lg border border-stone-200">
      <iframe key={date} ref={ref} src={src} title="고로 3D · 충돌" className="block h-full w-full border-0" />
    </div>
  );
}
