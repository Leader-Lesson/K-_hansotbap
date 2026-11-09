// F7 TBM 전달 확인: 시안(public/prototype #tbm, M1 큰 체크리스트) 배치를 서버 데이터로.
// 전달 항목은 서버가 공유된 조정·위험 시간대·원청 공지로 만든다 → 팀장 발언(녹음 받아쓰기 또는 직접 입력)과 대조 → 항목별 전달·빠짐.
// 빠진 항목을 다시 말하고 다시 대조하면 보충 전달로 남는다(새 확인 기록). 전달 여부는 LLM이 판단하고 서버 규칙이 다시 확인한다.
// 시스템은 작업을 승인·중지하지 않는다 — 빠진 항목을 보충 전달하라고 알릴 뿐이다
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api/client";
import { md, mdhm, partyColor, ymdw } from "@/lib/partyColor";
import { usePerson } from "@/lib/person";
import { useShell } from "@/lib/shell";
import type { Task, TbmCheckRecord, TbmChecklist, TbmItem, TbmItemKind, ViewerRole } from "@/types";
import "./s6.css";

interface Props {
  role: ViewerRole;
  contractors: string[]; // 원청이 고를 수 있는 협력사
  tasks: Task[]; // 오늘 작업 줄·업체별 상태 (서버가 역할에 맞게 거른 작업)
  defaultContractor?: string;
}

const KIND_LABEL: Record<TbmItemKind, string> = { adjustment: "원청 조정", risk_window: "위험 시간대 예보 F9", notice: "원청 공지" };
const AUDIO_ACCEPT = ".wav,.m4a,.mp3,.webm,.ogg"; // 서버(api/tbm.py)가 받는 형식
const hm = (iso: string) => iso.slice(11, 16);
const onDate = (t: Task, date: string) => t.start.slice(0, 10) <= date && t.end.slice(0, 10) >= date;
const latestFor = (records: TbmCheckRecord[], c: string, date: string) => records.filter((r) => r.contractor === c && r.date === date); // 최근순

type Status = { k: "todo" | "miss" | "ok"; txt: string };
function statusOf(runs: TbmCheckRecord[], items: number): Status {
  const [run, prev] = runs;
  if (!run) return { k: "todo", txt: items ? `미실시 · ${items}개 전달할 것` : "미실시 · 전달할 항목 없음" };
  if (run.missing_ids.length) return { k: "miss", txt: `빠짐 ${run.missing_ids.length}건` };
  return { k: "ok", txt: prev?.missing_ids.length ? `보충 완료 ${hm(run.checked_at)}` : `모두 전달 ${hm(run.checked_at)}` };
}

export function TbmView({ role, contractors, tasks, defaultContractor }: Props) {
  const isPrime = role.kind === "prime";
  const viewer = role.kind === "contractor" ? role.contractor : undefined;
  const { date } = useShell();
  const colorOf = useMemo(() => partyColor(tasks), [tasks]);
  const [picked, setPicked] = useState<string | null>(viewer ?? defaultContractor ?? null);
  const [lists, setLists] = useState<Record<string, TbmChecklist>>({}); // 업체 → 그날 전달 항목
  const [records, setRecords] = useState<TbmCheckRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = usePerson();

  // 그날 작업이 있는 업체 (원청 상단 업체별 TBM 줄). 협력사는 자기 업체만
  const working = useMemo(() => {
    if (viewer) return [viewer];
    const active = new Set(tasks.filter((t) => onDate(t, date)).map((t) => t.contractor));
    return contractors.filter((c) => active.has(c));
  }, [viewer, tasks, date, contractors]);
  const contractor = viewer ?? picked ?? working[0] ?? contractors[0] ?? "";

  const loadLists = useCallback(async () => {
    const want = [...new Set([...working, contractor].filter(Boolean))];
    try {
      const got = await Promise.all(want.map((c) => api.tbmChecklist(c, date)));
      setLists(Object.fromEntries(got.map((l) => [l.contractor, l])));
      setError(null);
    } catch (e) {
      setLists({});
      setError((e as Error).message);
    }
  }, [working, contractor, date]);
  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const loadRecords = useCallback(() => {
    api.tbmChecks(viewer).then(setRecords).catch(() => setRecords([]));
  }, [viewer]);
  useEffect(loadRecords, [loadRecords]);

  const items: TbmItem[] = lists[contractor]?.items ?? [];
  const listLoaded = contractor in lists; // 불러오기 전에는 "항목 없음"으로 보이지 않게
  // 전달할 항목이 없으면 녹음·대조를 막는다. 버튼만 꺼지면 고장처럼 보여서 이유를 함께 보여 준다
  const noItemsReason = !listLoaded
    ? "전달할 항목을 불러오는 중…"
    : isPrime
      ? "이 업체에 이 날 전달할 항목이 없어 녹음할 수 없습니다. 충돌을 공유하거나 위 '원청 공지 추가'로 항목을 넣으면 켜집니다"
      : "원청이 이 날 전달할 항목(공유한 충돌·위험 시간대·공지)을 아직 보내지 않아 녹음할 수 없습니다. 원청이 공유하면 켜집니다";
  const runs = latestFor(records, contractor, date);
  const run = runs[0] ?? null;
  const prev = runs[1] ?? null;
  const res = run ? new Map(run.results.map((r) => [r.item.id, r])) : null;
  const prevMiss = new Set(prev?.missing_ids ?? []);
  const miss = run ? run.missing_ids.length : 0;
  const sup = miss > 0; // 빠진 항목이 있으면 녹음·대조가 보충 전달이 된다
  const myTasks = tasks.filter((t) => t.contractor === contractor && onDate(t, date)).sort((a, b) => a.start.localeCompare(b.start));

  // ── 팀장 발언: 녹음 → 받아쓰기 → 전사문 → 대조 ──────────────────────
  const [transcript, setTranscript] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const appendRef = useRef(false);

  // 업체·날짜를 바꾸면 그 TBM의 마지막 확인 전사문을 보여 준다 (없으면 빈칸)
  const key = `${contractor}|${date}`;
  const runText = run?.transcript ?? "";
  const shownKey = useRef("");
  useEffect(() => {
    if (shownKey.current === key || recording) return;
    shownKey.current = key;
    setTranscript(runText);
    setCheckError(null);
    setRecError(null);
  }, [key, runText, recording]);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);
  useEffect(() => () => recRef.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const putText = (text: string, append: boolean) => {
    const stamp = `[보충 전달 ${new Date().toTimeString().slice(0, 5)}]`;
    setTranscript((cur) => (append && cur.trim() ? `${cur.replace(/\s+$/, "")}\n\n${stamp}\n${text}` : text));
    setTxOpen(true);
  };

  const transcribeFile = async (file: File, append: boolean) => {
    if (!consent) {
      setRecError("참석자 녹음 동의를 먼저 체크해 주세요");
      return;
    }
    setTranscribing(true);
    setRecError(null);
    try {
      const t = await api.transcribeTbm(file, consent);
      putText(t.transcript, append);
    } catch (e) {
      setRecError(`${(e as Error).message} — 받아쓴 내용 칸에 직접 적어도 됩니다`);
      setTxOpen(true);
    } finally {
      setTranscribing(false);
    }
  };

  const startRec = async (append: boolean) => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!consent) {
      setRecError("참석자 녹음 동의를 먼저 체크해 주세요");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecError("이 브라우저에서는 바로 녹음할 수 없습니다. 녹음 파일을 올리거나 받아쓴 내용 칸에 직접 적어 주세요");
      setTxOpen(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        recRef.current = null;
        const type = r.mimeType || mime || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        if (chunks.length) void transcribeFile(new File(chunks, `tbm.${ext}`, { type }), appendRef.current);
      };
      appendRef.current = append;
      recRef.current = r;
      r.start();
      setRecSec(0);
      setRecording(true);
      setRecError(null);
    } catch {
      setRecError("마이크를 쓸 수 없습니다 (권한 거부 또는 장치 없음). 녹음 파일을 올리거나 직접 적어 주세요");
      setTxOpen(true);
    }
  };

  const check = async () => {
    if (!person.trim()) {
      setCheckError("확인한 책임자 이름을 적어 주세요 (이행 기록에 남습니다)");
      return;
    }
    if (!transcript.trim()) {
      setCheckError("받아쓴 내용이 없습니다. 녹음하거나 직접 적어 주세요");
      setTxOpen(true);
      return;
    }
    setChecking(true);
    setCheckError(null);
    try {
      // 503 이 와도 전사문은 지우지 않는다 → 다시 누르면 된다
      const rec = await api.checkTbm({ contractor, date, transcript: transcript.trim(), checked_by: person.trim() }, viewer);
      setRecords((rs) => [rec, ...rs]);
      loadRecords();
    } catch (e) {
      setCheckError(`${(e as Error).message} — 받아쓴 내용은 그대로 있으니 다시 눌러 주세요`);
    } finally {
      setChecking(false);
    }
  };

  // ── 원청 공지 추가 ──────────────────────────────────────────────────
  const [noticeText, setNoticeText] = useState("");
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const addNotice = async () => {
    if (!noticeText.trim() || !person.trim()) {
      setNoticeError("공지 문장과 확인한 책임자 이름을 적어 주세요");
      return;
    }
    try {
      await api.addTbmNotice({ contractor, date, text: noticeText.trim(), created_by: person.trim() });
      setNoticeText("");
      setNoticeError(null);
      await loadLists();
    } catch (e) {
      setNoticeError((e as Error).message);
    }
  };

  const allRows = working.map((c) => ({ c, s: statusOf(latestFor(records, c, date), lists[c]?.items.length ?? 0) }));
  const okCount = allRows.filter((r) => r.s.k === "ok").length;
  const pastRecords = records.filter((r) => r.contractor === contractor);
  const mmss = `${Math.floor(recSec / 60)}:${String(recSec % 60).padStart(2, "0")}`;

  return (
    <div className="s6">
      {error && <p className="err" style={{ marginBottom: 12 }}>{error}</p>}

      {isPrime && (
        <section className="card tbmall">
          <header>
            <h2>오늘 업체별 TBM</h2>
            <span className="sub">
              {md(date)} · 작업 있는 {working.length}곳 중 <b style={{ color: "var(--ink)" }}>{okCount}곳</b> 모두 전달
            </span>
          </header>
          <div className="tbmall-row">
            {allRows.length === 0 ? (
              <span className="sub">{md(date)}에 작업이 잡힌 협력사가 없습니다</span>
            ) : (
              allRows.map(({ c, s }) => (
                <button key={c} type="button" className={`tst ${s.k}`} aria-pressed={c === contractor} onClick={() => setPicked(c)}>
                  <span className="dot" style={{ background: colorOf(c) }} />
                  <b>{c}</b>
                  <span className="tsx">{s.txt}</span>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      <div className="tbm-h">
        <span className="pn">{contractor} TBM</span>
        <span>
          <span className="t">{ymdw(date)}</span> · 작업 시작 전
        </span>
        {isPrime && (
          <>
            <label htmlFor="tbmP" className="sub">
              협력사
            </label>
            <select id="tbmP" value={contractor} onChange={(e) => setPicked(e.target.value)}>
              {contractors.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {working.includes(c) ? "" : " (이날 작업 없음)"}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="sub">
          오늘 작업:{" "}
          {myTasks.length
            ? myTasks.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && " · "}
                  {t.name} <span className="t">{`${hm(t.start)}–${hm(t.end)}`}</span>
                  {t.crew != null && <b> {t.crew}명</b>}
                </span>
              ))
            : "없음"}
        </span>
        <span className="grow" />
        {run ? (
          <span className="sumbox">
            <span className="big" style={{ color: "var(--ok)" }}>
              {run.results.length - miss}
            </span>
            <span className="sub">전달됨</span>
            <span className="big" style={miss ? { color: "var(--red)" } : undefined}>
              {miss}
            </span>
            <span className="sub">빠짐</span>
          </span>
        ) : (
          <span className="sumbox">
            <span className="big">{items.length}</span>
            <span className="sub">개 전달할 것</span>
          </span>
        )}
      </div>

      {sup ? (
        <div className="banner rejb">
          <span className="hq">작업 시작 전 보충 전달</span>
          <span>빠진 {miss}건을 작업자에게 다시 전달한 뒤 착수하세요. 다시 말한 내용을 녹음하거나 적어서 대조하면 보충 전달로 남습니다.</span>
        </div>
      ) : run && prev?.missing_ids.length ? (
        <div className="banner okb">
          <span className="pill ok">보충 완료</span>
          <span>{hm(run.checked_at)}에 빠졌던 항목을 모두 다시 전달했습니다.</span>
        </div>
      ) : null}

      <section className="card">
        <header>
          <h2>오늘 꼭 전달할 것</h2>
          <span className="sub">원청이 공유한 충돌·조정 · 위험 시간대 · 원청 공지 (서버가 만든 항목)</span>
          <span className="grow" />
          {run && (
            <span className="ai" title={`${run.provider} ${run.model}`}>
              AI 판단
            </span>
          )}
        </header>
        <div className="m1list">
          {items.length === 0 ? (
            <div className="empty">
              {md(date)}에 {contractor || "이 업체"} 작업과 관련해 전달할 항목이 없습니다.
              <br />
              원청이 충돌을 공유하거나 조정을 적용하면, 또는 원청 공지를 더하면 생깁니다.
            </div>
          ) : (
            items.map((it) => {
              const r = res?.get(it.id);
              const st = !r ? "" : r.mentioned ? "ok" : "miss";
              const supplied = r?.mentioned && prevMiss.has(it.id);
              return (
                <div key={it.id} className={`bck ${st}`}>
                  <span className="mk" aria-label={st === "ok" ? "전달됨" : st === "miss" ? "빠짐" : "대조 전"}>
                    {st === "ok" ? "✓" : st === "miss" ? "✕" : "·"}
                  </span>
                  <div>
                    <div className={`lb${it.text.length > 45 ? " long" : ""}`}>
                      {it.text} {supplied && <span className="pill ok">보충 전달</span>}
                    </div>
                    <div className="src">
                      {KIND_LABEL[it.kind]}
                      {it.rule_ids.length > 0 && <> · <span className="mono">{it.rule_ids.join(", ")}</span></>}
                      {it.legal_basis.length > 0 && <> · {it.legal_basis.join(" / ")}</>}
                    </div>
                    {r?.quote && <blockquote>{r.quote}</blockquote>}
                    {st === "miss" && (
                      <div className="why">
                        <span className="kw">회의에서 나오지 않았습니다</span>
                      </div>
                    )}
                    {r?.note && <div className="why sub">참고: {r.note}</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {isPrime && (
          <div className="m1add">
            <b>원청 공지 추가</b>
            <input value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="예: 축조 완료·인원 철수 확인 후 질소 라인 연결" aria-label="원청 공지" />
            <button type="button" className="btn sm" onClick={addNotice} disabled={!contractor}>
              {contractor} 전달 항목에 추가
            </button>
            {noticeError && <span className="kw" style={{ fontSize: 12.5 }}>{noticeError}</span>}
          </div>
        )}
      </section>

      <section className="card m1rec">
        <button
          type="button"
          className={`recb${recording ? " on" : ""}`}
          onClick={() => void startRec(sup)}
          disabled={transcribing || !items.length}
          aria-label={recording ? "녹음 멈추고 받아쓰기" : sup ? "보충 전달 녹음 시작" : "녹음 시작"}
          title={!items.length ? noItemsReason : undefined}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {recording ? <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
          </svg>
        </button>
        <span>
          {recording ? (
            <>
              <span className="kw">듣는 중</span> <span className="t">{mmss}</span> <span className="sub">· 다시 누르면 멈추고 받아씁니다</span>
            </>
          ) : transcribing ? (
            <>
              <span className="kw">받아쓰는 중…</span> <span className="sub">CPU판 음성 서버는 녹음 길이의 2~3배 걸립니다</span>
            </>
          ) : !items.length ? (
            <>
              팀장 발언 녹음 <span className="sub">· {noItemsReason}</span>
            </>
          ) : sup ? (
            <>
              보충 전달 녹음 <span className="sub">· 빠진 {miss}건만 다시 말하면 이어 붙여 다시 대조합니다</span>
            </>
          ) : (
            <>
              팀장 발언 녹음 <span className="sub">· 멈추면 받아써서 아래 칸에 넣습니다</span>
            </>
          )}
        </span>
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          참석자 녹음 동의를 받았습니다
        </label>
        {sup && !recording && (
          <button type="button" className="link" style={{ padding: "0 4px" }} onClick={() => void startRec(false)} disabled={transcribing}>
            처음부터 다시 녹음
          </button>
        )}
        <span className="grow" />
        <input className="person" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="확인한 책임자 (필수)" aria-label="확인한 책임자" />
        <button type="button" className={`btn${sup ? "" : " pri"}`} onClick={check} disabled={!items.length || checking || recording || transcribing}>
          {checking ? "대조 중…" : "체크리스트와 대조"}
        </button>
        {(recError || checkError) && <p className="err" style={{ flexBasis: "100%" }}>{recError ?? checkError}</p>}
        <details open={txOpen} onToggle={(e) => setTxOpen(e.currentTarget.open)}>
          <summary>받아쓴 내용 {transcript ? "보기·수정" : "직접 입력"}</summary>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="팀장이 말한 내용이 여기에 받아써집니다. 음성 서버가 꺼져 있으면 직접 적거나 붙여 넣어도 됩니다." aria-label="받아쓴 내용" />
          <div className="row2" style={{ marginTop: 6 }}>
            <label className="link" style={{ cursor: "pointer", position: "relative" }}>
              녹음 파일 올리기
              <input
                type="file"
                accept={AUDIO_ACCEPT}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void transcribeFile(f, sup);
                }}
              />
            </label>
            <span className="note">녹음은 참석자 동의를 받고, 받아쓴 뒤 원본은 바로 삭제합니다. 받아쓴 글은 전달 확인 기록으로 남습니다.</span>
          </div>
        </details>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <header>
          <h2>지난 확인 기록</h2>
          <span className="sub">{contractor} · 최근순 · 이력(F5)에도 남습니다</span>
        </header>
        {pastRecords.length === 0 ? (
          <p className="empty">아직 확인 기록이 없습니다</p>
        ) : (
          <div className="past">
            {pastRecords.slice(0, 8).map((r) => (
              <div key={r.id}>
                <span className="t">{mdhm(r.checked_at)}</span>
                <span>TBM {md(r.date)}</span>
                <span>{r.checked_by}</span>
                <span>
                  {r.results.length}건 중 <b style={{ color: "var(--ok)" }}>{r.results.length - r.missing_ids.length}건 전달</b>
                  {r.missing_ids.length > 0 && <b style={{ color: "var(--red)" }}> · {r.missing_ids.length}건 빠짐</b>}
                </span>
                <span className="sub">
                  {r.provider} {r.model}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
