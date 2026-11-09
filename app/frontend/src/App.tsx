import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { OverlapCandidate, Task, ViewerRole, Zone } from "@/types";
import { ContractorView } from "@/views/ContractorView";
import { PrimeView } from "@/views/PrimeView";

export default function App() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ViewerRole>({ kind: "prime" });

  useEffect(() => {
    Promise.all([api.zones(), api.tasks(), api.overlaps()])
      .then(([z, t, o]) => {
        setZones(z);
        setTasks(t);
        setOverlaps(o);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // 로그인 없이 역할 선택 (원청 / 협력사). 시연용 협력사 A~E는 합성 계획서가 정해지면 바꾼다
  const contractors = useMemo(
    () => [...new Set(tasks.map((t) => t.contractor))].filter((c) => c.startsWith("가상-")).sort(),
    [tasks],
  );
  const roleValue = role.kind === "prime" ? "prime" : role.contractor;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🍲 한솥밥</h1>
          <p className="text-sm text-stone-600">고로 개수 협력사 동시작업 간섭 감지·예보</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            합성 데이터
          </span>
          <select
            value={roleValue}
            onChange={(e) =>
              setRole(
                e.target.value === "prime"
                  ? { kind: "prime" }
                  : { kind: "contractor", contractor: e.target.value },
              )
            }
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
          >
            <option value="prime">원청</option>
            {contractors.map((c) => (
              <option key={c} value={c}>
                협력사: {c}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          API 연결 실패: {error} — 백엔드(8000)가 켜져 있는지 확인하세요.
        </p>
      )}

      {role.kind === "prime" ? (
        <PrimeView zones={zones} tasks={tasks} overlaps={overlaps} />
      ) : (
        <ContractorView contractor={role.contractor} tasks={tasks} />
      )}
    </div>
  );
}
