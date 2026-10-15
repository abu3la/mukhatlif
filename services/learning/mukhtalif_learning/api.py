"""Only the trusted Hono API may call dispatch. Browser sessions never call it."""
import base64
import hashlib
import hmac
import html
import json
import time
from urllib.parse import urlencode
import frappe
from frappe.utils import now_datetime, nowdate, get_url
from .domain import (InvalidInput, check, identifier, text, number, validate_definition,
                     summary, learner_course, merge_ranges, assess, eligible)


class Denied(Exception):
    def __init__(self, message, status=403):
        self.message, self.status = message, status


def native_id(course, item):
    return "mk-" + hashlib.sha256(f"{course}:{item}".encode()).hexdigest()[:32]


def member_id(actor):
    if not actor or not isinstance(actor.get("id"), str) or len(actor["id"]) > 150:
        raise Denied("سجّل الدخول أولًا.")
    return hashlib.sha256(actor["id"].encode()).hexdigest() + "@customers.invalid"


def course_definition(course_id, published=True):
    identifier(course_id)
    value = frappe.db.get_value("LMS Course", course_id, "custom_mukhtalif_definition")
    if not value:
        raise Denied("الدورة غير موجودة.", 404)
    course = json.loads(value)
    if published and not course["published"]:
        raise Denied("الدورة غير متاحة.", 404)
    return course


def enrollment(course_id, member):
    name = frappe.db.get_value("LMS Enrollment", {"course": course_id, "member": member}, "name")
    if not name:
        raise Denied("سجّل في الدورة للوصول إلى محتواها.")
    # All learner updates serialize on the enrollment row: retries and two tabs
    # cannot consume extra quiz attempts or overwrite another lesson's progress.
    frappe.db.get_value("LMS Enrollment", name, "name", for_update=True)
    doc = frappe.get_doc("LMS Enrollment", name)
    if not doc.custom_mukhtalif_state:
        raise Denied("هذا التسجيل غير مرتبط بحساب مختلف.")
    return doc, json.loads(doc.custom_mukhtalif_state)


def public_state(state):
    return {key: value for key, value in state.items() if not key.startswith("_")}


def persist(doc, state):
    doc.db_set("custom_mukhtalif_state", json.dumps(state, ensure_ascii=False), update_modified=True)


def assessments(course, kind):
    return [source[kind] for source in [course, *course["lessons"]] if source.get(kind)]


def all_files(course):
    result = {course["trailer"]} if course.get("trailer") else set()
    for source in [course, *course["lessons"]]:
        if source.get("video"):
            result.add(source["video"])
        result.update(resource["file"] for resource in source["resources"] if resource["file"])
        if source.get("assignment", {}).get("file"):
            result.add(source["assignment"]["file"])
    return result


def require_owned_file(file_url, course_id):
    from . import storage
    if storage.remote():
        if file_url not in storage.assets(course_id):
            raise Denied("ارفع الملف لهذه الدورة أولًا.", 422)
        return
    if not frappe.db.exists("File", {"file_url": file_url, "is_private": 1, "attached_to_doctype": "LMS Course", "attached_to_name": course_id}):
        raise Denied("ارفع الملف لهذه الدورة أولًا.", 422)


@frappe.whitelist(methods=["POST"])
def dispatch(action, payload=None, actor=None):
    if not frappe.conf.get("mukhtalif_bridge_user") or frappe.session.user != frappe.conf.mukhtalif_bridge_user:
        frappe.throw("Bridge access required", frappe.PermissionError)
    frappe.flags.mute_emails = True
    payload = frappe.parse_json(payload) if isinstance(payload, str) else (payload or {})
    actor = frappe.parse_json(actor) if isinstance(actor, str) else actor
    try:
        if action.startswith("studio.") and (not actor or actor.get("admin") is not True):
            raise Denied("إدارة الدورات متاحة للمدير فقط.")
        return {"data": execute(action, payload, actor)}
    except (InvalidInput, Denied) as error:
        frappe.db.rollback()
        return {"error": str(error) if isinstance(error, InvalidInput) else error.message,
                "status": 422 if isinstance(error, InvalidInput) else error.status}


def execute(action, payload, actor):
    if action in ("catalog", "studio.catalog"):
        rows = frappe.get_all("LMS Course", filters={"custom_mukhtalif_definition": ["is", "set"]}, fields=["custom_mukhtalif_definition"], order_by="modified desc", limit_page_length=1000)
        courses = [json.loads(row.custom_mukhtalif_definition) for row in rows]
        return [summary(c) for c in courses if action.startswith("studio.") or c["published"]]
    if action == "studio.save":
        return save_course(payload)
    if action == "library":
        member = member_id(actor)
        rows = frappe.get_all("LMS Enrollment", filters={"member": member}, fields=["course", "custom_mukhtalif_state"])
        result = []
        for row in rows:
            if row.custom_mukhtalif_state:
                course = course_definition(row.course, published=False)
                result.append({"course": summary(course), "enrollment": public_state(json.loads(row.custom_mukhtalif_state))})
        return result
    course = course_definition(payload.get("courseId"), published=not action.startswith("studio."))
    course_id = course["id"]
    if action == "detail":
        return {**summary(course), "lessons": [{"id": x["id"], "title": x["title"], "durationSeconds": x["durationSeconds"]} for x in course["lessons"]]}
    if action == "trailer":
        file_url = course.get('trailer')
        if not file_url:
            raise Denied('لا يوجد مقطع تعريفي لهذه الدورة.', 404)
        require_owned_file(file_url, course_id)
        ticket = base64.urlsafe_b64encode(json.dumps({'course': course_id, 'file': file_url, 'preview': True, 'exp': int(time.time()) + 3600}).encode()).decode()
        return {'url': get_url('/api/method/mukhtalif_learning.api.asset?') + urlencode({'ticket': ticket, 'signature': sign(ticket)})}
    if action == "studio.detail":
        return course
    if action in ("studio.upload-start", "studio.upload-chunk", "studio.upload-finish"):
        from . import uploads
        return {"studio.upload-start": uploads.start, "studio.upload-chunk": uploads.chunk, "studio.upload-finish": uploads.finish}[action](course_id, payload)
    if action == "studio.learners":
        rows = frappe.get_all("LMS Enrollment", filters={"course": course_id}, fields=["member", "member_name", "custom_mukhtalif_state"])
        return [{"member": row.member, "name": row.member_name, "enrollment": public_state(json.loads(row.custom_mukhtalif_state)),
                 "submissions": frappe.get_all("LMS Assignment Submission", filters={"course": course_id, "member": row.member}, fields=["name", "assignment_title", "answer", "status", "comments"])} for row in rows if row.custom_mukhtalif_state]
    if action == "studio.grade":
        return grade(course, payload)
    member = member_id(actor)
    if action == "checkout":
        return checkout(course, actor, member, payload)
    doc, state = enrollment(course_id, member)
    if action == "workspace":
        return {"course": learner_course(course), "enrollment": public_state(state)}
    if action == "progress":
        progress(course, state, member, payload)
    elif action == "quiz":
        quiz_submission(course, state, member, payload)
    elif action == "assignment":
        assignment_submission(course, state, member, payload)
    elif action == "certificate":
        certificate(course, state, member)
    elif action == "asset":
        file_url = payload.get("file")
        if file_url not in all_files(course):
            raise Denied("الملف غير موجود في الدورة.", 404)
        require_owned_file(file_url, course_id)
        data = base64.urlsafe_b64encode(json.dumps({"course": course_id, "member": member, "file": file_url, "exp": int(time.time()) + 3600}).encode()).decode()
        signature = sign(data)
        return {"url": get_url("/api/method/mukhtalif_learning.api.asset?") + urlencode({"ticket": data, "signature": signature})}
    else:
        raise Denied("الطلب غير متاح.", 404)
    persist(doc, state)
    return public_state(state)


def checkout(course, actor, member, payload):
    if not frappe.conf.get("mukhtalif_simulation_enabled") or payload.get("mode") != "simulation":
        raise Denied("التسجيل التجريبي غير متاح الآن.")
    if payload.get("outcome") != "success":
        raise Denied("رُفض الدفع التجريبي. لم يُخصم أي مبلغ ولم تُفتح الدورة.", 409)
    frappe.db.get_value("LMS Course", course["id"], "name", for_update=True)
    if frappe.db.exists("LMS Enrollment", {"course": course["id"], "member": member}):
        return public_state(enrollment(course["id"], member)[1])
    if not frappe.db.exists("User", member):
        frappe.get_doc({"doctype": "User", "email": member, "first_name": text(actor.get("name", "متعلم"), 140, True), "enabled": 0, "send_welcome_email": 0, "user_type": "Website User"}).insert(ignore_permissions=True)
    state = {"courseId": course["id"], "lastLesson": None, "progress": {}, "quizzes": {}, "assignments": {}, "certificate": None,
             "order": {"id": frappe.generate_hash(length=20), "amount": course["price"], "mode": "simulation", "createdAt": str(now_datetime())}, "_ranges": {}, "_reported": {}}
    frappe.get_doc({"doctype": "LMS Enrollment", "course": course["id"], "member": member, "custom_mukhtalif_state": json.dumps(state)}).insert(ignore_permissions=True)
    return public_state(state)


def progress(course, state, member, payload):
    lesson = next((x for x in course["lessons"] if x["id"] == payload.get("lessonId")), None)
    check(lesson is not None, "الدرس غير موجود.")
    position = number(payload.get("position"), 0, lesson["durationSeconds"] or 0)
    previous = state["progress"].get(lesson["id"], {"position": 0, "watched": 0, "complete": False})
    now = time.time()
    last = state.setdefault("_reported", {}).get(lesson["id"], now)
    ranges = state.setdefault("_ranges", {}).get(lesson["id"], [])
    if "start" in payload and "end" in payload:
        start = number(payload["start"], 0, lesson["durationSeconds"])
        end = number(payload["end"], start, lesson["durationSeconds"])
        check(end - start <= min(32, max(0, now - last) * 2.2 + 1), "تعذّر حفظ هذا المقطع. استأنف المشاهدة.")
        if end > start:
            ranges = merge_ranges(ranges, start, end)
    state["_reported"][lesson["id"]] = now
    state["_ranges"][lesson["id"]] = ranges
    watched = sum(right - left for left, right in ranges)
    read_percent = max(previous.get("readPercent", 0), number(payload.get("readPercent", 0), 0, 100)) if not lesson["video"] else 0
    complete = previous["complete"] or (watched >= lesson["durationSeconds"] * .9 if lesson["video"] else payload.get("read") is True or read_percent >= 100)
    state["progress"][lesson["id"]] = {"position": position, "watched": watched, "complete": complete, "readPercent": read_percent}
    state["lastLesson"] = lesson["id"]
    if complete and not previous["complete"]:
        frappe.get_doc({"doctype": "LMS Course Progress", "course": course["id"], "chapter": native_id(course["id"], "chapter"), "lesson": native_id(course["id"], lesson["id"]), "member": member, "status": "Complete"}).insert(ignore_permissions=True)


def quiz_submission(course, state, member, payload):
    quiz = next((q for q in assessments(course, "quiz") if q["id"] == payload.get("quizId")), None)
    check(quiz is not None, "الاختبار غير موجود.")
    old = state["quizzes"].get(quiz["id"], {"attempts": 0, "passed": False})
    check(old["attempts"] < quiz["maxAttempts"], "استهلكت جميع المحاولات.")
    score, percentage, passed = assess(quiz, payload.get("answers"))
    rows = [{"question_name": native_id(course["id"], q["id"]), "question": html.escape(q["prompt"]), "question_type": "Choices", "answer": html.escape(q["options"][payload["answers"][q["id"]]]), "is_correct": int(payload["answers"][q["id"]] == q["correct"]), "marks": int(payload["answers"][q["id"]] == q["correct"]), "marks_out_of": 1} for q in quiz["questions"]]
    frappe.get_doc({"doctype": "LMS Quiz Submission", "quiz": native_id(course["id"], quiz["id"]), "member": member, "course": course["id"], "result": rows, "score": score, "percentage": percentage, "score_out_of": len(rows), "passing_percentage": quiz["passPercent"]}).insert(ignore_permissions=True)
    state["quizzes"][quiz["id"]] = {"attempts": old["attempts"] + 1, "passed": old["passed"] or passed, "percentage": percentage}


def assignment_submission(course, state, member, payload):
    assignment = next((a for a in assessments(course, "assignment") if a["id"] == payload.get("assignmentId")), None)
    check(assignment is not None, "ورقة العمل غير موجودة.")
    old = state["assignments"].get(assignment["id"])
    check(not old or old["status"] != "Pass", "اجتزت ورقة العمل بالفعل.")
    answer = html.escape(text(payload.get("answer"), 20000, True)).replace("\n", "<br>")
    if old:
        doc = frappe.get_doc("LMS Assignment Submission", old["id"])
        doc.answer, doc.status, doc.comments = answer, "Not Graded", ""
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({"doctype": "LMS Assignment Submission", "assignment": native_id(course["id"], assignment["id"]), "member": member, "course": course["id"], "type": "Text", "answer": answer, "status": "Not Graded"}).insert(ignore_permissions=True)
    state["assignments"][assignment["id"]] = {"id": doc.name, "status": "Not Graded", "comments": "", "answer": text(payload.get("answer"), 20000, True)}


def grade(course, payload):
    doc = frappe.get_doc("LMS Assignment Submission", identifier(payload.get("submissionId")))
    check(doc.course == course["id"] and payload.get("status") in ("Pass", "Fail"))
    enrollment_doc, state = enrollment(course["id"], doc.member)
    assignment_id = next((key for key, value in state["assignments"].items() if value["id"] == doc.name), None)
    check(assignment_id is not None)
    comments = text(payload.get("comments", ""), 10000)
    doc.status, doc.comments, doc.evaluator = payload["status"], html.escape(comments), frappe.session.user
    doc.save(ignore_permissions=True)
    state["assignments"][assignment_id] = {**state["assignments"][assignment_id], "id": doc.name, "status": doc.status, "comments": comments}
    persist(enrollment_doc, state)
    return public_state(state)


def certificate(course, state, member):
    check(eligible(course, state), "أكمل الدروس واجتز الاختبارات وأوراق العمل المطلوبة أولًا.")
    if state["certificate"]:
        return
    doc = frappe.get_doc({"doctype": "LMS Certificate", "course": course["id"], "member": member, "issue_date": nowdate(), "published": 0, "template": "Mukhtalif Completion"}).insert(ignore_permissions=True)
    state["certificate"] = {"id": doc.name, "issuedAt": str(doc.issue_date), "member": frappe.db.get_value("User", member, "full_name")}


def upsert(doctype, name, fields):
    if frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        doc.update(fields)
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({"doctype": doctype, **fields})
        doc.insert(ignore_permissions=True, set_name=name)
    return doc


def save_course(payload):
    course = validate_definition(payload)
    existing = frappe.db.exists("LMS Course", course["id"])
    if existing:
        frappe.db.get_value("LMS Course", course["id"], "name", for_update=True)
        old = course_definition(course["id"], published=False)
        if frappe.db.exists("LMS Enrollment", {"course": course["id"]}):
            # Freeze learning requirements once students enroll. Publish state and
            # catalogue copy remain editable; create another course for revisions.
            check(all(old.get(key) == course.get(key) for key in ("lessons", "quiz", "assignment", "resources")), "للدورة مشتركون. أنشئ نسخة جديدة لتعديل المحتوى أو شروط الإكمال.")
    for file_url in all_files(course):
        require_owned_file(file_url, course["id"])
    doc = upsert("LMS Course", course["id"], {"title": course["title"], "short_introduction": course["description"][:140], "description": html.escape(course["description"]), "disable_self_learning": 1, "paid_course": 0, "enable_certification": 1, "published": 0, "custom_mukhtalif_definition": json.dumps(course, ensure_ascii=False)})
    chapter_id = native_id(course["id"], "chapter")
    chapter = upsert("Course Chapter", chapter_id, {"title": "محتوى الدورة", "course": doc.name})
    for quiz in assessments(course, "quiz"):
        for q in quiz["questions"]:
            fields = {"question": html.escape(q["prompt"]), "type": "Choices", "multiple": 0}
            for i, option in enumerate(q["options"], 1):
                fields[f"option_{i}"] = html.escape(option)
                fields[f"is_correct_{i}"] = int(i - 1 == q["correct"])
            upsert("LMS Question", native_id(doc.name, q["id"]), fields)
        upsert("LMS Quiz", native_id(doc.name, quiz["id"]), {"title": quiz["title"], "course": doc.name, "max_attempts": quiz["maxAttempts"], "passing_percentage": quiz["passPercent"], "show_answers": 0, "questions": [{"question": native_id(doc.name, q["id"]), "marks": 1} for q in quiz["questions"]]})
    for assignment in assessments(course, "assignment"):
        upsert("LMS Assignment", native_id(doc.name, assignment["id"]), {"title": assignment["title"], "question": html.escape(assignment["instructions"]), "type": "Text", "grade_assignment": 1, "course": doc.name})
    for lesson in course["lessons"]:
        upsert("Course Lesson", native_id(doc.name, lesson["id"]), {"title": lesson["title"], "course": doc.name, "chapter": chapter.name, "body": html.escape(lesson["body"]), "include_in_preview": 0})
    chapter.lessons = []
    for lesson in course["lessons"]:
        chapter.append("lessons", {"lesson": native_id(doc.name, lesson["id"])})
    chapter.save(ignore_permissions=True)
    doc.reload()
    doc.chapters = []
    doc.append("chapters", {"chapter": chapter.name})
    # Keep the native portal unpublished: Hono owns publication and access.
    doc.save(ignore_permissions=True)
    return course


def sign(ticket):
    secret = frappe.conf.get("mukhtalif_media_secret")
    if not secret or len(secret) < 32:
        raise Denied("خدمة الملفات غير مهيأة.", 503)
    return hmac.new(secret.encode(), ticket.encode(), hashlib.sha256).hexdigest()


@frappe.whitelist(allow_guest=True, methods=["GET"])
def asset(ticket, signature):
    # A short-lived capability contains no API key. Recheck enrollment and course
    # publication on every read. Never redirect private files to a public URL.
    if len(ticket) > 3000 or not hmac.compare_digest(sign(ticket), signature):
        frappe.throw("Invalid media link", frappe.PermissionError)
    try:
        data = json.loads(base64.urlsafe_b64decode(ticket))
        if data["exp"] < time.time():
            raise ValueError()
        course = course_definition(data["course"])
        if data["file"] not in all_files(course):
            raise ValueError()
        if data.get('preview') is True:
            if not course.get('trailer') or data['file'] != course['trailer']:
                raise ValueError()
        elif not frappe.db.exists("LMS Enrollment", {"course": data["course"], "member": data["member"]}):
            raise ValueError()
        require_owned_file(data["file"], data["course"])
    except (ValueError, KeyError, Denied):
        frappe.throw("Expired media link", frappe.PermissionError)
    from . import storage
    if storage.remote():
        from werkzeug.utils import redirect
        response = redirect(storage.download(data["course"], data["file"]), code=302)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response
    file_doc = frappe.get_doc("File", {"file_url": data["file"], "is_private": 1})
    from werkzeug.utils import send_file
    response = send_file(file_doc.get_full_path(), frappe.request.environ, conditional=True,
                         as_attachment=not file_doc.file_name.lower().endswith((".mp4", ".webm", ".mp3")),
                         download_name=file_doc.file_name, max_age=0)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
