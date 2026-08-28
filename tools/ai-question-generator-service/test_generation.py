"""Pure generation-contract tests; no model calls, HTTP requests or database writes."""
import ast
import json
import re
import unittest
from pathlib import Path
from typing import Any

source = Path(__file__).with_name('app.py').read_text(encoding='utf-8')
tree = ast.parse(source)
names = {
    'QUESTION_TYPE_ORDER', 'QUESTION_TYPES', 'QUESTION_TYPE_LABELS', 'DIFFICULTIES',
    'normalize_text', 'normalize_for_match', 'sanitize_options', 'sanitize_answer',
    'choose_question_type', 'parse_question_type_counts', 'build_target_question_types',
    'build_target_reference_chapters', 'build_generation_plan', 'sanitize_generated_question'
}
nodes = [node for node in tree.body if
         isinstance(node, ast.FunctionDef) and node.name in names or
         isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in names for target in node.targets)]
scope = {'Any': Any, 're': re, 'json': json}
exec(compile(ast.Module(body=nodes, type_ignores=[]), 'app.py', 'exec'), scope)


class GenerationContractTest(unittest.TestCase):
    def test_subjective_types_preserve_full_answers(self):
        for question_type in scope['QUESTION_TYPES'] - {'single_choice', 'multiple_choice', 'true_false'}:
            with self.subTest(type=question_type):
                question, warnings = scope['sanitize_generated_question'](
                    {'type': question_type, 'stem': '解释边际成本', 'options': [{'key': 'A', 'text': 'discard'}],
                     'answer': ['完整答案，含推导\n第二行'], 'analysis': '完整解析'},
                    number=1, meta={'year': 2026}, sample_stems=[], expected_type=question_type,
                    expected_section={'id': 'chapter', 'title': '经济学概述'})
                self.assertEqual(question['type'], question_type)
                self.assertEqual(question['options'], [])
                self.assertEqual(question['answer'], ['完整答案，含推导\n第二行'])
                self.assertEqual(question['syllabusItemIds'], ['chapter'])
                self.assertEqual(warnings, [])

    def test_plan_respects_counts_and_chapter_types(self):
        plan = scope['build_generation_plan']({
            'questionTypes': ['single_choice', 'term_explanation'],
            'questionTypeCounts': {'term_explanation': 2},
            'referenceChapters': [
                {'id': 'a', 'questionTypes': ['single_choice']},
                {'id': 'b', 'questionTypes': ['term_explanation']}
            ]}, 4)
        self.assertEqual([item['type'] for item in plan], ['term_explanation', 'term_explanation', 'single_choice', 'term_explanation'])
        self.assertEqual([item['referenceChapterId'] for item in plan], ['b', 'b', 'a', 'b'])

    def test_mismatch_is_rejected_not_relabelled(self):
        question, warnings = scope['sanitize_generated_question'](
            {'type': 'single_choice', 'stem': 'not an essay'}, number=1,
            meta={}, sample_stems=[], expected_type='essay')
        self.assertIsNone(question)
        self.assertTrue(warnings)

    def test_choice_and_true_false_still_work(self):
        for question_type, answers in [('single_choice', ['A']), ('multiple_choice', ['A', 'B']), ('true_false', ['A'])]:
            question, _ = scope['sanitize_generated_question'](
                {'type': question_type, 'stem': '示例', 'options': [{'key': key, 'text': key} for key in 'ABCD'], 'answer': answers, 'analysis': '解析'},
                number=1, meta={'year': 2026}, sample_stems=[], expected_type=question_type)
            self.assertEqual(question['answer'], answers)
            self.assertEqual(len(question['options']), 2 if question_type == 'true_false' else 4)

    def test_chapter_mismatch_is_rejected(self):
        question, warnings = scope['sanitize_generated_question'](
            {'type': 'essay', 'referenceChapterId': 'other'}, number=1,
            meta={}, sample_stems=[], expected_type='essay', expected_section={'id': 'chapter'})
        self.assertIsNone(question)
        self.assertTrue(warnings)


if __name__ == '__main__':
    unittest.main()
