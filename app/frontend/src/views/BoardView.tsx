// 상황판(F3 ① 메인): 시안(public/prototype #board)의 레이아웃을 서버 데이터로 그린다.
// 숫자 띠 → 오늘 작업 시간표(07~19시·30분 칸·구역은 위층부터·위험 시간대 띠·지금 선·겹침 띠) → 조치 카드 → 충돌 상세(근거·공유·조정안)
// 판정·위험 시간대·조정은 서버 규칙이 한 것이고 여기서는 보여 주기만 한다. 협력사는 서버가 거른 데이터만 받는다(자기 작업 + 공유된 충돌의 상대 작업)
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/api/client";
import { DEF_NOW, useShell } from "@/lib/shell";
import { ConflictList } from "@/components/ConflictList";
import { CONFLICT_TYPE_LABEL, GRADE_RANK } from "@/lib/format";
import { restrictionsFrom } from "@/lib/restrictions";
import type { AdjustmentResult, Conflict, ConflictRecord, Grade, Hazard, PlanRecord, RiskWindow, Task, TbmCheckRecord, ViewerRole, Zone } from "@/types";
import "./board.css";

interface Props {
  role: ViewerRole;
  date: string; // YYYY-MM-DD
  setDate: (d: string) => void;
  zones: Zone[];
  tasks: Task[];
  conflicts: ConflictRecord[]; // 서버 판정 (해소된 것 제외). 협력사는 공유된 자기 충돌만
  plans: PlanRecord[];
  onAdjusted?: (r: AdjustmentResult) => void;
  onShared?: () => void;
  onShow3D?: (taskId: string, record: ConflictRecord) => void;
}

const H0 = 7; // 기획서 F3: 07~19시, 30분 칸
const H1 = 19;
const SLOTS = (H1 - H0) * 2;
const LANE = 30; // 막대 한 줄 높이(px) — 시안과 같음
const GRADE_VAR: Record<Grade, string> = { 금지: "var(--red)", 조건부: "var(--amber)", 결함: "var(--violet)" };
const GRADE_PILL: Record<Grade, string> = { 금지: "ban", 조건부: "cond", 결함: "def" };
// 시연 시각 고르기: 07:00~18:30, 30분씩 (시안 setNow 와 같은 범위 — 19:00 은 하루 끝)
const NOPT = Array.from({ length: SLOTS }, (_, i) => H0 + i / 2);
/** 위험 시간대 띠 색: 칸의 위험 점수(서버 F9 score, 금지 3·조건부 2·결함 1의 합) 구간. 시안 rcls 와 같은 경계 [팀 설정값] */
const riskClass = (v: number) => (v >= 5 ? "r3" : v >= 3 ? "r2" : v > 0 ? "r1" : "");
// 3D(scene3d/src/adapter.js)와 같은 업체 색 — 두 화면에서 같은 업체가 같은 색
const PALETTE = ["#2e6fd0", "#8a3fa0", "#1f8a8a", "#b08300", "#a0522d", "#3f7f4f", "#b03a5b", "#5b6ad0", "#7c6f64", "#9b5d7a", "#1f4e8c", "#6b7682"];

const pad = (n: number) => String(n).padStart(2, "0");
const hh = (v: number) => `${pad(Math.floor(v))}:${pad(Math.round((v % 1) * 60))}`;
const hourOf = (iso: string) => Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;
const short = (c: string) => c.replace(/^가상-/, "");

/** 받침에 맞는 조사 (한글이 아니면 '이(가)' 꼴) */
function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${withBatchim}(${without})`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}
/** 타사 막대·문장에 쓰는 위험 유형 (시안 HZ와 같은 우선순위) */
const HZ_ORDER: [Hazard, string][] = [["heavy_lift", "인양 작업"], ["gas", "가스 배관 작업"], ["hot_work", "화기 작업"], ["confined", "밀폐공간 작업"], ["height", "고소 작업"]];
const hzLabel = (t: Task) => HZ_ORDER.find(([h]) => t.hazards.includes(h))?.[1] ?? "작업";

/** 그날 하루(07~19시) 안의 시간대. 여러 날 이어지는 작업·충돌은 매일 시작 시각~끝 시각으로 본다 (시안과 같은 방식) */
function span(start: string, end: string, date: string): [number, number] | null {
  if (start.slice(0, 10) > date || end.slice(0, 10) < date) return null;
  let a = hourOf(start);
  let b = hourOf(end);
  if (b <= a) [a, b] = [H0, H1]; // 자정·밤샘에 걸친 작업은 그날 주간 전체로 [팀 설정값]
  a = Math.max(H0, a);
  b = Math.min(H1, b);
  return b > a ? [a, b] : null;
}

/** 겹치지 않게 막대를 줄에 나눈다 (시안 lanes) */
function lanes<T extends { h0: number; h1: number }>(items: T[]): { item: T; lane: number }[] {
  const ends: number[] = [];
  return [...items]
    .sort((x, y) => x.h0 - y.h0)
    .map((item) => {
      let lane = ends.findIndex((e) => e <= item.h0);
      if (lane < 0) lane = ends.push(0) - 1;
      ends[lane] = item.h1;
      return { item, lane };
    });
}

type DayTask = Task & { h0: number; h1: number };
type DayConflict = { rec: ConflictRecord; c: Conflict; h0: number; h1: number };

export function BoardView({ role, date, setDate, zones, tasks, conflicts, plans, onAdjusted, onShared, onShow3D }: Props) {
  const me = role.kind === "contractor" ? role.contractor : undefined;
  const isPrime = !me;
  const { now, setNow } = useShell(); // 시연 시각은 헤더 큰 시계와 같은 값
  const [sel, setSel] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [risk, setRisk] = useState<RiskWindow[]>([]);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState<TbmCheckRecord[]>([]);
  const detailRef = useRef<HTMLElement>(null);
  // 카드를 누르면 아래의 충돌 상세(근거·공유·조정안)로 내려간다 (시안의 오른쪽 서랍 대신)
  useEffect(() => {
    if (sel) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sel]);

  // 위험 시간대(F9)·적용 중인 조정(점선 막대)·TBM 확인(F7): 판정이 바뀌면(conflicts) 다시 받는다
  useEffect(() => {
    api.riskWindows({ on: date, contractor: me }).then(setRisk).catch(() => setRisk([]));
  }, [date, me, conflicts]);
  useEffect(() => {
    api
      .adjustments({ contractor: me })
      .then((rs) => setMoved(new Set(rs.filter((r) => r.status === "active").map((r) => r.adjustment.task_id))))
      .catch(() => setMoved(new Set()));
    api.tbmChecks(me).then(setChecks).catch(() => setChecks([]));
  }, [me, conflicts]);
  useEffect(() => setSel(null), [date]);

  const colorOf = useMemo(() => {
    const names = [...new Set(tasks.map((t) => t.contractor))].filter((c) => !c.startsWith("원청")).sort();
    return (c: string) => (c.startsWith("원청") ? "#8a929b" : PALETTE[names.indexOf(c) % PALETTE.length]);
  }, [tasks]);

  const dayTasks: DayTask[] = useMemo(
    () =>
      tasks.flatMap((t) => {
        const s = span(t.start, t.end, date);
        return s ? [{ ...t, h0: s[0], h1: s[1] }] : [];
      }),
    [tasks, date],
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const dayConflicts: DayConflict[] = useMemo(
    () =>
      conflicts.flatMap((rec) => {
        const s = span(rec.conflict.window_start, rec.conflict.window_end, date);
        return s ? [{ rec, c: rec.conflict, h0: s[0], h1: s[1] }] : [];
      }),
    [conflicts, date],
  );
  // 시간표 띠에는 작업끼리의 겹침만 (표준서 결함은 작업 하나라 카드로만)
  const pairs = dayConflicts.filter((d) => d.c.type !== "sop_missing");
  const prohibited = dayConflicts.filter((d) => d.c.grade === "금지");
  const nowC = pairs.filter((d) => d.h0 <= now && now < d.h1);
  const latestPlan = useMemo(() => [...plans].sort((a, b) => b.id - a.id)[0] ?? null, [plans]);
  const blockedZones = useMemo(() => {
    const ids = new Set(dayConflicts.map((d) => d.c.id));
    return new Set(restrictionsFrom(conflicts.map((r) => r.conflict).filter((c) => ids.has(c.id)), tasks).map((r) => r.zone_id)).size;
  }, [conflicts, dayConflicts, tasks]);

  // 위험 시간대 띠: 30분 칸마다 그 칸에 걸친 시간대(서버가 구역별로 묶은 것) 중 가장 높은 점수와 등급.
  // 점수는 서버가 매긴 값 그대로 쓴다 (구역끼리 더하면 위아래 충돌이 두 구역에 두 번 셈해진다)
  const riskSlots = useMemo(() => {
    const slots: { score: number; grade: Grade | null }[] = Array.from({ length: SLOTS }, () => ({ score: 0, grade: null }));
    for (const w of risk) {
      const s = span(w.start, w.end, date);
      if (!s) continue;
      for (let i = 0; i < SLOTS; i++) {
        const v = H0 + i / 2;
        if (v < s[1] && v + 0.5 > s[0] && w.score > slots[i].score) slots[i] = { score: w.score, grade: w.peak_grade };
      }
    }
    return slots;
  }, [risk, date]);
  const peak = useMemo(() => [...risk].sort((a, b) => b.score - a.score)[0], [risk]);
  const peakSpan = peak ? span(peak.start, peak.end, date) : null;
  const dayChecks = checks.filter((c) => c.date === date);

  // 충돌 있는 날: 금지 먼저, 그다음 이른 날 — 6곳
  const jumps = useMemo(() => {
    const ds = [...conflicts]
      .filter((r) => r.conflict.type !== "sop_missing")
      .sort((a, b) => GRADE_RANK[b.conflict.grade] - GRADE_RANK[a.conflict.grade] || a.conflict.window_start.localeCompare(b.conflict.window_start))
      .map((r) => r.conflict.window_start.slice(0, 10));
    return [...new Set(ds)].slice(0, 6).sort();
  }, [conflicts]);

  const selected = sel ? dayConflicts.find((d) => d.c.id === sel) ?? null : null;
  const hit = new Set(selected?.c.task_ids ?? []);
  const x = (v: number) => ((v - H0) / (H1 - H0)) * 100;
  const pos = (a: number, b: number): CSSProperties => ({ left: `${x(a)}%`, width: `${((b - a) / (H1 - H0)) * 100}%` });
  const nowIn = now >= H0 && now <= H1;

  // 구역 행: 위층부터. 작업도 겹침도 없는 구역은 숨기고 "모두 보기"로 연다
  const ordered = [...zones].sort((a, b) => b.vertical_order - a.vertical_order);
  // 협력사 화면은 시안처럼 우리 작업 줄을 먼저, 타사(빗금) 막대는 그 아래 줄에 둔다
  const rows = ordered.map((z) => {
    const zt = dayTasks.filter((t) => t.zone_id === z.id);
    const own = lanes(me ? zt.filter((t) => t.contractor === me) : zt);
    const nOwn = Math.max(0, ...own.map((p) => p.lane + 1));
    const others = lanes(me ? zt.filter((t) => t.contractor !== me) : []).map((p) => ({ ...p, lane: p.lane + nOwn }));
    const zc = pairs.filter((d) => d.c.task_ids.some((id) => taskById.get(id)?.zone_id === z.id));
    return { z, placed: [...own, ...others], zc, empty: zt.length === 0 && zc.length === 0 };
  });
  const hidden = rows.filter((r) => r.empty).length;
  const shown = rows.filter((r) => showAll || !r.empty);

  // 시연 시각 ◀ ▶: 30분씩, 07:00~18:30 안에서 (헤더 큰 시계와 같은 값)
  const moveNow = (v: number) => setNow(Math.max(H0, Math.min(H1 - 0.5, Math.round(v * 2) / 2)));
  const nowOpts = NOPT.includes(now) ? NOPT : [...NOPT, now].sort((a, b) => a - b);

  // 좁은 화면: 시간표만 가로로 스크롤한다(구역 칸은 고정). 날짜·시각이 바뀌면 "지금" 선을 보이는 시간 영역의 왼쪽 1/3에 맞춘다.
  // 같은 날짜·시각으로 다시 그릴 때는 손으로 옮긴 스크롤을 그대로 둔다 (시안 tlScroll)
  const tlWrapRef = useRef<HTMLDivElement>(null);
  const tlKey = useRef("");
  useLayoutEffect(() => {
    const w = tlWrapRef.current;
    if (!w || !w.clientWidth) return; // 숨겨져 있으면 보일 때 맞춘다
    const k = `${date}|${now}`;
    if (tlKey.current === k) return;
    tlKey.current = k;
    const ln = w.querySelector<HTMLElement>(".tl-lines .now");
    if (!ln || w.scrollWidth <= w.clientWidth) return;
    const lw = w.querySelector<HTMLElement>(".tl-row>.lab")?.offsetWidth ?? 0;
    const at = ln.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft;
    w.scrollLeft = Math.max(0, Math.min(w.scrollWidth - w.clientWidth, Math.round(at - lw - (w.clientWidth - lw) / 3)));
  });

  const acts = [...dayConflicts].sort(
    (a, b) => GRADE_RANK[b.c.grade] - GRADE_RANK[a.c.grade] || Number(a.h1 <= now) - Number(b.h1 <= now) || a.h0 - b.h0,
  );
  const when = (d: DayConflict) => {
    if (d.h1 <= now) return "오늘 종료";
    if (d.h0 <= now) return <span className="kw">진행 중</span>;
    const m = Math.round((d.h0 - now) * 60);
    return (
      <>
        <span className="t">{m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`}</span> 후 시작
      </>
    );
  };
  const label = (c: Conflict) =>
    c.task_ids
      .slice(0, 2)
      .map((id) => {
        const t = taskById.get(id);
        return t ? (me && t.contractor !== me ? `타사 ${t.name}` : `${short(t.contractor)} ${t.name}`) : id;
      })
      .join(c.type === "sequence" ? " ← 선행 " : " ↔ ") + (c.task_ids.length > 2 ? ` 외 ${c.task_ids.length - 2}건` : "");
  const who = (t: Task | undefined, id: string): ReactNode => {
    if (!t) return id;
    if (me && t.contractor !== me) return `타사 ${t.name}`;
    return (
      <>
        <b>{short(t.contractor)}</b> {t.name}
        {t.crew != null && <> {t.crew}명</>}
      </>
    );
  };
  // 카드 문장: 시안처럼 구역·업체·시각을 짧게, 위험 낱말 하나만 빨강, 시각은 파랑, 인원은 굵게 (전체 판정 이유는 상세에)
  const sentence = (d: DayConflict): ReactNode => {
    const c = d.c;
    const [a, b] = c.task_ids.map((id) => taskById.get(id));
    const za = a ? zoneById.get(a.zone_id)?.name ?? a.zone_id : "";
    const zb = b ? zoneById.get(b.zone_id)?.name ?? b.zone_id : "";
    const ja = (x: string, y: string) => josa(a?.name ?? "", x, y);
    const jb = (x: string, y: string) => josa(b?.name ?? "", x, y);
    const time = (
      <span className="t">
        {hh(d.h0)}–{hh(d.h1)}
      </span>
    );
    if (c.type === "sop_missing")
      return (
        <>
          {who(a, c.task_ids[0])} 계획서에 작업표준서 핵심 단계가 <span className="kw">빠졌습니다</span>. 보완해 다시 제출해야 합니다.
        </>
      );
    if (c.task_ids.length > 2)
      return (
        <>
          전 구역 작업 {who(a, c.task_ids[0])}
          {ja("이", "가")} 작업 {c.task_ids.length - 1}건과 <span className="kw">겹칠 수 있습니다</span> · {time}
        </>
      );
    if (c.type === "sequence")
      return (
        <>
          {who(b, c.task_ids[1])}
          {jb("이", "가")} 선행 작업 {who(a, c.task_ids[0])}
          {ja("이", "가")} <span className="kw">끝나기 전</span>에 시작합니다 · 선행 완료 <span className="t">{a ? a.end.slice(5, 10).replace("-", "/") : "?"}</span>
        </>
      );
    if (c.type === "vertical")
      return (
        <>
          {za}에서 {who(a, c.task_ids[0])}
          {ja("을", "를")} 하는 동안 <span className="kw">바로 아래</span> {zb}에서 {who(b, c.task_ids[1])} · {time}
        </>
      );
    if (c.type === "hot_gas")
      return (
        <>
          {who(a, c.task_ids[0])}
          {ja("과", "와")} {who(b, c.task_ids[1])}
          {jb("이", "가")} <span className="kw">화기·가스</span> 거리 안에서 겹칩니다 · {time}
        </>
      );
    return (
      <>
        {za}에서 {who(a, c.task_ids[0])}
        {ja("과", "와")} {who(b, c.task_ids[1])}
        {jb("이", "가")} <span className="kw">같은 시간</span>에 겹칩니다 · {time}
      </>
    );
  };
  const pickTask = (t: Task) => {
    const top = dayConflicts.filter((d) => d.c.task_ids.includes(t.id)).sort((a, b) => GRADE_RANK[b.c.grade] - GRADE_RANK[a.c.grade])[0];
    setSel(top ? top.c.id : null);
  };

  const stat = (k: string, v: string | number, u: string, d: React.ReactNode, red = false) => (
    <div className="stat" key={k}>
      <span className="k">{k}</span>
      <span className="v">
        <span className="big" style={red ? { color: "var(--red)" } : undefined}>
          {v}
        </span>
        <small>{u}</small>
      </span>
      <span className="d">{d}</span>
    </div>
  );
  const firms = new Set(dayTasks.map((t) => t.contractor));
  const crewOf = (ts: Task[]) => ts.reduce((a, t) => a + (t.crew ?? 0), 0);
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  // 계획 변경 배너: 가장 최근 제출이 드러낸 충돌 (원청 화면, 아직 열려 있는 것)
  const fromLatest = latestPlan ? conflicts.filter((r) => r.plan_id === latestPlan.id) : [];
  const latestTop = [...fromLatest].sort(
    (a, b) => GRADE_RANK[b.conflict.grade] - GRADE_RANK[a.conflict.grade] || a.conflict.window_start.localeCompare(b.conflict.window_start),
  )[0];
  const goTo = (r: ConflictRecord) => {
    setDate(r.conflict.window_start.slice(0, 10));
    window.setTimeout(() => setSel(r.conflict.id), 0); // 날짜를 바꾸면 선택이 지워지므로 그 뒤에 고른다
  };
  const mine = dayTasks.filter((t) => t.contractor === me);

  return (
    <div className="pb">
      {!isPrime && (
        <p className="note" style={{ margin: "0 0 10px" }}>
          우리 작업과, 원청이 공유한 충돌의 상대 작업(빗금 막대)만 보입니다. 그 밖의 다른 회사 일정은 볼 수 없습니다.
        </p>
      )}

      {isPrime && latestPlan && latestTop && (
        <div className="banner">
          <span className="pill ban">계획 변경</span>
          <span>
            <b>{short(latestPlan.contractor)}</b> 계획서 v{latestPlan.version} 제출 · 전체 일정과 다시 대조했습니다. 이 제출로 새로 드러난 <span className="kw">충돌</span>{" "}
            <b>{fromLatest.length}건</b>
            {fromLatest.some((r) => r.conflict.grade === "금지") && <> (금지 {fromLatest.filter((r) => r.conflict.grade === "금지").length}건)</>}
          </span>
          <span className="grow" />
          <button type="button" className="btn sm" onClick={() => goTo(latestTop)}>
            새 충돌 보기
          </button>
        </div>
      )}

      <div className="stats">
        {isPrime ? stat("작업 업체", firms.size, "곳", `작업 ${dayTasks.length}건`) : stat("우리 업체 작업", mine.length, "건", short(me!))}
        {stat("투입 인원", crewOf(isPrime ? dayTasks : mine), "명", isPrime ? `오늘 계획 기준 · 출입 제한 ${blockedZones}곳` : "우리 업체")}
        {stat("겹침", pairs.length, "건", `조건부 ${pairs.filter((d) => d.c.grade === "조건부").length} · 금지 ${pairs.filter((d) => d.c.grade === "금지").length}`)}
        {stat("금지", prohibited.length, "건", "같이 하면 안 되는 조합", prohibited.length > 0)}
        {stat("지금 진행 중 겹침", nowC.length, "건", nowC.length ? label(nowC[0].c) : "없음")}
        <div className="stat">
          <span className="k">
            위험 시간대 <span className="fx">F9</span>
          </span>
          <span className="v">
            <span className="big t">{peakSpan ? hh(peakSpan[0]) : "—"}</span>
            <small>{peakSpan ? `~${hh(peakSpan[1])}` : ""}</small>
          </span>
          <span className="d">{peak ? `${peak.peak_grade} · 겹침 ${peak.conflict_ids.length}건` : "없음"}</span>
        </div>
        {stat("TBM 확인", dayChecks.length, "건", dayChecks.length ? `빠짐 ${dayChecks.reduce((a, c) => a + c.missing_ids.length, 0)}건` : "기록 없음")}
      </div>

      <section className="card">
        <header>
          <h2>오늘 작업 시간표</h2>
          <span className="sub">
            {hh(H0)}–{hh(H1)} · 30분 칸 · 구역은 위층부터
            {hidden > 0 && (
              <>
                {" "}
                · 작업 없는 구역 {hidden}곳 {showAll ? "포함" : "숨김"} ·{" "}
                <button type="button" className="link" style={{ padding: 0 }} onClick={() => setShowAll(!showAll)} aria-pressed={showAll}>
                  {showAll ? "숨기기" : "모두 보기"}
                </button>
              </>
            )}
          </span>
          <span className="grow" />
          {jumps.length > 0 && (
            <div className="jumps">
              <span className="sub">충돌 있는 날</span>
              {jumps.map((d) => (
                <button key={d} type="button" className="jump" aria-pressed={d === date} onClick={() => setDate(d)}>
                  {d.slice(5).replace("-", "/")}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="tlbar">
          <span className="tctl" role="group" aria-label="시연 시각">
            <button type="button" className="jump" aria-label="30분 전" disabled={now <= H0} onClick={() => moveNow(now - 0.5)}>
              ◀
            </button>
            <select aria-label="시연 시각" value={now} onChange={(e) => moveNow(Number(e.target.value))}>
              {nowOpts.map((v) => (
                <option key={v} value={v}>
                  {hh(v)}
                </option>
              ))}
            </select>
            <button type="button" className="jump" aria-label="30분 뒤" disabled={now >= H1 - 0.5} onClick={() => moveNow(now + 0.5)}>
              ▶
            </button>
            {now !== DEF_NOW && (
              <button type="button" className="link" onClick={() => setNow(DEF_NOW)}>
                {hh(DEF_NOW)}으로
              </button>
            )}
          </span>
        </div>

        <div className="tl-wrap" ref={tlWrapRef}>
          <div className={`tl ${selected ? "sel" : ""}`}>
            <div className="tl-risk">
              <div className="lab">위험 시간대</div>
              <div className="risk">
                {riskSlots.map((r, i) => (
                  <span key={i} className={riskClass(r.score)} title={`${hh(H0 + i / 2)} ${r.grade ? `위험도 ${r.score} · ${r.grade}` : "위험 없음"}`} />
                ))}
              </div>
            </div>
            <div className="tl-scale">
              <div className="sub" style={{ padding: "5px 12px" }}>
                구역
              </div>
              <div className="ticks">
                {Array.from({ length: (H1 - H0) / 2 + 1 }, (_, i) => H0 + i * 2)
                  .filter((v) => !nowIn || Math.abs(v - now) >= 0.75)
                  .map((v) => (
                    <span key={v} style={{ left: `${x(v)}%`, ...(v === H1 ? { transform: "translateX(-100%)", paddingRight: 4 } : v === H0 ? { transform: "none", paddingLeft: 4 } : {}) }}>
                      {hh(v)}
                    </span>
                  ))}
                {nowIn && (
                  // 양 끝(07:00·19:00 근처)에서는 표지가 구역 칸 밑으로 숨지 않게 안쪽으로 붙인다
                  <span className="nowchip" style={{ left: `${x(now)}%`, ...(now - H0 < 0.75 ? { transform: "none" } : H1 - now < 0.75 ? { transform: "translateX(-100%)" } : {}) }}>
                    지금 {hh(now)}
                  </span>
                )}
              </div>
            </div>

            {shown.map(({ z, placed, zc }) => {
              const nLanes = Math.max(1, ...placed.map((p) => p.lane + 1));
              const rowH = Math.max(52, nLanes * LANE + 8 + zc.length * 8);
              const nowRisk = zc.find((d) => d.h0 <= now && now < d.h1);
              return (
                // 높이는 막대 줄 수로 정하되(시안), 구역 이름이 길어 두 줄이 되면 그만큼 늘어난다
                <div className="tl-row" key={z.id} style={{ minHeight: rowH }}>
                  <div className="lab">
                    <span className="z">
                      {z.name}
                      {nowRisk && <span className="rk">● {nowRisk.c.grade === "금지" ? "작업 금지" : "위험 높음"}</span>}
                    </span>
                    {/* 시안의 층 표시 자리: 서버 구역 데이터에는 층이 없어 설명을 한 줄로 줄여 보인다 (전체는 마우스를 올리면) */}
                    <span className="sub zs">
                      <span className="ds" title={z.description}>
                        {z.description}
                      </span>
                      <span className="cr">
                        ·{" "}
                        {(() => {
                          const crew = crewOf(placed.map((x) => x.item).filter((t) => !me || t.contractor === me));
                          if (crew) return <b style={{ color: "var(--ink)" }}>{crew}명</b>;
                          return placed.length ? (me ? "타사 작업 (우리 작업에 영향)" : `작업 ${placed.length}건`) : "작업 없음";
                        })()}
                      </span>
                    </span>
                  </div>
                  <div className="track">
                    {placed.map(({ item: t, lane }) => {
                      const other = !!me && t.contractor !== me;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`tb ${other ? "ghost" : ""} ${moved.has(t.id) ? "moved" : ""} ${hit.has(t.id) ? "hit" : ""}`}
                          style={{ ["--pc" as string]: colorOf(t.contractor), ...pos(t.h0, t.h1), top: lane * LANE + 4 } as CSSProperties}
                          title={
                            other
                              ? `우리 작업에 영향을 주는 타사 작업 · ${t.name} · ${hzLabel(t)}`
                              : `${t.id} ${t.contractor} ${t.name} ${hh(t.h0)}–${hh(t.h1)}${t.crew != null ? ` · ${t.crew}명` : ""}${moved.has(t.id) ? " · 조정으로 옮겨짐" : ""}`
                          }
                          onClick={() => pickTask(t)}
                        >
                          {other ? (
                            <>
                              타사 {t.name} · {hzLabel(t)}
                            </>
                          ) : (
                            <>
                              <span className="who">{short(t.contractor)}</span>
                              {t.name}
                              {t.crew != null && <b>{t.crew}명</b>}
                            </>
                          )}
                        </button>
                      );
                    })}
                    {zc.map((d, i) => (
                      <span
                        key={d.c.id}
                        className={`ov ${d.rec.status === "adjusted" ? "met" : ""}`}
                        style={{ ["--c" as string]: GRADE_VAR[d.c.grade], ...pos(d.h0, d.h1), top: nLanes * LANE + 4 + i * 8 } as CSSProperties}
                        title={`${d.c.grade} · ${label(d.c)} · ${d.c.rule_id}${d.rec.status === "adjusted" ? " · 조정 적용" : ""}`}
                        onClick={() => setSel(d.c.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && (
              <div className="tl-row">
                <div className="lab">
                  <span className="sub">작업 있는 구역 없음</span>
                </div>
                <div className="track" />
              </div>
            )}
            <div className="tl-lines">
              {Array.from({ length: H1 - H0 - 1 }, (_, i) => H0 + 1 + i).map((v) => (
                <span key={v} className="h" style={{ left: `${x(v)}%` }} />
              ))}
              {nowIn && <span className="now" style={{ left: `${x(now)}%` }} />}
            </div>
          </div>
        </div>
        <div className="tl-legend">
          <span>
            <i className="sw" style={{ background: "var(--red)" }} />
            금지 겹침
          </span>
          <span>
            <i className="sw" style={{ background: "var(--amber)" }} />
            조건부 겹침
          </span>
          <span>
            <i className="sw" style={{ background: "var(--blue)", width: 3 }} />
            지금
          </span>
          <span>
            위 띠: 위험 시간대 예보 <span className="fx">F9</span>
          </span>
          <span>점선 막대: 조정으로 옮겨진 작업</span>
          {!isPrime && <span>빗금 막대: 우리 작업에 영향을 주는 타사 작업</span>}
        </div>
      </section>

      <section className="acts">
        <div className="acts-h">
          <h2>{isPrime ? "지금 조치할 것" : "원청에서 받은 공지"}</h2>
          <span className="big" style={{ fontSize: 22, ...(acts.length ? { color: "var(--red)" } : {}) }}>
            {acts.length}
          </span>
          <span className="sub">
            건 · 겹침 {pairs.length}
            {acts.length - pairs.length ? ` + 계획 결함 ${acts.length - pairs.length}` : ""} · 금지 먼저, 시작이 가까운 순
            {isPrime ? " · 카드를 누르면 근거·공유·조정안이 아래에 열립니다" : ""}
          </span>
        </div>
        <div className="acts-grid">
          {acts.map((d) => (
            <button key={d.c.id} type="button" className="ac" style={{ ["--c" as string]: GRADE_VAR[d.c.grade] } as CSSProperties} aria-pressed={sel === d.c.id} onClick={() => setSel(sel === d.c.id ? null : d.c.id)}>
              <span className="top2">
                <span className={`pill ${GRADE_PILL[d.c.grade]}`}>{d.c.grade}</span>
                <span>{CONFLICT_TYPE_LABEL[d.c.type]}</span>
                {latestPlan && d.rec.plan_id === latestPlan.id && (
                  <span className="kw" style={{ fontSize: 12 }}>
                    최근 제출
                  </span>
                )}
                {isPrime && d.rec.shared_at && <span className="pill mute">협력사 공유됨</span>}
                {d.rec.status === "adjusted" && <span className="pill ok">조정 적용</span>}
                <span className="when">{d.c.type !== "sop_missing" ? when(d) : ""}</span>
              </span>
              <p title={d.c.reason}>{sentence(d)}</p>
              <span className="ev">
                {d.c.rule_id} · {d.c.legal_basis.split(" / ")[0]}
              </span>
            </button>
          ))}
          {acts.length === 0 && <div className="empty">{isPrime ? "이 날 조치할 겹침이 없습니다" : "이 날 원청이 공유한 충돌이 없습니다"}</div>}
        </div>
      </section>

      {selected && (
        <section className="card" style={{ marginTop: 12 }} ref={detailRef}>
          <header>
            <h2>충돌 상세 — 근거{isPrime ? " · 협력사 공유 · 조정안" : ""}</h2>
            <span className="sub">{label(selected.c)}</span>
            <span className="grow" />
            <button type="button" className="link" onClick={() => setSel(null)}>
              닫기
            </button>
          </header>
          <div style={{ padding: "0 14px 8px" }}>
            <ConflictList
              key={selected.c.id}
              records={[selected.rec]}
              tasks={tasks}
              role={role}
              onShow3D={onShow3D}
              onAdjusted={onAdjusted}
              onShared={onShared}
              initialOpenId={selected.c.id}
            />
          </div>
        </section>
      )}
    </div>
  );
}
