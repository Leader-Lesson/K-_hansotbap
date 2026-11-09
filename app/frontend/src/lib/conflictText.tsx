// 충돌을 사람이 읽는 한 줄로: 조치 카드·충돌 상세가 같이 쓴다 (시안 app.js sentence·whenTxt·labelOf)
// 판정은 서버 규칙이 한 것이고, 여기서는 서버가 준 작업·구역·시각을 문장으로 엮기만 한다.
// 글씨 규칙(시안 v2): 위험 낱말 하나만 빨강(.kw) · 시각은 파랑(.t) · 사람 수는 굵게
import type { ReactNode } from "react";
import type { Conflict, Hazard, Task, Zone } from "@/types";

export const H0 = 7; // 기획서 F3: 07~19시 (상황판 시간표와 같음)
export const H1 = 19;

const pad = (n: number) => String(n).padStart(2, "0");
/** 10.5 → '10:30' */
export const hh = (v: number) => `${pad(Math.floor(v))}:${pad(Math.round((v % 1) * 60))}`;
const hourOf = (iso: string) => Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;
/** '가상-배관O' → '배관O' (화면에는 '가상-'을 떼고 쓴다) */
export const short = (c: string) => c.replace(/^가상-/, "");
/** ISO → '1/21' */
export const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
/** ISO → '1/21(목)' */
export const mdw = (iso: string) => `${md(iso)}(${WD[new Date(`${iso.slice(0, 10)}T00:00:00`).getDay()]})`;

/** 그날 하루(07~19시) 안의 시간대. 여러 날 이어지는 작업·충돌은 매일 시작 시각~끝 시각으로 본다 (상황판 시간표와 같은 방식) */
export function daySpan(start: string, end: string, date: string): [number, number] | null {
  if (start.slice(0, 10) > date || end.slice(0, 10) < date) return null;
  let a = hourOf(start);
  let b = hourOf(end);
  if (b <= a) [a, b] = [H0, H1]; // 자정·밤샘에 걸친 작업은 그날 주간 전체로 [팀 설정값]
  a = Math.max(H0, a);
  b = Math.min(H1, b);
  return b > a ? [a, b] : null;
}

/** 받침에 맞는 조사 (한글이 아니면 '이(가)' 꼴) */
export function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${withBatchim}(${without})`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}

/** 타사 작업을 가릴 때 쓰는 위험 유형 (시안 HZ와 같은 우선순위) */
const HZ_ORDER: [Hazard, string][] = [["heavy_lift", "인양 작업"], ["gas", "가스 배관 작업"], ["hot_work", "화기 작업"], ["confined", "밀폐공간 작업"], ["height", "고소 작업"]];
export const hzLabel = (t: Task) => HZ_ORDER.find(([h]) => t.hazards.includes(h))?.[1] ?? "작업";

export interface TextCtx {
  taskById: Map<string, Task>;
  zoneById: Map<string, Zone>;
  me?: string; // 보는 협력사 (원청이면 없음) — 타사 작업은 '타사 작업명'으로만 쓴다
}

/** 협력사 화면에서 이 작업이 타사 작업인가 */
export const isOther = (t: Task | undefined, me?: string) => !!me && !!t && t.contractor !== me;

/** 짧은 이름표: '배관O 질소 라인 연결 ← 선행 축로I 노흉 축조' (카드 문장 밖, 시간표·결과 목록에서) */
export function conflictLabel(c: Conflict, { taskById, me }: Pick<TextCtx, "taskById" | "me">): string {
  const nm = (id: string) => {
    const t = taskById.get(id);
    if (!t) return id;
    return isOther(t, me) ? `타사 ${t.name}` : `${short(t.contractor)} ${t.name}`;
  };
  const ids = c.task_ids;
  if (c.type === "sequence" && ids.length >= 2) return `${nm(ids[1])} ← 선행 ${nm(ids[0])}`;
  return ids.slice(0, 2).map(nm).join(" ↔ ") + (ids.length > 2 ? ` 외 ${ids.length - 2}건` : "");
}

/** 시작까지 남은 시간 · 진행 중 · 오늘 종료 (시안 whenTxt) */
export function whenText(h0: number, h1: number, now: number): ReactNode {
  if (h1 <= now) return "오늘 종료";
  if (h0 <= now) return <span className="kw">진행 중</span>;
  const m = Math.round((h0 - now) * 60);
  return (
    <>
      <span className="t">{m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`}</span> 후 시작
    </>
  );
}

/** 문장 속 작업 이름: 우리(원청은 전부) 작업은 업체·작업·인원, 타사 작업은 '타사 작업명'만 */
function who(t: Task | undefined, id: string, me?: string): ReactNode {
  if (!t) return id;
  if (isOther(t, me)) return `타사 ${t.name}`;
  return (
    <>
      <b>{short(t.contractor)}</b> {t.name}
      {t.crew != null && <> {t.crew}명</>}
    </>
  );
}

/**
 * 카드·상세 첫 줄 문장. 구역·업체·시각을 짧게, 위험 낱말 하나만 빨강 (전체 판정 이유는 상세의 '판정 이유'에).
 * span 은 그날 07~19시 안의 겹침 시간대 (없으면 충돌 기간의 시각을 그대로 쓴다)
 */
export function conflictSentence(c: Conflict, span: [number, number] | null, { taskById, zoneById, me }: TextCtx): ReactNode {
  const [a, b] = c.task_ids.map((id) => taskById.get(id));
  const zn = (t?: Task) => (t ? zoneById.get(t.zone_id)?.name ?? t.zone_id : "");
  const ja = (x: string, y: string) => josa(a?.name ?? "", x, y);
  const jb = (x: string, y: string) => josa(b?.name ?? "", x, y);
  const [h0, h1] = span ?? [hourOf(c.window_start), hourOf(c.window_end)];
  const time = (
    <span className="t">
      {hh(h0)}–{hh(h1)}
    </span>
  );
  const A = who(a, c.task_ids[0], me);
  const B = who(b, c.task_ids[1], me);
  if (c.type === "sop_missing")
    return (
      <>
        {A} 계획서에 작업표준서 핵심 단계가 <span className="kw">빠졌습니다</span>. 보완해 다시 제출해야 합니다.
      </>
    );
  if (c.task_ids.length > 2)
    return (
      <>
        전 구역 작업 {A}
        {ja("이", "가")} 작업 {c.task_ids.length - 1}건과 <span className="kw">겹칠 수 있습니다</span> · {time}
      </>
    );
  if (c.type === "sequence")
    return (
      <>
        {B}
        {jb("이", "가")} 선행 작업 {A}
        {ja("이", "가")} <span className="kw">끝나기 전</span>에 시작합니다 · 선행 완료 <span className="t">{a ? mdw(a.end) : "?"}</span>
      </>
    );
  if (c.type === "vertical")
    return (
      <>
        {zn(a)}에서 {A}
        {ja("을", "를")} 하는 동안 <span className="kw">바로 아래</span> {zn(b)}에서 {B} · {time}
      </>
    );
  if (c.type === "hot_gas")
    return (
      <>
        {A}
        {ja("과", "와")} {B}
        {jb("이", "가")} <span className="kw">화기·가스</span> 거리 안에서 겹칩니다 · {time}
      </>
    );
  return (
    <>
      {zn(a)}에서 {A}
      {ja("과", "와")} {B}
      {jb("이", "가")} <span className="kw">같은 시간</span>에 겹칩니다 · {time}
    </>
  );
}
