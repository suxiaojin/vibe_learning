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

# A marker immediately after a question number is not an option when actual
# A and B options occur on later rows; normal inline options remain intact.
parsed, _, _ = app.parse_questions_from_rows([[
    '1.A 公司制定了生产计划', '并安排各班组执行。',
    'A.作业计划 B.战略计划', 'C.其他计划 D.长期计划',
    '2.这是正常题干 A.第一项 B.第二项',
    '3.A first B. second',
]])
assert parsed[0]['stem'] == '公司制定了生产计划 并安排各班组执行。'
assert [item['text'] for item in parsed[0]['options']] == ['作业计划', '战略计划', '其他计划', '长期计划']
assert parsed[1]['stem'] == '这是正常题干' and len(parsed[1]['options']) == 2
assert parsed[2]['stem'] == '' and len(parsed[2]['options']) == 2
print('working parser focused regression checks passed')
