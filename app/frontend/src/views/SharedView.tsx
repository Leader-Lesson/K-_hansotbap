// 협력사 화면 "원청 공유·공지": 원청이 확인해 내려보낸 충돌(F5)과 내 작업이 걸린 위험 시간대 공지(F9). 시안 카드 모양(.s6)으로 그린다
// 서버가 이 협력사 범위로 거른다 — 인접 위치 작업, 위험 요소, 작업 인계 조건만 오고 상대 업체의 계획서 원문은 오지 않는다
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { RiskWindowList } from "@/components/RiskWindowList";
import { CONFLICT_TYPE_LABEL, HAZARD_LABEL, fmtRange } from "@/lib/format";
import { mdhm } from "@/lib/partyColor";
import type { Grade, RiskWindow, SharedItem, Task, Zone } from "@/types";
import "./s6.css";

interface Props {
  contractor: string;
  zones: Zone[];
  tasks: Task[];
  conflictsKey: string; // 판정·공유가 바뀌면 다시 부르게 (App 이 다시 불러온 충돌 목록에서 만든다)
}

const GRADE_PILL: Record<Grade, string> = { 금지: "ban", 조건부: "cond", 결함: "def" };
const GRADE_VAR: Record<Grade, string> = { 금지: "var(--red)", 조건부: "var(--amber)", 결함: "var(--violet)" };

export function SharedView({ contractor, zones, tasks, conflictsKey }: Props) {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [windows, setWindows] = useState<RiskWindow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.name ?? id;

  useEffect(() => {
    Promise.all([api.shares(contractor), api.riskWindows({ contractor })])
      .then(([s, w]) => {
        setItems(s);
        setWindows(w);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [contractor, conflictsKey]);

  return (
    <div className="s6" style={{ display: "grid", gap: 12 }}>
      {error && <p className="err">{error}</p>}

      <section className="card">
        <header>
          <h2>원청이 공유한 충돌</h2>
          <span className="big" style={{ fontSize: 20 }}>
            {items.length}
          </span>
          <span className="sub">건 · 내 작업과 겹친 내용과 작업 인계 조건만 (서버에서 거름)</span>
        </header>
        {items.length === 0 ? (
          <p className="empty">아직 원청이 공유한 충돌이 없습니다. 원청이 확인해 공유하거나 조정을 적용하면 여기에 나옵니다.</p>
        ) : (
          <div className="shl">
            {items.map((i) => (
              <article key={i.conflict_id} className="shi" style={{ ["--gc" as string]: GRADE_VAR[i.grade] }}>
                <div className="hd">
                  <span className={`pill ${GRADE_PILL[i.grade]}`}>{i.grade}</span>
                  <span className="pill mute">{CONFLICT_TYPE_LABEL[i.type]}</span>
                  <b>{i.my_task_ids.map((id) => `${id} ${taskName(id)}`).join(", ")}</b>
                  <span className="t">{fmtRange(i.window_start, i.window_end)}</span>
                  {i.status === "adjusted" && <span className="pill ok">조정 적용됨</span>}
                  {i.status === "resolved" && <span className="pill mute">해소</span>}
                  <span className="grow" />
                  <span className="sub">
                    {i.shared_by} · {mdhm(i.shared_at)}
                  </span>
                </div>
                <div className="kv">
                  <span>이유</span>
                  <span>{i.reason}</span>
                  {i.handover && (
                    <>
                      <span>작업 인계 조건</span>
                      <b style={{ color: "var(--blue)" }}>{i.handover}</b>
                    </>
                  )}
                  {i.adjustment && (
                    <>
                      <span>적용된 조정</span>
                      <span>
                        <span className="mono">{i.adjustment.task_id}</span> {fmtRange(i.adjustment.original_start, i.adjustment.original_end)} →{" "}
                        <b>{fmtRange(i.adjustment.new_start, i.adjustment.new_end)}</b> ({i.adjustment.decided_by})
                      </span>
                    </>
                  )}
                  <span>인접 작업</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {i.adjacent_tasks.length === 0
                      ? "—"
                      : i.adjacent_tasks.map((t) => (
                          <span key={t.id} className="adj">
                            <span className="mono">{t.id}</span> {t.contractor} · {t.name} · {zoneName(t.zone_id)} · {fmtRange(t.start, t.end)}
                            {t.hazards.length > 0 && ` · ${t.hazards.map((h) => HAZARD_LABEL[h]).join("·")}`}
                          </span>
                        ))}
                  </span>
                  <span>규칙 · 근거</span>
                  <span>
                    <span className="mono">{i.rule_id}</span> <span className="sub">{i.legal_basis}</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <header>
          <h2>위험 시간대 공지</h2>
          <span className="fx">F9</span>
          <span className="sub">공유된 내 충돌만 모은 것 · TBM에서 작업자에게 전달하세요</span>
        </header>
        <div style={{ padding: 14 }}>
          <RiskWindowList windows={windows} zones={zones} emptyText="공유된 위험 시간대가 없습니다." />
        </div>
      </section>
    </div>
  );
}
