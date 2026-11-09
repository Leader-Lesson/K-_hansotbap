// 표준서 마크다운 본문을 보여 주는 아주 작은 렌더러 (제목·목록·문단·**굵게**·`코드`만). 라이브러리를 더하지 않으려고 직접 만든다
import { Fragment, type ReactNode } from "react";

function inline(text: string, key: number): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Fragment key={key}>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded bg-stone-100 px-1 text-[0.9em]">{p.slice(1, -1)}</code>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </Fragment>
  );
}

export function MarkdownLite({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "text-base font-bold" : level === 2 ? "mt-4 text-sm font-semibold text-stone-800" : "mt-3 text-sm font-semibold";
      out.push(
        <div key={key++} className={cls}>
          {inline(h[2], 0)}
        </div>,
      );
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*]\s+/, "")), i++;
      out.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, j)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*\d+\.\s+/, "")), i++;
      out.push(
        <ol key={key++} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, j)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^\s*\|/.test(line)) {
      // 표: 머리글 | 구분선 | 행들
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(
        <table key={key++} className="my-2 w-full border-collapse text-xs">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={ri === 0 ? "bg-stone-100 font-semibold" : "border-t border-stone-200"}>
                {r.map((c, ci) => (
                  <td key={ci} className="px-2 py-1 align-top">
                    {inline(c, ci)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) para.push(lines[i]), i++;
    out.push(
      <p key={key++} className="my-1">
        {inline(para.join(" "), 0)}
      </p>,
    );
  }
  return <div className={`text-sm leading-relaxed ${className}`}>{out}</div>;
}
