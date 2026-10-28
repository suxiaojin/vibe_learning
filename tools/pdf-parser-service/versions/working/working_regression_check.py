"""Focused regressions for the working PDF parser; no private PDFs required."""
import app

questions = [
    {'number': 1, '_sourceNumber': 1, 'type': 'single_choice'},
    {'number': 2, '_sourceNumber': 3, 'type': 'fill_blank'},
]
answer_text = '第1题：A 【解析】：第一题解析\n第2题：【答案】漏识题\n第3题：【答案】正确答案【解析】：第三题解析'
answers = app.parse_answers(answer_text, questions)
assert answers[1]['answer'] == 'A' and '第一题解析' in answers[1]['analysis']
assert answers[2]['answer'] == '正确答案' and '第三题解析' in answers[2]['analysis']
questions[1]['_answerMatchUnsafe'] = True
assert 2 not in app.parse_answers(answer_text, questions)

question = {'type': 'fill_blank', 'stem': '本我和____', 'answer': ['超我'], 'options': [], 'analysis': ''}
app.apply_ai_correction(question, {'type': 'comprehensive', 'stem': '本我和超我', 'answer': []})
assert question['stem'] == '本我和____' and question['answer'] == ['超我']

page = [
    {'x': 0, 'y': 0, 'x2': 50, 'y2': 12, 'height': 12, 'text': '一、填空题', 'score': 1},
    {'x': 0, 'y': 30, 'x2': 100, 'y2': 42, 'height': 12, 'text': '1.这是填空', 'score': 1, '_blankTail': True},
]
parsed, _, _ = app.parse_questions_from_ocr([page])
assert parsed[0]['stem'].endswith('____')
print('working parser focused regression checks passed')
