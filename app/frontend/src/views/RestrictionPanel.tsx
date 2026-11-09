// 작업 금지·출입 제한 안내: 서버의 금지 판정을 구역별로 묶어 "이 구역에서 이 기간엔 작업하지 마세요"로 보여 준다.
// 같은 자료를 3D(scene3d)에 restrictions 로 넘겨 안전띠·출입 금지 표지를 세운다. 판정은 서버가 한 것이고 여기서는 보여 주기만 한다
import { fmtDateTime } from "@/lib/format";
import { groupByZone, restrictionsOn, type ZoneRestriction } from "@/lib/restrictions";
import type { Task, Zone } from "@/types";

interface Props {
  restrictions: ZoneRestriction[];
  tasks: Task[];
  zones: Zone[];
  date: string;
  contractor?: string; // 협력사로 보면 "내 작업" 표시
  onShow3D?: (taskId: string) => void;
}

export function RestrictionPanel({ restrictions, tasks, zones, date, contractor, onShow3D }: Props) {
  const taskOf = (id: string) => tasks.find((t) => t.id === id);
  const today = restrictionsOn(restrictions, date);
  const groups = groupByZone(today, zones);
  const unmapped = today.filter((r) => !zones.some((z) => z.id === r.zone_id));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          <b>{date}</b>에 걸린 금지 구역 <b>{groups.length}</b>곳 · 제한 {today.length}건
          <span className="ml-2 text-xs text-stone-500">(전체 기간 {restrictions.length}건 — 날짜를 바꾸면 그날 것만 나옵니다)</span>
        </span>
        <span className="text-xs text-stone-500">구역 단위로 막습니다. 구역 안 방위(북·동·남·서)까지는 계획서에 위치가 있어야 합니다.</span>
      </div>
      {groups.length === 0 && <p className="rounded-lg bg-white p-4 text-sm text-stone-500 shadow-sm">이 날짜에 금지 판정으로 막힌 구역이 없습니다.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ zone, items }) => (
          <section key={zone.id} className="rounded-lg border-l-4 border-red-500 bg-white p-3 text-sm shadow-sm">
            <header className="mb-2 flex items-center gap-2">
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">출입 금지</span>
              <h3 className="font-semibold">{zone.name}</h3>
              <span className="ml-auto font-mono text-xs text-stone-400">{zone.id}</span>
            </header>
            <ul className="space-y-2">
              {items.map((r) => {
                const mine = contractor ? r.task_ids.filter((id) => taskOf(id)?.contractor === contractor) : [];
                const others = r.task_ids.filter((id) => !mine.includes(id));
                return (
                  <li key={`${r.conflict_id}:${r.zone_id}`} className="rounded bg-stone-50 p-2 text-xs">
                    <div className="text-stone-700">
                      <b>{fmtDateTime(r.start)}</b> ~ <b>{fmtDateTime(r.end)}</b>
                    </div>
                    {contractor && mine.length > 0 && (
                      <div className="mt-1 rounded bg-red-50 p-1.5 text-red-800">
                        내 작업 <b>{mine.map((id) => `${id} ${taskOf(id)?.name ?? ""}`).join(", ")}</b> — 이 기간엔 여기서 작업하지 마세요.
                      </div>
                    )}
                    <div className="mt-1 text-stone-600">
                      {contractor ? "상대 작업" : "걸린 작업"}:{" "}
                      {(contractor ? others : r.task_ids).map((id) => {
                        const t = taskOf(id);
                        return (
                          <span key={id} className="mr-1 inline-block rounded bg-white px-1.5 py-0.5 ring-1 ring-stone-200">
                            {id} {t ? `${t.contractor} · ${t.name}` : ""}
                            {onShow3D && t && (
                              <button type="button" onClick={() => onShow3D(id)} className="ml-1 text-sky-700 underline">
                                3D
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-stone-500">
                      <b className="text-stone-700">{r.rule_id}</b> · {r.legal_basis}
                    </div>
                    {r.suggestion && <div className="mt-1 text-emerald-800">대신: {r.suggestion}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {unmapped.length > 0 && <p className="text-xs text-stone-500">구역 표에 없는 구역의 제한 {unmapped.length}건은 생략했습니다.</p>}
    </div>
  );
}
