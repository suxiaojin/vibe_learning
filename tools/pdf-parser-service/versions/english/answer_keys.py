"""Match answers from native and scanned English keys by the printed question number."""

import re

from correction import END as WRITING, REPLACEMENT
from reading import NOISE, clean


NUMBER = re.compile(r"^第\s*(\d{1,3})\s*题[ \t]*:?|第\s*(\d{1,3})\s*题[ \t]*:|^[.]?(\d{1,3})\s*[.)、]", re.M)
LETTER = re.compile(r"^(?:(?:正确)?答案\s*:\s*)?([A-J])(?![A-Za-z])")
EXPLANATION = re.compile(r"解\s*析\s*:|[【\[]\s*精[析折]\s*[】\]]")
EXPLAINED_LETTER = re.compile(r"[【\[]\s*精[析折]\s*[】\]][\s、,.]*([A-J])(?![A-Za-z])")
CONCLUDING_LETTER = re.compile(r"(?:故\s*选|答案\s*:|(?:可知|所以|因此)\s*[,。]?\s*选)\s*([A-J])(?![A-Za-z])")
CORRECTION = re.compile(
    r"(?:^|[】\]])\s*(?:答案\s*:\s*)?([A-D])\s*(?:应\s*)?改\s*为\s*[“\"‘]?"
    r"((?:\([A-Za-z]+\)|[A-Za-z]+(?:[-’'][A-Za-z]+)*)(?:[ \t]+[A-Za-z]+(?:[-’'][A-Za-z]+)*)*(?:/[A-Za-z]+)*)"
)


class AnswerKey:
    def __init__(self, rows):
        rows = [row for raw in rows if (row := clean(raw)) and not NOISE.fullmatch(row)]
        essay_start = next((i for i, row in enumerate(rows) if WRITING.match(row)), len(rows))
        self.essay_rows = rows[essay_start + 1:]
        text = "\n".join(row for row in rows[:essay_start] if not re.match(
            r"^(?:Part\s*[IVXIl1]+(?:\b|(?=Error\s*Correction))|Section\s*[ABC]\b)", row, re.I))
        markers = list(NUMBER.finditer(text))
        self.blocks = {}
        for i, marker in enumerate(markers):
            number = int(marker[1] or marker[2] or marker[3])
            end = markers[i + 1].start() if i + 1 < len(markers) else len(text)
            self.blocks.setdefault(number, []).append(text[marker.end():end].strip())

    def block(self, number):
        values = set(self.blocks.get(number, []))
        return next(iter(values)) if len(values) == 1 else ""

    def choice(self, number, options):
        text = self.block(number)
        matches = [LETTER.match(text), EXPLAINED_LETTER.search(text)]
        letters = {match[1] for match in matches if match}
        if not letters:
            letters = set(CONCLUDING_LETTER.findall(text))
        return next(iter(letters)) if len(letters) == 1 and letters <= set(options) else None

    def translation(self, number):
        text = self.block(number)
        text = re.sub(r"^参考译文\s*:\s*", "", text)
        reference = " ".join(EXPLANATION.split(text, maxsplit=1)[0].split())
        return reference if re.match(r"[A-Za-z]", reference) else ""

    def correction(self, number):
        text = self.block(number)
        direct = CORRECTION.search(text)
        parts = EXPLANATION.split(text, maxsplit=1)
        explanation = " ".join(parts[1].split()) if len(parts) > 1 else ""
        if direct:
            return direct[1], direct[2], explanation
        replacements = set(REPLACEMENT.findall(explanation))
        return self.choice(number, "ABCD"), next(iter(replacements)) if len(replacements) == 1 else "", explanation

    def essay(self):
        if len(self.essay_rows) < 2:
            return ""
        return self.essay_rows[0] + "\n\n" + " ".join(self.essay_rows[1:])
