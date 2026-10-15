/** Local acceptance harness: actual Hono routes + PostgreSQL, fixture identities/storage. */
import { serve } from '../../apps/api/node_modules/@hono/node-server/dist/index.mjs';
import { Hono } from '../../apps/api/node_modules/hono/dist/index.js';
import { cors } from '../../apps/api/node_modules/hono/dist/middleware/cors/index.js';
import { resolveUser, type AppEnv } from '../../apps/api/src/auth';
import {
  publicCoursesRoute,
  customerCoursesRoute,
  studioCoursesRoute,
} from '../../apps/api/src/routes/courses';
import { definition } from '../../apps/api/src/learning/domain';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { startDatabase } from './postgrest.mjs';
const { db } = await startDatabase();
const mediaDir = '/private/tmp/mukhtalif-native-learning-media';
mkdirSync(mediaDir, { recursive: true });
const localPath = (key: string) => mediaDir + '/' + Buffer.from(key).toString('hex');
const uploads = new Map<string, { key: string; parts: Map<number, ArrayBuffer> }>();
const media = {
  async head(key: string) {
    const p = localPath(key);
    return existsSync(p) ? { size: readFileSync(p).length, httpEtag: 'local' } : null;
  },
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const p = localPath(key);
    if (!existsSync(p)) return null;
    let bytes = readFileSync(p);
    const size = bytes.length;
    if (options?.range)
      bytes = bytes.subarray(options.range.offset, options.range.offset + options.range.length);
    return { size, httpEtag: 'local', body: new Response(bytes).body! };
  },
  async put(key: string, value: ArrayBuffer) {
    writeFileSync(localPath(key), Buffer.from(value));
    return this.head(key);
  },
  async delete() {
    throw Error('No deletes in preview');
  },
  async createMultipartUpload(key: string) {
    const id = crypto.randomUUID();
    uploads.set(id, { key, parts: new Map() });
    return this.resumeMultipartUpload(key, id);
  },
  resumeMultipartUpload(key: string, id: string) {
    return {
      key,
      uploadId: id,
      async uploadPart(n: number, value: ArrayBuffer) {
        uploads.get(id)!.parts.set(n, value);
        return { partNumber: n, etag: String(n) };
      },
      async complete(parts: { partNumber: number; etag: string }[]) {
        const upload = uploads.get(id)!;
        const b = Buffer.concat(parts.map((p) => Buffer.from(upload.parts.get(p.partNumber)!)));
        writeFileSync(localPath(key), b);
        uploads.delete(id);
        return { size: b.length, httpEtag: 'local' };
      },
      async abort() {
        uploads.delete(id);
      },
    };
  },
};
const courseId = 'learning-native-preview';
if (!(await db.query('select id from learning_courses where id=$1', [courseId])).rows.length) {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'تعلّم بخطوات واضحة' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'وصف منسّق بمحرر البلوق نفسه. يمكنك إضافة العناوين والقوائم والروابط.',
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'حدّد هدفك قبل البدء.' }] },
            ],
          },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'تابع تقدمك من حسابك.' }] },
            ],
          },
        ],
      },
    ],
  };
  const course = definition({
    id: courseId,
    title: 'مختبر الدورات على API مختلف',
    description: 'تجربة محلية للنظام الجديد دون اعتماد خارجي.',
    overviewDocument: doc,
    overview: '',
    audience: 'لمن يريد تجربة التعلم وإدارة الدورات.',
    category: 'مهارات',
    skill: 'التخطيط',
    level: 'مبتدئ',
    instructor: 'مختلف',
    price: 150,
    published: true,
    resources: [],
    lessons: [
      {
        id: 'reading',
        title: 'بداية التخطيط',
        body: '',
        bodyDocument: doc,
        video: '',
        durationSeconds: 0,
        resources: [],
      },
      {
        id: 'practice',
        title: 'تطبيق ما تعلّمته',
        body: 'اختر هدفًا واحدًا، ثم حدّد أول خطوة لتنفيذه.',
        video: '',
        durationSeconds: 0,
        resources: [],
        quiz: {
          id: 'quiz',
          title: 'اختبر فهمك',
          passPercent: 100,
          maxAttempts: 3,
          questions: [
            {
              id: 'q',
              prompt: 'ما أول خطوة؟',
              options: ['تحديد الهدف', 'تأجيل البداية'],
              correct: 0,
            },
          ],
        },
        assignment: {
          id: 'work',
          title: 'خطتك الأولى',
          instructions: 'اكتب هدفك وأول خطوة.',
          required: true,
          file: '',
        },
      },
    ],
  });
  await db.query('select learning_save_course($1::jsonb)', [JSON.stringify(course)]);
}
const api = new Hono<AppEnv>();
api.use(
  '*',
  cors({
    origin: ['http://127.0.0.1:3101', 'http://127.0.0.1:3102'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-User', 'X-Client-Surface'],
  }),
);
api.use('*', async (c, next) =>
  resolveUser(c, async () => {
    const id = c.get('authUserId');
    if (id)
      c.set(
        'authUserId',
        `00000000-0000-4000-8000-00000000000${id.endsWith('usr-listener-1') ? '1' : id.endsWith('usr-listener-2') ? '2' : '3'}`,
      );
    Object.assign(c.env, {
      SUPABASE_URL: 'http://127.0.0.1:18788',
      MEDIA_PUBLIC_ORIGIN: 'http://127.0.0.1:18787',
      SUPABASE_SERVICE_ROLE_KEY: 'local-test-key',
      MEDIA: media,
    });
    await next();
  }),
);
api.route('/courses', publicCoursesRoute);
api.route('/app/courses', customerCoursesRoute);
api.route('/studio/courses', studioCoursesRoute);
serve({
  hostname: '127.0.0.1',
  port: 18787,
  fetch: (r) =>
    api.fetch(r, {
      APP_ENV: 'development',
      ALLOW_DEV_AUTH: 'true',
      LEARNING_SIMULATION_ENABLED: 'true',
    }),
});
console.log(
  'Native learning preview: PostgreSQL + shared Hono routes, fixture identities and local media.',
);
