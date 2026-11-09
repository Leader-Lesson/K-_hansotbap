// 화면 공통 상태: 날짜 · 시연 시각 · 탭. 헤더(AppHeader)와 원청·협력사 화면이 같이 쓴다 (시안 헤더처럼 날짜·시계·탭이 위에 있게)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PROJECT_D0, defaultSiteDate } from "@/lib/siteDate";

export const DATE_KEY = "hansotbap.date"; // 판정 후 강제 새로고침을 해도 보던 날짜가 남게
export const NOW_KEY = "hansotbap.now"; // 시연 시각 (상황판 시간표의 "지금" 선)
export const DEF_NOW = 10.5; // 시연 시각 기본 10:30 (시안과 같음) [팀 설정값]

export interface TabDef {
  value: string;
  label: string;
  count?: number; // 빨간 숫자 배지 (0이면 안 보임)
}

interface Shell {
  date: string; // 지금 보는 날짜 (고른 날짜, 없으면 화면이 정한 기본 날짜)
  setDate: (d: string | null) => void; // null = 기본 날짜로
  registerDefaultDate: (d: string) => void; // 화면이 자기 데이터로 정한 기본 날짜를 알린다
  now: number; // 시연 시각 (시 단위 소수, 10.5 = 10:30)
  setNow: (v: number) => void;
  tab: string;
  setTab: (v: string) => void;
  tabs: TabDef[];
  registerTabs: (t: TabDef[]) => void; // 화면이 자기 탭 목록을 헤더에 올린다
}

const Ctx = createContext<Shell | null>(null);

const read = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* 저장이 막혀도 화면은 동작 */
  }
};

export function ShellProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(() => read(DATE_KEY));
  const [defaultDate, setDefaultDate] = useState(defaultSiteDate); // 화면이 데이터를 받아 정하기 전에는 오늘
  const [now, setNowState] = useState<number>(() => Number(read(NOW_KEY)) || DEF_NOW);
  const [tab, setTab] = useState("board");
  const [tabs, setTabsState] = useState<TabDef[]>([]);

  const setDate = useCallback((d: string | null) => {
    setOverride(d);
    write(DATE_KEY, d);
  }, []);
  const setNow = useCallback((v: number) => {
    setNowState(v);
    write(NOW_KEY, String(v));
  }, []);
  const setTabs = useCallback((t: TabDef[]) => {
    setTabsState((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
    // 역할을 바꿔 지금 탭이 없어지면 상황판으로
    setTab((cur) => (t.length && !t.some((x) => x.value === cur) ? t[0].value : cur));
  }, []);

  const value = useMemo<Shell>(
    () => ({
      date: override ?? defaultDate,
      setDate,
      registerDefaultDate: setDefaultDate,
      now,
      setNow,
      tab,
      setTab,
      tabs,
      registerTabs: setTabs,
    }),
    [override, defaultDate, setDate, now, setNow, tab, tabs, setTabs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): Shell {
  const v = useContext(Ctx);
  if (!v) throw new Error("ShellProvider 밖에서 useShell 을 불렀습니다");
  return v;
}

/** 화면이 기본 날짜와 탭 목록을 헤더에 알린다 (값이 바뀔 때만) */
export function useShellRegister(defaultDate: string, tabs: TabDef[]) {
  const s = useShell();
  const key = JSON.stringify(tabs);
  const ref = useRef(s);
  ref.current = s;
  useEffect(() => ref.current.registerDefaultDate(defaultDate), [defaultDate]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => ref.current.registerTabs(tabs), [key]);
}

/** 공정 일차: D0·화입 예정일은 lib/siteDate.ts 한 곳에 둔다 (백엔드 config.project_d0 와 같은 기준) */
export { PROJECT_D0, PROJECT_END } from "@/lib/siteDate";
export const dayNo = (iso: string) =>
  Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - new Date(`${PROJECT_D0}T00:00:00`).getTime()) / 86400000);
export const shiftDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const hhmm = (v: number) => {
  const h = Math.floor(v), m = Math.round((v % 1) * 60);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
