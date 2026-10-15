import unittest
from mukhtalif_learning.domain import validate_definition, learner_course, assess, eligible, merge_ranges, InvalidInput


def course():
    return {"id": "course-1", "title": "دورة اختبار", "description": "", "published": True, "price": 99,
            "lessons": [{"id": "lesson-1", "title": "درس", "body": "نص", "durationSeconds": 0, "resources": []}], "resources": [],
            "quiz": {"id": "quiz-1", "title": "اختبار", "passPercent": 70, "maxAttempts": 2,
                     "questions": [{"id": "q1", "prompt": "سؤال", "options": ["أ", "ب"], "correct": 1}]},
            "assignment": {"id": "a1", "title": "ورقة عمل", "instructions": "أجب", "required": True, "file": ""}}


class DomainTests(unittest.TestCase):
    def test_never_exposes_answer_keys(self):
        original = validate_definition(course())
        public = learner_course(original)
        self.assertNotIn("correct", public["quiz"]["questions"][0])
        self.assertEqual(original["quiz"]["questions"][0]["correct"], 1)

    def test_grading_requires_exact_question_set(self):
        quiz = validate_definition(course())["quiz"]
        self.assertEqual(assess(quiz, {"q1": 1}), (1, 100, True))
        self.assertEqual(assess(quiz, {"q1": 0}), (0, 0, False))
        for answers in ({}, {"q1": 1, "extra": 1}, {"q1": -1}, {"q1": True}):
            with self.assertRaises(InvalidInput):
                assess(quiz, answers)

    def test_certificate_requires_graded_assignment(self):
        definition = validate_definition(course())
        state = {"progress": {"lesson-1": {"complete": True}}, "quizzes": {"quiz-1": {"passed": True}}, "assignments": {"a1": {"status": "Not Graded"}}}
        self.assertFalse(eligible(definition, state))
        state["assignments"]["a1"]["status"] = "Fail"
        self.assertFalse(eligible(definition, state))
        state["assignments"]["a1"]["status"] = "Pass"
        self.assertTrue(eligible(definition, state))
        state["progress"]["lesson-1"]["complete"] = False
        self.assertFalse(eligible(definition, state))

    def test_ranges_do_not_double_count_or_credit_gaps(self):
        self.assertEqual(merge_ranges([[0, 10], [20, 30]], 5, 15), [[0, 15], [20, 30]])
        self.assertEqual(merge_ranges([[0, 10]], 0, 10), [[0, 10]])
        self.assertEqual(merge_ranges([[0, 10], [20, 30]], 10, 20), [[0, 30]])

    def test_invalid_published_empty_course_and_media_rejected(self):
        value = course(); value["lessons"] = []
        with self.assertRaises(InvalidInput): validate_definition(value)
        value = course(); value["lessons"][0]["video"] = 'https://public.example/video.mp4'
        with self.assertRaises(InvalidInput): validate_definition(value)
        value = course(); value["resources"] = [{"id": "lesson-1", "title": "duplicate", "file": ""}]
        with self.assertRaises(InvalidInput): validate_definition(value)

if __name__ == '__main__': unittest.main()
