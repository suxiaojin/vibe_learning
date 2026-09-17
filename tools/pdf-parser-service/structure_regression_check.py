from __future__ import annotations

import app


def assert_global_numbering() -> None:
    questions, warnings, debug = app.parse_questions_from_rows(
        [[
            "一、单项选择题（本大题共2题，每小题2分）",
            "1. 第一题 A.甲 B.乙 C.丙 D.丁",
            "2. 根据材料选择正确说法 A.甲 B.乙 C.丙 D.丁",
            "二、判断题（本题共2题，每小题2分）",
            "3. 请判断该说法是否正确。",
            "4. 由此可以判断该结论成立。",
            "三、简答题（共1道题，每题10分）",
            "5. 简述相关概念。",
            "四、材料分析题（共1道题，每题15分）",
            "6. 阅读材料并回答问题。",
        ]]
    )
    assert [question["number"] for question in questions] == list(range(1, 7))
    assert [question["_sourceNumber"] for question in questions] == list(range(1, 7))
    assert [question["type"] for question in questions] == [
        "single_choice",
        "single_choice",
        "true_false",
        "true_false",
        "comprehensive",
        "comprehensive",
    ]
    assert debug["expectedQuestionCount"] == 6
    assert not [warning for warning in warnings if "乱序题号" in warning or "重复或噪声题号" in warning]


def assert_section_local_numbering() -> None:
    questions, warnings, debug = app.parse_questions_from_rows(
        [[
            "一、单项选择题（本大题共2题）",
            "1. 第一题 A.甲 B.乙 C.丙 D.丁",
            "2. 第二题 A.甲 B.乙 C.丙 D.丁",
            "二、判断题（本题共2题）",
            "1. 第一题判断。",
            "2. 第二题判断。",
            "三、简答题（共1道题）",
            "1. 第一题简答。",
        ]]
    )
    assert [question["number"] for question in questions] == list(range(1, 6))
    assert [question["_sourceNumber"] for question in questions] == [1, 2, 1, 2, 1]
    assert [question["_sectionIndex"] for question in questions] == [0, 0, 1, 1, 2]
    assert debug["expectedQuestionCount"] == 5
    assert not [warning for warning in warnings if "乱序题号" in warning or "重复或噪声题号" in warning]


def assert_heading_detection_is_structural() -> None:
    assert app.detect_section("二、判断题（本题共10题）") == "true_false"
    assert app.detect_section("四、材料分析题（阅读材料并回答问题）") == "comprehensive"
    assert app.detect_section("17. 由此可以判断该结论成立。") is None
    assert app.detect_section("20. 请选择正确答案。") is None
    assert app.detect_section("21. 计算结果如下。") is None
    assert app.expected_count_from_heading("三、简答题（共4道题，每题10分）") == 4


def main() -> None:
    assert_global_numbering()
    assert_section_local_numbering()
    assert_heading_detection_is_structural()
    print("question parser structure regression checks passed")


if __name__ == "__main__":
    main()
