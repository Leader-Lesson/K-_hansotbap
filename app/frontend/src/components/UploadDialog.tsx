// 헤더 "계획서 올리기" 창 (시안 public/prototype 의 구글 드라이브형 업로드 팝업):
// 파일 끌어다 놓기·고르기 → 올린 파일 목록(이번에 올린 파일 + 업체별 제출 버전 v1·v2…) → 파일을 누르면 추출 표·표준서 매칭(PlanUpload) → 제출·판정 결과
// 협력사는 자기 업체로만 올리고 자기 업체 버전만 본다(서버가 거른다). 원청은 어느 협력사 계획서인지 고르고 전체 버전을 본다
// 원청의 반려 → 수정 요구 → 재제출 흐름은 백엔드에 반려 API가 없어 넣지 않는다. 버전 목록만 보여 준다
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { api } from "@/api/client";
import { PlanUpload } from "@/components/PlanUpload";
import { docCompanies, makeDraft, type PlanDraft, type PlanOutcome } from "@/components/planDraft";
import type { PlanExtraction, PlanRecord, PlanSubmitResult, SopMatch, Task, ViewerRole, Zone } from "@/types";
import "./upload.css";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: ViewerRole;
  contractors: string[];
  zones: Zone[];
  onSubmitted: (r: PlanSubmitResult) => void; // 창을 닫을 때 마지막 제출 결과로 부른다 (App 이 화면을 새로고침)
}

/** 서버가 받는 형식 (app/backend/parsers SUPPORTED 와 같게). 구형 HWP·xls·doc 은 안내 후 거절 */
const ACCEPT = [".hwpx", ".xlsx", ".pdf", ".docx"];
const FMT_COLOR: Record<string, string> = {
  PDF: "var(--red)",
  XLSX: "var(--ok)",
  HWPX: "var(--blue)",
  HWP: "var(--blue)",
  DOCX: "var(--blue-hover)",
};

interface UploadItem {
  key: string;
  name: string;
  addedAt: string; // 로컬 ISO
  status: "reading" | "done" | "error" | "rejected";
  error?: string;
  extraction?: PlanExtraction;
  draft?: PlanDraft;
  outcome?: PlanOutcome;
}

type Opened = { kind: "up"; key: string } | { kind: "plan"; contractor: string } | null;

const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "");
const fmtOf = (name: string) => extOf(name).slice(1).toUpperCase().slice(0, 4) || "?";
const localIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
};
/** ISO → 'MM.DD HH:MM' */
const stamp = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)} ${iso.slice(11, 16)}`;

function rejectReason(name: string): string | null {
  const ext = extOf(name);
  if (ext === ".hwp") return "구형 HWP는 받지 않습니다 — 한글에서 'HWPX로 저장'한 뒤 다시 올려 주세요";
  if (!ACCEPT.includes(ext)) return "받는 형식: HWPX · 엑셀(xlsx) · PDF · Word(docx)";
  return null;
}

function FileIcon({ name }: { name: string }) {
  const f = fmtOf(name);
  return (
    <span className="up-ficon" style={{ "--fc": FMT_COLOR[f] ?? "var(--ink-3)" } as CSSProperties} aria-hidden="true">
      {f}
    </span>
  );
}

export function UploadDialog({ open, onOpenChange, role, contractors, zones, onSubmitted }: Props) {
  const fixed = role.kind === "contractor" ? role.contractor : null;
  const viewer = fixed ?? undefined; // 서버 권한 필터용 (원청은 비움)
  const [items, setItems] = useState<UploadItem[]>([]);
  const [opened, setOpened] = useState<Opened>(null);
  const [over, setOver] = useState(false);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [knownTasks, setKnownTasks] = useState<Task[]>([]);
  const [sopMatches, setSopMatches] = useState<SopMatch[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const seq = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 역할을 바꾸면 이번에 올린 파일을 비운다 (다른 업체 계획서가 남지 않게)
  const roleKey = fixed ?? "prime";
  useEffect(() => {
    setItems([]);
    setOpened(null);
  }, [roleKey]);

  // 업체별 제출 버전 · 선행 작업 이름 · 표준서 누락 수. 협력사는 자기 업체 것만 받는다
  const loadSide = useCallback(async () => {
    try {
      const [p, t, s] = await Promise.all([api.plans(viewer), api.tasks(viewer), api.sopMatches(viewer)]);
      setPlans(p);
      setKnownTasks(t);
      setSopMatches(s);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [viewer]);
  useEffect(() => {
    if (open) void loadSide();
  }, [open, loadSide]);

  const update = (key: string, fn: (it: UploadItem) => UploadItem) => setItems((xs) => xs.map((x) => (x.key === key ? fn(x) : x)));

  const read = async (key: string, file: File) => {
    try {
      const ext = await api.uploadPlan(file, { contractor: fixed ?? undefined });
      update(key, (it) => ({ ...it, status: "done", extraction: ext, draft: makeDraft(ext, fixed, contractors) }));
      // 다 읽으면 펼친다. 다만 제출 전인 다른 파일을 보고 있으면 그대로 둔다
      setOpened((o) => {
        const cur = o?.kind === "up" ? itemsRef.current.find((x) => x.key === o.key) : undefined;
        return cur && cur.status === "done" && !cur.outcome ? o : { kind: "up", key };
      });
    } catch (e) {
      update(key, (it) => ({ ...it, status: "error", error: (e as Error).message }));
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const added: UploadItem[] = [];
    for (const file of Array.from(list)) {
      const key = `u${++seq.current}`;
      const why = rejectReason(file.name);
      added.push({ key, name: file.name, addedAt: localIso(), status: why ? "rejected" : "reading", error: why ?? undefined });
      // 한 번에 하나씩 읽는다 (LLM 추출이면 서버가 몇 초씩 걸린다)
      if (!why) queue.current = queue.current.then(() => read(key, file));
    }
    setItems((xs) => [...added, ...xs]); // 새로 올린 묶음이 위 (묶음 안은 고른 순서)
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  // 제출이 하나라도 끝났으면 닫을 때 화면을 새로고침한다 (기획서: 판정 후 강제 새로고침)
  const lastResult = useMemo(() => {
    const done = items.filter((x) => x.outcome).map((x) => x.outcome!.result);
    return done.sort((a, b) => b.plan.id - a.plan.id)[0] ?? null;
  }, [items]);
  const close = () => {
    onOpenChange(false);
    if (lastResult) onSubmitted(lastResult);
  };

  // 업체별 버전 (최근 제출 업체가 위)
  const byCompany = useMemo(() => {
    const m = new Map<string, PlanRecord[]>();
    for (const p of [...plans].sort((a, b) => a.version - b.version)) m.set(p.contractor, [...(m.get(p.contractor) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1][b[1].length - 1].submitted_at.localeCompare(a[1][a[1].length - 1].submitted_at));
  }, [plans]);
  // 현재 일정에서 표준서 핵심 단계가 빠진 작업 수 (업체별)
  const missingBy = useMemo(() => {
    const owner = new Map(knownTasks.map((t) => [t.id, t.contractor]));
    const m = new Map<string, Set<string>>();
    for (const s of sopMatches) {
      const c = owner.get(s.task_id);
      if (c && s.primary && s.missing_steps.length) m.set(c, (m.get(c) ?? new Set()).add(s.task_id));
    }
    return m;
  }, [knownTasks, sopMatches]);

  const isOpen = (o: Exclude<Opened, null>) =>
    o.kind === "up" ? opened?.kind === "up" && opened.key === o.key : opened?.kind === "plan" && opened.contractor === o.contractor;
  const toggle = (o: Exclude<Opened, null>) => setOpened(isOpen(o) ? null : o);

  const openItem = opened?.kind === "up" ? items.find((x) => x.key === opened.key) : undefined;
  const openPlans = opened?.kind === "plan" ? byCompany.find(([c]) => c === opened.contractor)?.[1] : undefined;
  const rowCount = items.length + byCompany.length;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="up-scrim" />
        <DialogPrimitive.Content className="up-modal">
          <header>
            <DialogPrimitive.Title asChild>
              <h2>작업계획서 올리기</h2>
            </DialogPrimitive.Title>
            <span className="up-fx">F1</span>
            <span className="up-fx">F8</span>
            <span className="up-grow" />
            <DialogPrimitive.Close className="up-x" aria-label="닫기">
              ×
            </DialogPrimitive.Close>
          </header>
          <DialogPrimitive.Description className="sr-only">
            계획서 파일을 올리면 작업 표로 정리하고 작업표준서를 붙입니다. 확인한 뒤 제출하는 순간 전체 일정과 충돌을 판정합니다.
          </DialogPrimitive.Description>

          <div className="up-body">
            <div
              className={`up-drop${over ? " over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 36h-2a9 9 0 0 1-1.5-17.9A12 12 0 0 1 34 15a8 8 0 0 1 2 21h-2" />
                <path d="M24 40V24M18 30l6-6 6 6" />
              </svg>
              <div className="big1">파일을 여기로 끌어다 놓으세요</div>
              <div className="up-sub">또는</div>
              <label className="up-pick">
                내 PC에서 찾아보기
                <input
                  type="file"
                  multiple
                  accept={[...ACCEPT, ".hwp"].join(",")}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = ""; // 같은 파일을 다시 고를 수 있게
                  }}
                />
              </label>
              <div className="up-sub">
                HWPX · 엑셀 · PDF · Word 등 지금 쓰는 양식 그대로 (구형 HWP는 HWPX로 저장해서) · 계획이 바뀌면 수정한 계획서를 다시 올립니다
              </div>
              <div className="up-sub">{fixed ? <><b>{fixed}</b> 계획서로 올립니다</> : "원청이 올리면 문서에 적힌 업체로 제출 협력사를 고릅니다"}</div>
            </div>

            {loadError && <p className="up-alert warn">제출 이력을 불러오지 못했습니다: {loadError}</p>}

            <div className="up-sec">
              <div className="up-flh">
                <span>올린 파일</span>
                <b>{rowCount}</b>
                <span className="up-sub">개 · 파일을 누르면 추출 결과 또는 제출 이력이 펼쳐집니다</span>
              </div>
              <div className="up-fl">
                <div className="up-fr hd">
                  <span>이름</span>
                  <span className="c2">업체</span>
                  <span className="c3">올린 시각</span>
                  <span>상태</span>
                </div>
                {items.map((it) => (
                  <UploadRow key={it.key} it={it} fixed={fixed} expanded={isOpen({ kind: "up", key: it.key })} onToggle={() => toggle({ kind: "up", key: it.key })} />
                ))}
                {byCompany.map(([c, ps]) => {
                  const last = ps[ps.length - 1];
                  const miss = missingBy.get(c)?.size ?? 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      className="up-fr"
                      aria-expanded={isOpen({ kind: "plan", contractor: c })}
                      onClick={() => toggle({ kind: "plan", contractor: c })}
                    >
                      <span className="nm">
                        <FileIcon name={last.file} />
                        <span>
                          {last.file}
                          <br />
                          <span className="up-sub">
                            v{last.version} · 제출 {ps.length}회 · 작업 {last.task_count}건
                            {miss > 0 && <span style={{ color: "var(--red)" }}> · 표준서 누락 {miss}</span>}
                          </span>
                        </span>
                      </span>
                      <span className="c2" title={c}>
                        {c}
                      </span>
                      <span className="c3 up-t">{stamp(last.submitted_at)}</span>
                      <span className="up-fst ok">v{last.version} 반영</span>
                    </button>
                  );
                })}
                {rowCount === 0 && <div className="up-empty">아직 올린 계획서가 없습니다</div>}
              </div>
            </div>

            {openPlans && <VersionHistory contractor={openPlans[0].contractor} plans={openPlans} />}

            {openItem?.extraction && openItem.draft && (
              <PlanUpload
                key={openItem.key}
                extraction={openItem.extraction}
                draft={openItem.draft}
                setDraft={(fn) => update(openItem.key, (it) => (it.draft ? { ...it, draft: fn(it.draft) } : it))}
                outcome={openItem.outcome ?? null}
                role={role}
                contractors={contractors}
                zones={zones}
                knownTasks={knownTasks}
                plans={plans}
                onSubmitted={(o) => {
                  update(openItem.key, (it) => ({ ...it, outcome: o }));
                  void loadSide(); // 버전 목록에 방금 낸 vN 이 보이게
                }}
                onFinish={close}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 이번에 올린 파일 한 줄. 읽기가 끝난 파일만 눌러서 펼친다 */
function UploadRow({ it, fixed, expanded, onToggle }: { it: UploadItem; fixed: string | null; expanded: boolean; onToggle: () => void }) {
  const ext = it.extraction;
  const need = ext?.tasks.filter((t) => t.needs_review).length ?? 0;
  const miss = new Set(ext?.sop_matches.filter((m) => m.primary && m.missing_steps.length).map((m) => m.task_id)).size; // 표준서 단계가 빠진 작업 수
  // 업체 칸: 제출했으면 제출 업체, 아니면 문서에 적힌 업체 (협력사로 남의 계획서를 올리면 여기서 바로 보인다)
  const fromDoc = ext ? docCompanies(ext.tasks.map((t) => t.task))[0] : undefined;
  const company = it.outcome?.result.plan.contractor ?? fromDoc ?? it.draft?.contractor ?? fixed ?? "—";
  const otherCompany = !it.outcome && !!fixed && !!fromDoc && fromDoc !== fixed;
  const sub =
    it.status === "reading" ? (
      "서버에서 읽는 중…"
    ) : it.status === "done" && ext ? (
      <>
        {it.outcome ? `v${it.outcome.result.plan.version} 제출 · ` : ""}작업 {ext.tasks.length}건 · {ext.method === "llm" ? "AI 추출" : "표 규칙"}
        {need > 0 && <span style={{ color: "var(--amber)" }}> · 확인 필요 {need}</span>}
        {miss > 0 && <span style={{ color: "var(--red)" }}> · 표준서 누락 {miss}</span>}
      </>
    ) : (
      <span style={{ color: "var(--red)" }}>{it.error}</span>
    );
  const status =
    it.status === "reading" ? (
      <span className="up-fst run">읽는 중…</span>
    ) : it.status === "rejected" ? (
      <span className="up-fst err">받지 않음</span>
    ) : it.status === "error" ? (
      <span className="up-fst err">읽지 못함</span>
    ) : it.outcome ? (
      <span className="up-fst ok">v{it.outcome.result.plan.version} 제출 완료</span>
    ) : otherCompany ? (
      <span className="up-fst err">다른 업체 계획서</span>
    ) : need > 0 ? (
      <span className="up-fst warn">구조화 완료 · 확인 필요</span>
    ) : (
      <span className="up-fst ok">구조화 완료 · 제출 전</span>
    );
  const body = (
    <>
      <span className="nm">
        <FileIcon name={it.name} />
        <span title={typeof it.error === "string" ? it.error : it.name}>
          {it.name}
          <br />
          <span className="up-sub">{sub}</span>
        </span>
      </span>
      <span className="c2" title={company}>
        {company}
      </span>
      <span className="c3 up-t">{stamp(it.addedAt)}</span>
      {status}
    </>
  );
  return it.status === "done" ? (
    <button type="button" className="up-fr" aria-expanded={expanded} onClick={onToggle}>
      {body}
    </button>
  ) : (
    <div className="up-fr" aria-busy={it.status === "reading"}>
      {body}
    </div>
  );
}

/** 업체 하나의 제출 버전 (GET /api/plans). 가장 최근 버전이 현재 일정에 반영된 것 */
function VersionHistory({ contractor, plans }: { contractor: string; plans: PlanRecord[] }) {
  const latest = plans[plans.length - 1];
  return (
    <div className="up-sec">
      <span className="h">
        {contractor} 제출 이력 · 최신 v{latest.version} · 가장 최근 제출이 지금 일정에 들어가 있습니다
      </span>
      <div className="up-fl">
        {[...plans].reverse().map((p) => (
          <div key={p.id} className="up-fr hrow">
            <b>v{p.version}</b>
            <span>
              {p.file}
              <br />
              <span className="up-sub">
                작업 {p.task_count}건{p.submitted_by ? ` · 제출 ${p.submitted_by}` : ""}
              </span>
            </span>
            <span className="c3 up-t">{stamp(p.submitted_at)}</span>
            {p.id === latest.id ? <span className="up-fst ok">반영</span> : <span className="up-fst wait">이전 버전</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
