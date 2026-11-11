"""Extract the Part VI prompt and optional sample essay for the English V1 preview."""

import re

from correction import END as HEADING, ink_rows, recognize_crops
from reading import NOISE, clean


def extract_writing(pdf_path, first_page=1, reference_title=""):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    recognize = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1).text_rec
    heading = ""
    paragraphs = []
    with fitz.open(pdf_path) as document:
        for page in document.pages(start=first_page - 1):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
            pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
            image = cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
            rows = ink_rows(image, recognize)
            if not heading:
                start = next((index for index, (_, text) in enumerate(rows) if HEADING.match(text)), None)
                if start is None:
                    continue
                heading = "Part VI Writing " + HEADING.sub("", rows[start][1], count=1).strip()
                rows = rows[start + 1:]
            rows = [(box, text) for box, text in rows if text and not NOISE.fullmatch(text)]
            if not rows:
                continue
            directions = not paragraphs and re.match(r"^Directions?\s*:", rows[0][1], re.I)
            reread = []
            if directions:
                # Extra padding helps keep word boundaries on tightly set lines.
                crops = [image[y - 4:bottom + 4, x - 4:right + 4] for (x, y, right, bottom), _ in rows]
                reread = recognize_crops(crops, recognize)
            left = min(box[0] for box, _ in rows)
            for index, (box, text) in enumerate(rows):
                if not paragraphs or box[0] > left + image.shape[1] * .025:
                    paragraphs.append([])
                if directions and len(paragraphs) == 1 and reread[index]:
                    text = reread[index]
                paragraphs[-1].append(text)
    if not heading or not paragraphs:
        raise ValueError("未找到 Part VI Writing 的题干。")
    stem = "\n\n".join([heading.rstrip(), *(" ".join(lines) for lines in paragraphs)])
    if 0 < len(reference_title) <= 160:
        # Cross-check the printed title only when the reference differs by an OCR lookalike.
        title_pattern = re.escape(reference_title).replace("I", "[Il1]")
        stem = re.sub(rf"(?<=\btitle ){title_pattern}(?!\w)", lambda _: reference_title, stem, count=1)
    return stem


def extract_writing_answer(pdf_path):
    import fitz

    paragraphs = []
    started = False
    with fitz.open(pdf_path) as document:
        for page in document:
            previous_bottom = None
            for block in page.get_text("dict", sort=True)["blocks"]:
                for line in block.get("lines", []):
                    text = clean("".join(span["text"] for span in line["spans"]))
                    if not started:
                        started = bool(HEADING.match(text))
                        continue
                    if not text or NOISE.fullmatch(text):
                        continue
                    _, top, _, bottom = line["bbox"]
                    if previous_bottom is None or top - previous_bottom > (bottom - top) * .65:
                        paragraphs.append([])
                    paragraphs[-1].append(text)
                    previous_bottom = bottom
    return "\n\n".join(" ".join(lines) for lines in paragraphs)
