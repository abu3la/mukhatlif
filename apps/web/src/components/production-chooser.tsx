'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Diamond } from '@/components/maze-drawing';

export interface BriefField {
  width: number;
  height: number;
  frameWidth: number;
  frameLeft: number;
  pitch: number;
  walls: string;
  routes: string[];
  formRows: readonly number[];
  buttonRow: number;
  right: number;
  font: number;
  buttonWidth: number;
}

type Form = readonly [name: string, text: string];

function Field({
  field,
  variant,
  forms,
  picked,
  pick,
  note,
}: {
  field: BriefField;
  variant: 'wide' | 'phone';
  forms: readonly Form[];
  picked: number;
  pick: (index: number, focus?: boolean) => void;
  note: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const viewBox = `0 0 ${field.width} ${field.height}`;
  const size = {
    '--field-w': field.width,
    '--field-h': field.height,
    '--frame-w': field.frameWidth,
    '--frame-left': field.frameLeft,
    '--pitch': field.pitch,
    '--form-size': field.font,
    '--form-right': field.frameWidth - field.right,
    '--button-row': field.buttonRow,
    '--button-w': field.buttonWidth,
  } as CSSProperties;
  // A radio group moves its choice with the arrow keys and keeps one stop in the tab order.
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowLeft'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowRight'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + forms.length) % forms.length;
    pick(next);
    buttons.current[next]?.focus();
  };
  const [name] = forms[picked];
  return (
    <div className={`brief-field brief-field--${variant}`} style={size}>
      <svg className="brief-field__walls" viewBox={viewBox} aria-hidden="true" focusable="false">
        <path d={field.walls} />
      </svg>
      <svg className="brief-field__route" viewBox={viewBox} aria-hidden="true" focusable="false">
        <path className="stage-route__trace" d={field.routes[picked]} />
        <path key={picked} className="stage-route__ink" d={field.routes[picked]} pathLength={1} />
      </svg>
      <div className="brief-field__frame">
        <div className="brief-forms" role="radiogroup" aria-label="اختر شكل الإنتاج">
          {forms.map(([formName, text], index) => (
            <button
              key={formName}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              className="brief-form"
              aria-checked={picked === index}
              tabIndex={picked === index ? 0 : -1}
              style={{ '--form-row': field.formRows[index] } as CSSProperties}
              onClick={() => pick(index)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="brief-form__name">
                {formName}
                <Diamond className="stage-hero__stop" />
              </span>
              <span className="brief-form__text">{text}</span>
            </button>
          ))}
        </div>
        <Link
          className="public-primary brief-go"
          href={'/prodservice?service=' + encodeURIComponent(name)}
          aria-label={`تابع إلى طلب ${name}`}
        >
          تابع إلى الطلب
        </Link>
      </div>
      <p className="brief-field__note">{note}</p>
    </div>
  );
}

/**
 * «الإنتاج» (D-24): choose a form, and its route draws through the maze to
 * the brief. The choice carries into the request form.
 */
export function ProductionChooser({
  wide,
  phone,
  forms,
  note,
}: {
  wide: BriefField;
  phone: BriefField;
  forms: readonly Form[];
  note: string;
}) {
  const [picked, setPicked] = useState(0);
  return (
    <section className="brief-stage" aria-labelledby="production-title">
      <div className="brief-stage__head">
        <h1 id="production-title" className="stage-statement">
          لفكرتك، شكل يستحقها.
        </h1>
        <p className="brief-stage__lede">حدد ما تحتاجه، وساعدنا على فهم ما تريد قوله.</p>
      </div>
      <Field
        field={wide}
        variant="wide"
        forms={forms}
        picked={picked}
        pick={setPicked}
        note={note}
      />
      <Field
        field={phone}
        variant="phone"
        forms={forms}
        picked={picked}
        pick={setPicked}
        note={note}
      />
    </section>
  );
}
