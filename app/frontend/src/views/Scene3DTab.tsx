// F3 고로 3D·충돌 탭: public/scene3d(three.js 정적 화면)를 iframe으로 넣고 postMessage로 데이터·역할을 넘긴다
// scene3d 쪽 메시지 규칙은 public/scene3d/src/app.js 의 'iframe 연동' 주석 참고
import { useEffect, useRef, useState } from "react";
import type { Conflict, Task, ViewerRole } from "@/types";

interface Props {
  date: string; // 'YYYY-MM-DD' — 그날 07:00 ~ 다음 날 07:00 을 보여준다
  tasks: Task[];
  conflicts?: Conflict[]; // 없으면 scene3d 브라우저 규칙 엔진이 계산 (서버 판정이 생기면 넘긴다)
  role: ViewerRole;
  now?: string; // 'YYYY-MM-DDTHH:MM' 시작 시각 (기본 그날 10:00)
  onSelect?: (sel: { taskId: string | null; zoneId: string | null }) => void;
  onDecision?: (d: { changeId: string; taskId: string; decision: "approved" | "rejected" }) => void;
}

export function Scene3DTab({ date, tasks, conflicts, role, now, onSelect, onDecision }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
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
    if (ready) send({ type: "data", tasks, conflicts });
  }, [ready, tasks, conflicts]);
  useEffect(() => {
    if (ready) send({ type: "role", role });
  }, [ready, role]);

  const src = `/scene3d/index.html?embed=1&date=${date}${now ? `&now=${now}` : ""}`;
  return (
    <iframe
      key={date}
      ref={ref}
      src={src}
      title="고로 3D · 충돌"
      className="h-full w-full border-0"
    />
  );
}
