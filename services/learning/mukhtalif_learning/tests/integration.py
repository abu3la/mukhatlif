"""Run only on a disposable, explicitly test-enabled Frappe site."""
import json
import secrets
from pathlib import Path
import frappe
from mukhtalif_learning import api


def guard():
    if not frappe.conf.get("allow_tests") or not frappe.local.site.startswith("learning-test."):
        raise RuntimeError("This test requires an isolated learning-test site with allow_tests enabled.")
    frappe.flags.mute_emails = True


def bootstrap():
    guard()
    user = "bridge@learning.invalid"
    if not frappe.db.exists("User", user):
        frappe.get_doc({"doctype": "User", "email": user, "first_name": "Learning test bridge", "enabled": 1, "send_welcome_email": 0, "user_type": "System User", "roles": [{"role": "Moderator"}, {"role": "Course Creator"}]}).insert(ignore_permissions=True)
    key, secret = secrets.token_hex(16), secrets.token_hex(24)
    doc = frappe.get_doc("User", user)
    doc.api_key, doc.api_secret = key, secret
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    path = Path(frappe.get_site_path("site_config.json"))
    config = json.loads(path.read_text())
    config.update(mukhtalif_bridge_user=user, mukhtalif_simulation_enabled=True, mukhtalif_media_secret=secrets.token_hex(32), mute_emails=1, host_name="http://127.0.0.1:18000")
    path.write_text(json.dumps(config)); path.chmod(0o600)
    env = Path('/private/tmp/mukhtalif-learning-api-env.json')
    env.write_text(json.dumps({"APP_ENV": "development", "ALLOW_DEV_AUTH": "true", "CORS_ALLOWED_ORIGINS": "http://127.0.0.1:3100,http://localhost:3100,http://127.0.0.1:3101,http://localhost:3101,http://127.0.0.1:3102", "LEARNING_URL": "http://127.0.0.1:18000", "LEARNING_API_KEY": key, "LEARNING_API_SECRET": secret, "LEARNING_SIMULATION_ENABLED": "true"})); env.chmod(0o600)
    return "Local test bridge configured; credentials stored privately."


def run():
    guard()
    frappe.set_user(frappe.conf.mukhtalif_bridge_user)
    actor = {"id": "dev:usr-listener-1", "name": "متعلم تجريبي", "admin": False}
    admin = {"id": "dev:usr-admin", "name": "مدير تجريبي", "admin": True}
    course_id = "learning-smoke-" + frappe.generate_hash(length=8)
    definition = {"id": course_id, "title": "مختبر التعلّم: مهارات التخطيط", "description": "دورة محلية لاختبار التسجيل والدروس والتقييم، وليست محتوى للبيع.", "category": "المهارات المهنية", "skill": "التخطيط", "level": "مبتدئ", "instructor": "فريق مختلف", "price": 99, "published": True, "resources": [], "lessons": [{"id": "lesson-one", "title": "تحديد هدفك", "body": "اكتب هدفًا واضحًا، وحدد موعدًا لإنجازه. ثم اختر خطوة عملية تبدأ بها اليوم.", "video": "", "durationSeconds": 0, "resources": []}], "quiz": {"id": "final-quiz", "title": "اختبر فهمك", "passPercent": 70, "maxAttempts": 2, "questions": [{"id": "question-one", "prompt": "أي هدف أوضح؟", "options": ["سأتطور يومًا ما", "سأكتب خطة الأسبوع اليوم"], "correct": 1}]}, "assignment": {"id": "course-worksheet", "title": "خطة أسبوعك", "instructions": "اكتب هدفًا وخطوة عملية وموعدًا.", "required": True, "file": ""}}
    def call(action, payload=None, who=actor, expected=None):
        result = api.dispatch(action, payload or {}, who)
        if expected:
            assert result.get("status") == expected, result
        else:
            assert "data" in result, result
            frappe.db.commit()
            return result["data"]
    call("studio.save", definition, admin)
    call("studio.detail", {"courseId": course_id}, actor, 403)
    call("workspace", {"courseId": course_id}, actor, 403)
    call("checkout", {"courseId": course_id, "mode": "simulation", "outcome": "declined"}, actor, 409)
    call("workspace", {"courseId": course_id}, actor, 403)
    enrolled = call("checkout", {"courseId": course_id, "mode": "simulation", "outcome": "success"})
    repeat = call("checkout", {"courseId": course_id, "mode": "simulation", "outcome": "success"})
    assert repeat["order"]["id"] == enrolled["order"]["id"]
    workspace = call("workspace", {"courseId": course_id})
    assert "correct" not in workspace["course"]["quiz"]["questions"][0]
    call("workspace", {"courseId": course_id}, {"id": "other", "admin": False}, 403)
    call("certificate", {"courseId": course_id}, actor, 422)
    call("progress", {"courseId": course_id, "lessonId": "lesson-one", "position": 0, "read": True})
    failed = call("quiz", {"courseId": course_id, "quizId": "final-quiz", "answers": {"question-one": 0}})
    assert not failed["quizzes"]["final-quiz"]["passed"]
    passed = call("quiz", {"courseId": course_id, "quizId": "final-quiz", "answers": {"question-one": 1}})
    assert passed["quizzes"]["final-quiz"]["passed"]
    call("quiz", {"courseId": course_id, "quizId": "final-quiz", "answers": {"question-one": 1}}, actor, 422)
    submitted = call("assignment", {"courseId": course_id, "assignmentId": "course-worksheet", "answer": "سأكتب خطة الأسبوع اليوم."})
    call("certificate", {"courseId": course_id}, actor, 422)
    call("studio.grade", {"courseId": course_id, "submissionId": submitted["assignments"]["course-worksheet"]["id"], "status": "Pass", "comments": "هدف واضح."}, admin)
    issued = call("certificate", {"courseId": course_id})
    assert issued["certificate"]["id"]
    assert call("certificate", {"courseId": course_id})["certificate"]["id"] == issued["certificate"]["id"]
    assert frappe.db.count("LMS Enrollment", {"course": course_id}) == 1
    assert frappe.db.count("LMS Quiz Submission", {"course": course_id}) == 2
    assert frappe.db.count("LMS Certificate", {"course": course_id}) == 1
    return {"passed": True, "courseId": course_id, "checks": 18}


def run_media():
    import base64
    from unittest.mock import patch
    guard()
    frappe.set_user(frappe.conf.mukhtalif_bridge_user)
    actor = {"id": "dev:usr-listener-2", "name": "متعلم الوسائط", "admin": False}
    admin = {"id": "dev:usr-admin-1", "admin": True}
    def call(action, payload, who=actor):
        result = api.dispatch(action, payload, who)
        assert 'data' in result, result
        frappe.db.commit()
        return result['data']
    course_id = 'learning-media-' + frappe.generate_hash(length=8)
    definition = {"id": course_id, "title": "تجربة المشغّل وحفظ التقدم", "description": "دورة اختبار محلية. الفيديو مخصص للتحقق من المشاهدة والاستئناف.", "category": "التجربة", "skill": "التعلّم", "level": "مبتدئ", "instructor": "فريق مختلف", "price": 49, "published": False, "resources": [], "lessons": []}
    call('studio.save', definition, admin)
    content = Path('/private/tmp/mukhtalif-learning-test.mp4').read_bytes()
    session = call('studio.upload-start', {'courseId': course_id, 'filename': 'test.mp4', 'size': len(content)}, admin)
    for offset in range(0, len(content), session['chunkSize']):
        payload = {'courseId': course_id, 'token': session['token'], 'offset': offset, 'content': base64.b64encode(content[offset:offset+session['chunkSize']]).decode()}
        first = call('studio.upload-chunk', payload, admin)
        repeat = call('studio.upload-chunk', payload, admin)
        assert first == repeat
    uploaded = call('studio.upload-finish', {'courseId': course_id, 'token': session['token']}, admin)
    assert call('studio.upload-finish', {'courseId': course_id, 'token': session['token']}, admin) == uploaded
    definition.update(published=True, lessons=[{'id': 'video-one', 'title': 'فيديو تجريبي', 'body': 'اختبار حفظ موضع المشاهدة.', 'video': uploaded['file'], 'durationSeconds': 12, 'resources': []}, {'id': 'read-two', 'title': 'مراجعة ما تعلمته', 'body': 'هذا درس نصي مستقل.', 'video': '', 'durationSeconds': 0, 'resources': []}])
    call('studio.save', definition, admin)
    call('checkout', {'courseId': course_id, 'mode': 'simulation', 'outcome': 'success'})
    initial = call('progress', {'courseId': course_id, 'lessonId': 'video-one', 'position': 12, 'read': True})
    assert not initial['progress']['video-one']['complete']
    assert initial['progress']['video-one']['watched'] == 0
    doc, state = api.enrollment(course_id, api.member_id(actor))
    future = state['_reported']['video-one'] + 13
    with patch('mukhtalif_learning.api.time.time', return_value=future):
        final = call('progress', {'courseId': course_id, 'lessonId': 'video-one', 'position': 12, 'start': 0, 'end': 12})
    assert final['progress']['video-one']['complete']
    assert final['progress']['video-one']['watched'] == 12
    assert call('workspace', {'courseId': course_id})['enrollment']['lastLesson'] == 'video-one'
    return {'passed': True, 'courseId': course_id, 'checks': 8}
