import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
const { fetch } = globalThis;
/** Repeatable local-only HTTP acceptance. Optional argument: a small MP4 fixture. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = 'http://127.0.0.1:18787';
async function req(path, body, user = 'usr-listener-1', surface = 'web') {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-User': user,
      'X-Client-Surface': surface,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  return { status: r.status, data };
}
const admin = (path, body) => req('/studio/courses' + path, body, 'usr-admin-1', 'studio');
const id = 'native-smoke-' + Date.now();
const course = {
  id,
  title: 'اختبار API مختلف',
  description: 'تجربة',
  overview: '',
  category: '',
  skill: '',
  level: 'مبتدئ',
  instructor: 'مختلف',
  price: 149,
  published: true,
  resources: [],
  lessons: [
    {
      id: 'reading',
      title: 'درس القراءة',
      body: 'نص',
      video: '',
      durationSeconds: 0,
      resources: [],
      quiz: {
        id: 'quiz',
        title: 'اختبار',
        maxAttempts: 2,
        passPercent: 100,
        questions: [{ id: 'q', prompt: 'صحيح؟', options: ['نعم', 'لا'], correct: 0 }],
      },
      assignment: { id: 'work', title: 'ورقة عمل', instructions: 'اكتب', required: true, file: '' },
    },
  ],
};
let r = await admin('', course);
assert.equal(r.status, 200, JSON.stringify(r));
const document = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'عنوان منسق' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'نص عريض', marks: [{ type: 'bold' }] }] },
  ],
};
course.descriptionDocument = document;
course.lessons[0].bodyDocument = document;
r = await admin('', course);
assert.equal(r.status, 200);
assert.deepEqual(r.data.lessons[0].bodyDocument, document);
r = await req('/courses/' + id);
assert.equal(r.status, 200);
assert.ok(r.data.descriptionHtml.includes('<strong>'));
assert.equal(r.data.lessons[0].body, undefined);
r = await req('/app/courses/' + id);
assert.equal(r.status, 403);
r = await req('/app/courses/' + id + '/checkout', { mode: 'simulation', outcome: 'declined' });
assert.equal(r.status, 409);
r = await req('/app/courses/' + id + '/checkout', { mode: 'simulation', outcome: 'success' });
assert.equal(r.status, 200);
assert.equal(r.data.order.amount, 149);
const order = r.data.order.id;
r = await req('/app/courses/' + id + '/checkout', { mode: 'simulation', outcome: 'success' });
assert.equal(r.data.order.id, order);
r = await req('/app/courses/' + id);
assert.ok(r.data.course.lessons[0].bodyHtml.includes('<h2>'));
assert.equal(r.data.course.lessons[0].quiz.questions[0].correct, undefined);
r = await req('/app/courses/' + id + '/certificate', {});
assert.equal(r.status, 422);
r = await req('/app/courses/' + id + '/quiz', { quizId: 'quiz', answers: { q: 0 } });
assert.equal(r.status, 422);
r = await req('/app/courses/' + id + '/progress', {
  lessonId: 'reading',
  position: 0,
  readPercent: 100,
});
assert.equal(r.status, 200);
r = await req('/app/courses/' + id + '/quiz', { quizId: 'quiz', answers: { q: 0 } });
assert.equal(r.status, 200);
assert.equal(r.data.quizzes.quiz.passed, true);
r = await req('/app/courses/' + id + '/assignment', { assignmentId: 'work', answer: 'تطبيقي' });
assert.equal(r.status, 200);
const submissionId = r.data.assignments.work.id;
r = await req('/app/courses/' + id + '/certificate', {});
assert.equal(r.status, 422);
r = await admin('/' + id + '/grade', { submissionId, status: 'Pass', comments: 'أحسنت' });
assert.equal(r.status, 200);
r = await req('/app/courses/' + id + '/certificate', {});
assert.equal(r.status, 200);
assert.ok(r.data.certificate.id);
r = await req('/app/courses/' + id, undefined, 'usr-listener-2');
assert.equal(r.status, 403);
r = await req('/app/courses');
assert.ok(r.data.some((x) => x.course.id === id));
// Exercise private multipart storage and byte ranges using the same adapter contract.
const mediaId = id + '-media';
course.id = mediaId;
course.lessons[0].quiz = undefined;
course.lessons[0].assignment = undefined;
r = await admin('', course);
assert.equal(r.status, 200);
if (!process.argv[2]) {
  console.log(
    JSON.stringify({ passed: true, course: id, mediaChecks: 'skipped: supply an MP4 fixture' }),
  );
  process.exit(0);
}
const bytes = readFileSync(process.argv[2]);
r = await admin('/' + mediaId + '/upload-start', { filename: 'lesson.mp4', size: bytes.length });
assert.equal(r.status, 200);
const token = r.data.token;
for (let offset = 0; offset < bytes.length; offset += r.data.chunkSize || 5 * 1024 * 1024) {
  const part = await admin('/' + mediaId + '/upload-chunk', {
    token,
    offset,
    content: bytes.subarray(offset, offset + 5 * 1024 * 1024).toString('base64'),
  });
  assert.equal(part.status, 200);
}
r = await admin('/' + mediaId + '/upload-finish', { token });
assert.equal(r.status, 200);
course.trailer = r.data.file;
r = await admin('', course);
assert.equal(r.status, 200);
r = await req('/courses/' + mediaId + '/trailer');
assert.equal(r.status, 200);
const media = await fetch(r.data.url, { headers: { Range: 'bytes=0-99' } });
assert.equal(media.status, 206);
assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes.subarray(0, 100));
r = await req('/app/courses/' + mediaId + '/asset', { file: course.trailer });
assert.equal(r.status, 403);
await req('/app/courses/' + mediaId + '/checkout', { mode: 'simulation', outcome: 'success' });
r = await req('/app/courses/' + mediaId + '/asset', { file: '/private/files/not-owned.mp4' });
assert.equal(r.status, 404);
r = await req('/app/courses/' + mediaId + '/asset', { file: course.trailer });
assert.equal(r.status, 200);
const privateUrl = r.data.url;
let file = await fetch(privateUrl, { headers: { Range: 'bytes=-16' } });
assert.equal(file.status, 206);
assert.equal(Number(file.headers.get('content-length')), 16);
assert.equal(file.headers.get('cache-control'), 'private, no-store');
file = await fetch(privateUrl, { headers: { Range: 'bytes=999999999-' } });
assert.equal(file.status, 416);
await admin('', { ...course, published: false });
file = await fetch(privateUrl);
assert.equal(file.status, 404);
await admin('', course);
console.log(
  JSON.stringify({ passed: true, course: id, mediaCourse: mediaId, mediaChecks: 'passed' }),
);
