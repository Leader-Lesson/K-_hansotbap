"""작업표준서 마크다운 → PDF (사람이 보는 문서). 원본은 마크다운 하나이고 PDF는 여기서 변환한다.

    cd app/backend && uv run python data/sop/make_sop_pdf.py            # SOP-*.md 전부 → data/sop/pdf/
    cd app/backend && uv run python data/sop/make_sop_pdf.py SOP-P34 SOP-P22   # 일부만

판정(F8)은 마크다운의 `## 필수 단계`와 `## 판정에 쓰는 기준`을 읽는다(search/sop_catalog.py). PDF는 그 내용을
그대로 옮겨 사람이 보기 쉽게 만든 것이라, 마크다운을 고치면 이 스크립트를 다시 돌린다.
글꼴: macOS AppleGothic(있으면) → 없으면 PyMuPDF 내장 CJK 글꼴("korea"). 다른 PC에서도 돌아가게 한다.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
OUT = HERE / "pdf"
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/Supplemental/NotoSansGothic-Regular.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]

PAGE_W, PAGE_H = 595.0, 842.0  # A4
MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B = 48.0, 48.0, 64.0, 56.0
TEXT_W = PAGE_W - MARGIN_L - MARGIN_R

INK = (0.16, 0.15, 0.14)
MUTED = (0.42, 0.40, 0.38)
LINE = (0.78, 0.76, 0.73)
ACCENT = (0.12, 0.35, 0.62)
RED = (0.78, 0.16, 0.16)
BOX = (0.965, 0.955, 0.94)
SYNTH_NOTE = "합성 데이터 — 해커톤 시연용. 공개 지침(KOSHA GUIDE·산업안전보건기준에 관한 규칙) 기반으로 합성했으며 실제 사업장 표준서가 아닙니다. 협력사명은 가상입니다."

_CRITICAL = re.compile(r"절차에\s*([\d·,\s및]+?)\s*단계")


def load_font() -> pymupdf.Font:
    for cand in FONT_CANDIDATES:
        if Path(cand).exists():
            return pymupdf.Font(fontfile=cand)
    return pymupdf.Font("korea")


FONT = load_font()


# ── 마크다운 → 블록 ─────────────────────────────────────────────────
@dataclass
class Block:
    kind: str  # title | meta | h2 | h3 | p | ul | ol
    text: str = ""
    items: list[str] | None = None


def parse_markdown(md: str) -> list[Block]:
    blocks: list[Block] = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    seen_h2 = False
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("# "):
            blocks.append(Block("title", line[2:].strip()))
            i += 1
            continue
        if line.startswith("## "):
            seen_h2 = True
            blocks.append(Block("h2", line[3:].strip()))
            i += 1
            continue
        if line.startswith("### "):
            blocks.append(Block("h3", line[4:].strip()))
            i += 1
            continue
        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append(re.sub(r"^\s*[-*]\s+", "", lines[i]).strip())
                i += 1
            blocks.append(Block("meta" if not seen_h2 else "ul", items=items))
            continue
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(re.sub(r"^\s*\d+\.\s+", "", lines[i]).strip())
                i += 1
            blocks.append(Block("ol", items=items))
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s)", lines[i]):
            para.append(lines[i].strip())
            i += 1
        blocks.append(Block("p", " ".join(para)))
    return blocks


def critical_steps(md: str) -> set[int]:
    section = md.split("## 판정에 쓰는 기준", 1)[-1].split("\n## ", 1)[0] if "## 판정에 쓰는 기준" in md else ""
    m = _CRITICAL.search(section)
    return {int(n) for n in re.findall(r"\d+", m.group(1))} if m else set()


def strip_inline(text: str) -> str:
    return re.sub(r"\*\*([^*]+)\*\*", r"\1", text).replace("`", "")


# ── 글 줄바꿈·그리기 ───────────────────────────────────────────────
def wrap(text: str, size: float, width: float) -> list[str]:
    """낱말 단위로 끊되, 한 낱말이 너무 길면 글자 단위로 끊는다 (한국어는 띄어쓰기가 드문 긴 낱말이 있다)."""
    out: list[str] = []
    cur = ""
    for word in text.split(" "):
        cand = word if not cur else f"{cur} {word}"
        if FONT.text_length(cand, size) <= width:
            cur = cand
            continue
        if cur:
            out.append(cur)
            cur = ""
        if FONT.text_length(word, size) <= width:
            cur = word
            continue
        piece = ""
        for ch in word:
            if FONT.text_length(piece + ch, size) <= width:
                piece += ch
            else:
                out.append(piece)
                piece = ch
        cur = piece
    if cur:
        out.append(cur)
    return out or [""]


class Writer:
    def __init__(self, doc_id: str, title: str, source_file: str) -> None:
        self.doc = pymupdf.open()
        self.doc_id, self.title, self.source_file = doc_id, title, source_file
        self.page: pymupdf.Page | None = None
        self.y = MARGIN_T
        self.new_page()

    # 페이지 머리·꼬리
    def new_page(self) -> None:
        self.page = self.doc.new_page(width=PAGE_W, height=PAGE_H)
        p = self.page
        p.draw_line((MARGIN_L, 40), (PAGE_W - MARGIN_R, 40), color=LINE, width=0.6)
        tw = pymupdf.TextWriter(p.rect, color=MUTED)
        tw.append((MARGIN_L, 33), f"{self.doc_id}  {self.title}", font=FONT, fontsize=8.5)
        right = "원청 작업표준서 · 합성"
        tw.append((PAGE_W - MARGIN_R - FONT.text_length(right, 8.5), 33), right, font=FONT, fontsize=8.5)
        tw.write_text(p)
        self.y = MARGIN_T

    def finish(self) -> None:
        n = len(self.doc)
        for i, p in enumerate(self.doc, start=1):
            p.draw_line((MARGIN_L, PAGE_H - 44), (PAGE_W - MARGIN_R, PAGE_H - 44), color=LINE, width=0.6)
            tw = pymupdf.TextWriter(p.rect, color=MUTED)
            foot = wrap(SYNTH_NOTE, 7.2, TEXT_W - 60)
            for k, ln in enumerate(foot[:2]):
                tw.append((MARGIN_L, PAGE_H - 33 + k * 9.5), ln, font=FONT, fontsize=7.2)
            pg = f"{i} / {n}"
            tw.append((PAGE_W - MARGIN_R - FONT.text_length(pg, 8), PAGE_H - 30), pg, font=FONT, fontsize=8)
            tw.write_text(p)

    def ensure(self, h: float) -> None:
        if self.y + h > PAGE_H - MARGIN_B:
            self.new_page()

    def text(self, lines: list[str], size: float, x: float, color=INK, gap: float = 1.42) -> None:
        lh = size * gap
        for ln in lines:
            self.ensure(lh)
            tw = pymupdf.TextWriter(self.page.rect, color=color)
            tw.append((x, self.y + size), ln, font=FONT, fontsize=size)
            tw.write_text(self.page)
            self.y += lh

    # 블록별 그리기
    def title_block(self, raw: str, meta: list[str]) -> None:
        title = re.sub(r"\s*[—-]\s*합성\s*$", "", raw)
        m = re.match(r"^(SOP-P?\d+)\s+(.*)$", title)
        doc_id, name = (m.group(1), m.group(2)) if m else (self.doc_id, title)
        p = self.page
        # 문서 ID 띠
        p.draw_rect(pymupdf.Rect(MARGIN_L, self.y, MARGIN_L + 92, self.y + 22), color=None, fill=ACCENT)
        tw = pymupdf.TextWriter(p.rect, color=(1, 1, 1))
        tw.append((MARGIN_L + 8, self.y + 15.5), doc_id, font=FONT, fontsize=11)
        tw.write_text(p)
        tw = pymupdf.TextWriter(p.rect, color=MUTED)
        tw.append((MARGIN_L + 100, self.y + 15.5), "원청 작업표준서 (Standard Operating Procedure) · 합성 문서", font=FONT, fontsize=9)
        tw.write_text(p)
        self.y += 32
        self.text(wrap(name, 19, TEXT_W), 19, MARGIN_L, gap=1.3)
        self.y += 6
        # 문서 정보 상자
        rows = [strip_inline(x) for x in meta]
        size = 8.8
        wrapped = [wrap(r, size, TEXT_W - 24) for r in rows]
        h = sum(len(w) for w in wrapped) * size * 1.45 + 16
        self.ensure(h)
        p = self.page
        p.draw_rect(pymupdf.Rect(MARGIN_L, self.y, PAGE_W - MARGIN_R, self.y + h), color=LINE, fill=BOX, width=0.6)
        self.y += 8
        for w in wrapped:
            self.text(w, size, MARGIN_L + 12, color=INK, gap=1.45)
        self.y += 14

    def h2(self, text: str) -> None:
        self.ensure(40)
        self.y += 8
        p = self.page
        tw = pymupdf.TextWriter(p.rect, color=ACCENT)
        tw.append((MARGIN_L, self.y + 12.5), strip_inline(text), font=FONT, fontsize=12.5)
        tw.write_text(p)
        self.y += 18
        p.draw_line((MARGIN_L, self.y), (PAGE_W - MARGIN_R, self.y), color=ACCENT, width=0.8)
        self.y += 8

    def h3(self, text: str) -> None:
        self.ensure(24)
        self.y += 4
        self.text([strip_inline(text)], 10.5, MARGIN_L, color=INK)
        self.y += 2

    def para(self, text: str) -> None:
        self.text(wrap(strip_inline(text), 9.5, TEXT_W), 9.5, MARGIN_L)
        self.y += 4

    def bullets(self, items: list[str]) -> None:
        indent = 14
        for it in items:
            lines = wrap(strip_inline(it), 9.5, TEXT_W - indent)
            self.ensure(9.5 * 1.42)
            tw = pymupdf.TextWriter(self.page.rect, color=ACCENT)
            tw.append((MARGIN_L + 2, self.y + 9.5), "•", font=FONT, fontsize=9.5)
            tw.write_text(self.page)
            self.text(lines, 9.5, MARGIN_L + indent)
            self.y += 1.5
        self.y += 4

    def numbered(self, items: list[str], critical: set[int] | None = None, checklist: bool = False) -> None:
        """번호 목록. checklist=True 면 '필수 단계'를 체크 칸·핵심 표시가 있는 표로 그린다."""
        indent = 26 if not checklist else 54
        for no, it in enumerate(items, start=1):
            txt = strip_inline(it)
            is_crit = bool(critical) and no in critical
            # 상세 순서: "제목 — 설명" 이면 제목을 진하게 보이도록 앞에 두고 설명은 다음 줄
            head, sep, body = txt.partition(" — ")
            head_lines = wrap(head, 9.5, TEXT_W - indent - (34 if is_crit and checklist else 0))
            body_lines = wrap(body, 9.0, TEXT_W - indent) if sep else []
            block_h = len(head_lines) * 9.5 * 1.42 + len(body_lines) * 9.0 * 1.4 + 6
            self.ensure(block_h)
            p = self.page
            y0 = self.y
            if checklist:
                p.draw_rect(pymupdf.Rect(MARGIN_L, y0, PAGE_W - MARGIN_R, y0 + block_h), color=LINE, width=0.5,
                            fill=(0.99, 0.965, 0.955) if is_crit else None)
                p.draw_rect(pymupdf.Rect(MARGIN_L + 8, y0 + 5, MARGIN_L + 18, y0 + 15), color=INK, width=0.7)  # 체크 칸
                tw = pymupdf.TextWriter(p.rect, color=INK)
                tw.append((MARGIN_L + 26, y0 + 13.5), f"{no:>2}", font=FONT, fontsize=9.5)
                tw.write_text(p)
                if is_crit:
                    bx = PAGE_W - MARGIN_R - 36
                    p.draw_rect(pymupdf.Rect(bx, y0 + 4, bx + 30, y0 + 16), color=None, fill=RED)
                    tw = pymupdf.TextWriter(p.rect, color=(1, 1, 1))
                    tw.append((bx + 6, y0 + 13), "핵심", font=FONT, fontsize=8.5)
                    tw.write_text(p)
                self.y += 3
            else:
                tw = pymupdf.TextWriter(p.rect, color=ACCENT)
                tw.append((MARGIN_L + 4, self.y + 9.5), f"{no}.", font=FONT, fontsize=9.5)
                tw.write_text(p)
            self.text(head_lines, 9.5, MARGIN_L + indent)
            if body_lines:
                self.text(body_lines, 9.0, MARGIN_L + indent, color=MUTED, gap=1.4)
            self.y += 3 if checklist else 2
        self.y += 5


def build(md_path: Path) -> Path:
    md = md_path.read_text(encoding="utf-8")
    blocks = parse_markdown(md)
    crit = critical_steps(md)
    title_raw = next((b.text for b in blocks if b.kind == "title"), md_path.stem)
    m = re.match(r"^(SOP-P?\d+)\s+(.*?)(\s*[—-]\s*합성)?$", title_raw)
    doc_id = m.group(1) if m else md_path.stem.split("_")[0]
    title = m.group(2) if m else title_raw
    w = Writer(doc_id, title, md_path.name)
    meta = [it for b in blocks if b.kind == "meta" for it in (b.items or [])]
    w.title_block(title_raw, meta)
    current_h2 = ""
    for b in blocks:
        if b.kind in ("title", "meta"):
            continue
        if b.kind == "h2":
            current_h2 = b.text
            w.h2(b.text)
        elif b.kind == "h3":
            w.h3(b.text)
        elif b.kind == "p":
            w.para(b.text)
        elif b.kind == "ul":
            w.bullets(b.items or [])
        elif b.kind == "ol":
            is_steps = current_h2.strip().startswith("필수 단계")
            is_detail = "작업 순서" in current_h2
            w.numbered(b.items or [], critical=crit if (is_steps or is_detail) else None, checklist=is_steps)
    w.finish()
    OUT.mkdir(exist_ok=True)
    out = OUT / (md_path.stem + ".pdf")
    w.doc.subset_fonts()  # 쓴 글자만 남긴다 (글꼴 통째로 넣으면 한 파일이 6MB)
    w.doc.save(out, garbage=3, deflate=True)
    return out


def main(argv: list[str]) -> None:
    files = sorted(HERE.glob("SOP-*.md"))
    if argv:
        files = [f for f in files if any(f.name.startswith(a) for a in argv)]
    if not files:
        raise SystemExit("변환할 SOP-*.md 가 없습니다")
    for f in files:
        out = build(f)
        print(f"만듦: {out.relative_to(HERE.parent.parent)}  ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main(sys.argv[1:])
