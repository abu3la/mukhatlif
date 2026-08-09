import { color } from './color';
import { fontFamily } from './typography';
import { fontSize, fontWeight, radius, space } from './scale';

/**
 * Serializes the tokens as `--mk-*` custom-property declarations.
 * Platform-neutral: returns a string, touches no DOM.
 */
export function cssVariables(): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(color)) {
    lines.push(`--mk-color-${kebab(key)}: ${value};`);
  }
  for (const [key, value] of Object.entries(space)) {
    lines.push(`--mk-space-${key}: ${value}px;`);
  }
  for (const [key, value] of Object.entries(radius)) {
    lines.push(`--mk-radius-${key}: ${value}px;`);
  }
  for (const [key, value] of Object.entries(fontSize)) {
    lines.push(`--mk-text-${key}: ${value}px;`);
  }
  for (const [key, value] of Object.entries(fontWeight)) {
    lines.push(`--mk-weight-${key}: ${value};`);
  }
  lines.push(`--mk-font-sans: ${fontFamily.sans};`);
  return lines.join('\n');
}

function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
