"""HWPX(한글 2014+ XML 형식) 텍스트 추출. 구형 바이너리 HWP는 다루지 않는다."""

import re
import zipfile
from io import BytesIO
from xml.etree import ElementTree as ET

_SECTION = re.compile(r"Contents/section(\d+)\.xml$")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def hwpx_to_text(data: bytes) -> str:
    lines: list[str] = []
    with zipfile.ZipFile(BytesIO(data)) as zf:
        sections = sorted(
            (n for n in zf.namelist() if _SECTION.search(n)),
            key=lambda n: int(_SECTION.search(n).group(1)),
        )
        for s_idx, name in enumerate(sections):
            root = ET.fromstring(zf.read(name))
            para_no = 0
            for el in root.iter():
                if _local(el.tag) != "p":  # 문단
                    continue
                text = "".join(
                    t.text or "" for t in el.iter() if _local(t.tag) == "t"
                ).strip()
                if text:
                    para_no += 1
                    lines.append(f"[s{s_idx}:p{para_no}] {text}")
    return "\n".join(lines)
