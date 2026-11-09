// 협력사 화면: 내 작업, 나와 겹친 충돌, 매칭된 표준서, 공지 — 자기 업체 데이터만 (F5 권한 필터)
// TODO(F5): 서버에서 역할별로 걸러 받는다. 프론트 필터만으로 권한을 대신하지 않는다
import type { Task } from "@/types";

interface Props {
  contractor: string;
  tasks: Task[];
}

export function ContractorView({ contractor, tasks }: Props) {
  const mine = tasks.filter((t) => t.contractor === contractor);
  return (
    <div className="rounded-lg bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 font-semibold">{contractor} — 내 작업 {mine.length}건</h2>
      {mine.length === 0 ? (
        <p className="text-stone-500">합성 계획서를 올리면 이 협력사의 작업이 여기에 나옵니다.</p>
      ) : (
        <ul className="space-y-1">
          {mine.map((t) => (
            <li key={t.id}>
              <b>{t.id}</b> {t.name} ({t.start.slice(0, 10)} ~ {t.end.slice(0, 10)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
