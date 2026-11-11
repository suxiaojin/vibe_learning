"""Extract the three Part IV translation sections for the English V1 preview."""
import re
from reading import NOISE, clean

PART = re.compile(r'^Part\s*(?:IV|4)\s*Translation\b', re.I)
END = re.compile(r'^Part\s*(?:V|5)\b', re.I)
SECTION = re.compile(r'^Section\s*([ABC])\b', re.I)
NUMBER = re.compile(r'^(\d{1,3})\s*[.．)]\s*(.+)')
OPTION = re.compile(r'(?<![A-Za-z])([A-J])\s*[.．)]\s*')
TITLES = ['Section A English-Chinese Translation', 'Section B Blanked Cloze', 'Section C Chinese-English Translation']


def parse_translation(rows):
    sections, active, started = {}, None, False
    for raw in rows:
        row = clean(raw)
        if PART.match(row):
            started = True
        elif started and END.match(row):
            break
        elif started and (match := SECTION.match(row)):
            active = match[1].upper()
            if active in sections:
                raise ValueError(f'Part IV Section {active} 重复。')
            sections[active] = []
        elif started and active and row and not NOISE.fullmatch(row):
            sections[active].append(row)
    if set(sections) != set('ABC'):
        raise ValueError('Part IV 的三个 Section 未完整识别。')

    a, current, kind = {}, None, None
    for row in sections['A']:
        number = NUMBER.match(row)
        option = re.match(r'^([A-D])\s*[.．)]\s*(.+)', row)
        if number:
            n = int(number[1])
            if n in a:
                raise ValueError(f'第 {n} 题重复。')
            current, kind = {'text': number[2], 'options': {}}, 'text'
            a[n] = current
        elif current and option:
            kind = option[1]
            if kind in current['options']:
                raise ValueError(f'第 {n} 题选项重复。')
            current['options'][kind] = option[2]
        elif current:
            if kind == 'text': current['text'] += ' ' + row
            else: current['options'][kind] += ' ' + row
    if len(a) != 5 or any(set(q['options']) != set('ABCD') for q in a.values()):
        raise ValueError('Section A 题目或选项识别不完整。')
    a_numbers = list(a)
    if a_numbers != list(range(a_numbers[0], a_numbers[0] + 5)):
        raise ValueError('Section A 题号不连续。')
    first = {'number': 1, 'title': TITLES[0], 'stem': '\n'.join(f'{n}. {q["text"]}' for n, q in a.items()),
             'questions': [{'number': n, 'options': q['options'], 'answer': None} for n, q in a.items()]}

    b = sections['B']
    end_directions = next((i for i, row in enumerate(b[:8]) if re.search(r'\bone\s*[.。]?$', row, re.I)), None)
    if end_directions is None:
        end_directions = next((i for i, row in enumerate(b[:8]) if re.search(
            r'answersheet[.]*(?:\(3[x×*]5\))?$', re.sub(r'\s+', '', row), re.I)), None)
    if end_directions is None:
        raise ValueError('无法区分 Section B 说明和原文。')
    b = b[end_directions + 1:]
    option_start = next((i for i, row in enumerate(b) if re.match(r'^A\s*[.．)]', row)), None)
    if option_start is None:
        raise ValueError('未识别 Section B 选项。')
    text = ' '.join(b[option_start:])
    markers = list(OPTION.finditer(text))
    if sorted(m[1] for m in markers) != list('ABCDEFGHIJ'):
        raise ValueError('Section B 的 A—J 选项识别不完整。')
    options = dict(sorted((m[1], text[m.end():markers[i + 1].start() if i + 1 < len(markers) else len(text)].strip())
                          for i, m in enumerate(markers)))
    if not all(options.values()): raise ValueError('Section B 存在空选项。')
    stem = '\n'.join(b[:option_start])
    b_numbers = list(range(a_numbers[-1] + 1, a_numbers[-1] + 6))
    for n in b_numbers:
        pattern = rf'(?<!\d){n}(?!\d)'
        if len(re.findall(pattern, stem)) != 1:
            raise ValueError(f'无法确认 Section B 第 {n} 空的位置。')
        stem = re.sub(pattern, f'___{n}___', stem)
    second = {'number': 2, 'title': TITLES[1], 'stem': stem,
              'questions': [{'number': n, 'options': dict(options), 'answer': None} for n in b_numbers]}

    c, current = {}, None
    for row in sections['C']:
        match = NUMBER.match(row)
        if match:
            n = int(match[1])
            if n in c: raise ValueError(f'第 {n} 题重复。')
            c[n] = match[2]
            current = n
        elif current is not None:
            c[current] += row
    if list(c) != list(range(b_numbers[-1] + 1, b_numbers[-1] + 6)):
        raise ValueError('Section C 题号未完整识别。')
    third = {'number': 3, 'title': TITLES[2], 'stem': '\n'.join(f'{n}. {text}' for n, text in c.items()),
             'questions': [{'number': n, 'options': {}, 'answer': None} for n in c]}
    return [first, second, third]


def translation_answers(rows, sections):
    text = '\n'.join(rows)
    markers = list(re.finditer(r'第\s*(\d{1,3})\s*题', text))
    blocks = {}
    for i, marker in enumerate(markers):
        number = int(marker[1])
        blocks.setdefault(number, []).append(text[marker.end():markers[i+1].start() if i+1 < len(markers) else len(text)])
    for section in sections:
        for question in section['questions']:
            n = question['number']
            candidates = []
            for block in blocks.get(n, []):
                if section['number'] < 3:
                    match = re.match(r'\s*[:：]?\s*(?:答案\s*[:：]\s*)?([A-J])(?=\s|[,，.(（]|$)', block)
                    if match and match[1] in question['options']: candidates.append(match[1])
                else:
                    match = re.search(r'参考译文\s*[:：]\s*(.*?)(?=解析\s*[:：]|$)', block, re.S)
                    if match: candidates.append(re.sub(r'\s+', ' ', match[1]).strip())
            if len(set(candidates)) != 1 or not candidates[0]:
                raise ValueError(f'无法唯一匹配第 {n} 题参考答案。')
            question['answer'] = candidates[0]
    return sections
