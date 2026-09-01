import {
  AI_ARTICLE_SKILL_CHATGPT_GUIDE_URL,
  AI_ARTICLE_SKILL_CLAUDE_GUIDE_URL,
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
} from './article-ai-skill';

export function ArticleAiSkillGuide() {
  return (
    <section
      className="article-publisher__ai-method article-ai-skill-guide"
      aria-labelledby="article-ai-skill-guide-title"
    >
      <div className="article-ai-skill-guide__lead">
        <div>
          <h3 id="article-ai-skill-guide-title">سكيل المقالات في محادثتك</h3>
          <p>
            يعمل مع <bdi dir="ltr">ChatGPT Desktop</bdi>&nbsp;و&nbsp;
            <bdi dir="ltr">Claude</bdi>، ويسألك سؤالًا واحدًا في كل مرة قبل تجهيز مسودة قابلة
            للاستيراد.
          </p>
        </div>
        <a
          className="button article-ai-skill-guide__download"
          href={AI_ARTICLE_SKILL_DOWNLOAD_URL}
          download={AI_ARTICLE_SKILL_FILENAME}
          type="application/zip"
        >
          تنزيل سكيل المقالات
        </a>
      </div>

      <p className="article-ai-skill-guide__note">
        لتثبيت السكيل، لا ترفق ملف <bdi dir="ltr">ZIP</bdi> في رسالة عادية. ثبّته مرة واحدة بالطريقة
        المناسبة لمنصتك.
      </p>

      <details className="article-ai-skill-guide__details">
        <summary
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const details = event.currentTarget.parentElement;
            if (details instanceof HTMLDetailsElement) details.open = !details.open;
          }}
        >
          طريقة التثبيت على <bdi dir="ltr">ChatGPT Desktop</bdi>&nbsp;و&nbsp;
          <bdi dir="ltr">Claude</bdi>
        </summary>
        <div className="article-ai-skill-guide__platforms">
          <section aria-labelledby="article-ai-skill-chatgpt-title">
            <h4 id="article-ai-skill-chatgpt-title">
              <bdi dir="ltr">ChatGPT Desktop</bdi>
            </h4>
            <ol>
              <li>نزّل ملف السكيل وفك ضغطه.</li>
              <li>
                ضع مجلد السكيل في هذا المسار. إن لم يظهر السكيل، أعد تشغيل التطبيق.
                <code className="article-ai-skill-guide__path" dir="ltr">
                  $HOME/.agents/skills/mukhtalif-article-writer
                </code>
              </li>
              <li>
                افتح <bdi dir="ltr">Skills</bdi> من الشريط الجانبي. في المحادثة، اكتب{' '}
                <code dir="ltr">@</code> واختر «محرر مختلف».
              </li>
            </ol>
            <a
              className="text-link article-ai-skill-guide__reference"
              href={AI_ARTICLE_SKILL_CHATGPT_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="دليل OpenAI، يفتح في تبويب جديد"
            >
              دليل OpenAI
            </a>
          </section>

          <section aria-labelledby="article-ai-skill-claude-title">
            <h4 id="article-ai-skill-claude-title">
              <bdi dir="ltr">Claude</bdi>
            </h4>
            <ol>
              <li>
                للحساب الفردي، فعّل <bdi dir="ltr">Code execution and file creation</bdi> من:
                <code className="article-ai-skill-guide__path" dir="ltr">
                  Settings &gt; Capabilities
                </code>
              </li>
              <li>
                في <bdi dir="ltr">Team</bdi>&nbsp;و&nbsp;<bdi dir="ltr">Enterprise</bdi>، يجب أن
                يفعّل مسؤول المؤسسة السكيلات من:
                <code className="article-ai-skill-guide__path" dir="ltr">
                  Organization settings &gt; Skills
                </code>
              </li>
              <li>
                افتح صفحة <bdi dir="ltr">Skills</bdi>، ثم اختر رفع سكيل.
                <code className="article-ai-skill-guide__path" dir="ltr">
                  Customize &gt; Skills &gt; + &gt; Create skill &gt; Upload a skill
                </code>
              </li>
              <li>ارفع ملف السكيل بصيغة ZIP كما هو، ثم فعّله من قائمة Skills.</li>
              <li>
                عند تشغيله، يعرض <bdi dir="ltr">Claude</bdi> كل سؤال عبر واجهة{' '}
                <bdi dir="ltr">Asking a question</bdi> الأصلية، سؤالًا واحدًا في كل مرة.
              </li>
            </ol>
            <a
              className="text-link article-ai-skill-guide__reference"
              href={AI_ARTICLE_SKILL_CLAUDE_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="دليل Claude، يفتح في تبويب جديد"
            >
              دليل Claude
            </a>
          </section>
        </div>
      </details>
    </section>
  );
}
