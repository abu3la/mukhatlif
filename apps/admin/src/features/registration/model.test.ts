import { describe, it, expect } from 'vitest';
import { newForm, responsesCsv } from './model';
describe('registration template and export', () => {
  it('starts workshops as drafts without publishing the historical date', () => {
    const f = newForm(true);
    expect(f.status).toBe('draft');
    expect(f.fields).toHaveLength(9);
    expect(f.description).not.toContain('10/10');
    expect(new Set(f.fields.map((f) => f.id)).size).toBe(9);
  });
  it('escapes CSV quotes, formulas and preserves prior question versions', () => {
    const f = newForm();
    const csv = responsesCsv([
      {
        id: 'r',
        form_id: f.id,
        created_at: '2026-11-04',
        fields: f.fields,
        answers: { [f.fields[0].id]: '=1+1' },
      },
      {
        id: 's',
        form_id: f.id,
        created_at: '2026-11-04',
        fields: [{ ...f.fields[0], id: 'old', label: 'Old' }],
        answers: { old: 'a,"b"' },
      },
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('a,""b""');
    expect(csv).toContain('Old');
  });
});
