import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def setup():
    create_custom_fields({
        "LMS Course": [{"fieldname": "custom_mukhtalif_assets", "label": "Mukhtalif private assets", "fieldtype": "Long Text", "hidden": 1, "no_copy": 1}, {"fieldname": "custom_mukhtalif_definition", "label": "Mukhtalif definition", "fieldtype": "Long Text", "hidden": 1, "no_copy": 1}],
        "LMS Enrollment": [{"fieldname": "custom_mukhtalif_state", "label": "Mukhtalif learning state", "fieldtype": "Long Text", "hidden": 1, "no_copy": 1}],
    })

    if not frappe.db.exists("Print Format", "Mukhtalif Completion"):
        frappe.get_doc({"doctype": "Print Format", "name": "Mukhtalif Completion", "doc_type": "LMS Certificate", "custom_format": 1, "print_format_type": "Jinja", "html": """<section dir="rtl" style="font-family:sans-serif;text-align:center;padding:48px;color:#171a56;border:3px solid #171a56"><h1>مختلف</h1><h2>شهادة إكمال</h2><p>تشهد مختلف بأن</p><h2>{{ doc.member_name | e }}</h2><p>أكمل دورة</p><h2>{{ doc.course_title | e }}</h2><p>{{ doc.issue_date | e }}</p><small>رقم الشهادة: {{ doc.name | e }}</small></section>"""}).insert(ignore_permissions=True)
