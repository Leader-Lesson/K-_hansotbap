// 화면 위 머리: 시안 헤더와 같은 배치 — 로고 | 큰 시계 · ‹ 날짜 › · 공정 일차 | 탭 | 보는 사람 · 계획서 올리기 · 합성 데이터
// 날짜·시각·탭은 ShellProvider 상태라 원청·협력사 화면과 같이 움직인다. 숫자는 모두 서버 데이터에서 온다
import { BrandLogo } from "@/components/BrandLogo";
import { PROJECT_END, dayNo, hhmm, shiftDay, useShell } from "@/lib/shell";
import type { ViewerRole } from "@/types";
import "./header.css";

const WD = "일월화수목금토";

interface Props {
  role: ViewerRole;
  contractors: string[]; // 보는 사람 목록 (서버 일정의 가상 협력사)
  onRole: (r: ViewerRole) => void;
  onUpload: () => void;
  apiError: string | null;
}

export function AppHeader({ role, contractors, onRole, onUpload, apiError }: Props) {
  const { date, setDate, now, tab, setTab, tabs } = useShell();
  const d = dayNo(date);
  const total = dayNo(PROJECT_END);
  const wd = WD[new Date(`${date}T00:00:00`).getDay()];
  const roleValue = role.kind === "prime" ? "prime" : role.contractor;

  return (
    <header className="hs-top">
      <div className="hs-bar">
        <div className="hs-brand">
          <BrandLogo />
          <div>
            <div className="n">한솥밥</div>
            <div className="s">광양 2고로 개수 · 세이프루프</div>
          </div>
        </div>

        <div className="hs-clock">
          <span className="big" title="시연 시각 (상황판 시간표의 '지금' 선)">
            {hhmm(now)}
            {now >= 24 && <small>다음 날</small>}
          </span>
          <span className="when">
            <span className="hs-daynav">
              <button type="button" aria-label="전날" onClick={() => setDate(shiftDay(date, -1))}>
                ‹
              </button>
              <input type="date" aria-label="기준 날짜" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button type="button" aria-label="다음날" onClick={() => setDate(shiftDay(date, 1))}>
                ›
              </button>
            </span>
            <span className="sub">
              D<b>{d}</b> / {total} · {wd}요일 · 날짜를 바꾸면 일차가 따라 바뀝니다
            </span>
          </span>
        </div>

        <nav className="hs-tabs" role="tablist" aria-label="화면">
          {tabs.map((t) => (
            <button key={t.value} type="button" role="tab" className="hs-tab" aria-selected={t.value === tab} onClick={() => setTab(t.value)}>
              {t.label}
              {!!t.count && <span className="hs-badge">{t.count}</span>}
            </button>
          ))}
        </nav>

        <div className="hs-right">
          <label className="hs-role">
            <select
              aria-label="보는 사람"
              value={roleValue}
              onChange={(e) => onRole(e.target.value === "prime" ? { kind: "prime" } : { kind: "contractor", contractor: e.target.value })}
            >
              <option value="prime">원청 (전체)</option>
              {contractors.map((c) => (
                <option key={c} value={c}>
                  협력사: {c}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="hs-up" onClick={onUpload}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
            계획서 올리기
          </button>
          <span className="hs-synth">합성 데이터</span>
          <span className={`hs-api${apiError ? " off" : ""}`} title={apiError ? `API 연결 실패: ${apiError}` : "API 연결됨"} />
          <a className="hs-link" href="/prototype/index.html" title="합성 데이터로 흐름만 보여 주는 정적 시안. 서버에 연결되지 않아 올린 계획서가 판정되지 않습니다">
            정적 시안
          </a>
        </div>
      </div>
    </header>
  );
}
