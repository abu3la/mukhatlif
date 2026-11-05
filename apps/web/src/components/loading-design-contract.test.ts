import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.tsx') && !file.includes('.test.') ? [file] : [];
  });
}

it('never presents a waiting button label without a visual loading indicator', () => {
  const violations: string[] = [];
  for (const file of sourceFiles('src/components')) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'button') {
        const text = node.getText(source);
        if (/جار[ٍي ]/.test(text) && !/spinner|Spinner|loading-indicator/.test(text)) {
          violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations, 'Use BusyButton or an explicit visual loading indicator').toEqual([]);
});
