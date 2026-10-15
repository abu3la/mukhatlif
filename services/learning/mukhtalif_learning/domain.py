"""Pure domain rules, independent of Frappe and testable without a live site."""
import copy
import math
import re


class InvalidInput(ValueError):
    pass


def check(condition, message="راجع بيانات الدورة."):
    if not condition:
        raise InvalidInput(message)


def text(value, maximum=20000, required=False):
    check(isinstance(value, str) and len(value) <= maximum and (not required or value.strip()))
    return value.strip()


def identifier(value):
    value = text(value, 140, True)
    check(re.fullmatch(r"[a-zA-Z0-9_-]+", value))
    return value


def number(value, low, high):
    check(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high)
    return value


def private_file(value):
    value = text(value, 500)
    check(not value or (value.startswith("/private/files/") and not any(x in value for x in ("..", "?", "#", "\\", "\n", "\r"))))
    return value


def validate_definition(data):
    check(isinstance(data, dict))
    result = {"id": identifier(data.get("id")), "title": text(data.get("title"), 200, True),
              "description": text(data.get("description")), "published": data.get("published") is True,
              "price": number(data.get("price"), 0, 100000), "durationMinutes": 0}
    for key in ("category", "skill", "level", "instructor"):
        result[key] = text(data.get(key, ""), 200)
    result['overview'] = text(data.get('overview', ''))
    result['audience'] = text(data.get('audience', ''), 3000)
    result['trailer'] = private_file(data.get('trailer', ''))
    check(not result['trailer'] or result['trailer'].lower().endswith(('.mp4', '.webm')), 'ارفع فيديو MP4 أو WebM للمقطع التعريفي.')
    seen = set()
    def unique(value):
        value = identifier(value)
        check(value not in seen, "معرّفات المحتوى مكررة.")
        seen.add(value)
        return value
    def resources(items):
        check(isinstance(items, list) and len(items) <= 30)
        return [{"id": unique(x.get("id")), "title": text(x.get("title"), 200, True), "file": private_file(x.get("file", ""))} for x in items]
    def assessments(source, target):
        quiz = source.get("quiz")
        if quiz:
            questions = quiz.get("questions")
            check(isinstance(questions, list) and 1 <= len(questions) <= 50)
            target["quiz"] = {"id": unique(quiz.get("id")), "title": text(quiz.get("title"), 200, True),
                              "passPercent": number(quiz.get("passPercent"), 1, 100), "maxAttempts": number(quiz.get("maxAttempts"), 1, 100), "questions": []}
            check(int(target["quiz"]["maxAttempts"]) == target["quiz"]["maxAttempts"])
            for question in questions:
                options = question.get("options")
                check(isinstance(options, list) and 2 <= len(options) <= 10)
                correct = number(question.get("correct"), 0, len(options) - 1)
                check(int(correct) == correct)
                target["quiz"]["questions"].append({"id": unique(question.get("id")), "prompt": text(question.get("prompt"), 3000, True), "options": [text(x, 2000, True) for x in options], "correct": int(correct)})
        assignment = source.get("assignment")
        if assignment:
            target["assignment"] = {"id": unique(assignment.get("id")), "title": text(assignment.get("title"), 200, True), "instructions": text(assignment.get("instructions")), "required": assignment.get("required") is True, "file": private_file(assignment.get("file", ""))}
    lessons = data.get("lessons")
    check(isinstance(lessons, list) and len(lessons) <= 200)
    result["lessons"] = []
    for lesson in lessons:
        item = {"id": unique(lesson.get("id")), "title": text(lesson.get("title"), 200, True), "body": text(lesson.get("body", "")), "video": private_file(lesson.get("video", "")), "durationSeconds": number(lesson.get("durationSeconds", 0), 0, 86400), "resources": resources(lesson.get("resources", []))}
        check(not item["video"] or item["durationSeconds"] > 0, "حدّد مدة الفيديو بالثواني.")
        assessments(lesson, item)
        result["lessons"].append(item)
    result["resources"] = resources(data.get("resources", []))
    assessments(data, result)
    result["lessonCount"] = len(result["lessons"])
    result["durationMinutes"] = math.ceil(sum(x["durationSeconds"] for x in result["lessons"]) / 60)
    check(not result["published"] or bool(result["lessons"]), "أضف درسًا قبل نشر الدورة.")
    return result


def summary(course):
    return {**{k: v for k, v in course.items() if k not in ("lessons", "resources", "quiz", "assignment", "trailer")}, "hasTrailer": bool(course.get("trailer"))}


def learner_course(course):
    result = copy.deepcopy(course)
    for source in [result, *result["lessons"]]:
        for question in source.get("quiz", {}).get("questions", []):
            question.pop("correct", None)
    return result


def merge_ranges(ranges, start, end):
    result = []
    for left, right in sorted([*ranges, [start, end]]):
        if result and left <= result[-1][1]:
            result[-1][1] = max(result[-1][1], right)
        else:
            result.append([left, right])
    return result


def assess(quiz, answers):
    check(isinstance(answers, dict) and set(answers) == {q["id"] for q in quiz["questions"]}, "أجب عن جميع الأسئلة.")
    for question in quiz["questions"]:
        answer = answers[question["id"]]
        check(isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer < len(question["options"]))
    score = sum(answers[q["id"]] == q["correct"] for q in quiz["questions"])
    percentage = score * 100 / len(quiz["questions"])
    return score, percentage, percentage >= quiz["passPercent"]


def eligible(course, state):
    if not course["lessons"] or not all(state["progress"].get(x["id"], {}).get("complete") for x in course["lessons"]):
        return False
    for source in [course, *course["lessons"]]:
        if source.get("quiz") and not state["quizzes"].get(source["quiz"]["id"], {}).get("passed"):
            return False
        assignment = source.get("assignment")
        if assignment and assignment["required"] and state["assignments"].get(assignment["id"], {}).get("status") != "Pass":
            return False
    return True
