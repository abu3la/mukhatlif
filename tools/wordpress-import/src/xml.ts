export interface XmlElement {
  attributes: Record<string, string>;
  inner: string;
  raw: string;
}

function isNameBoundary(value: string | undefined): boolean {
  return value === undefined || value === '>' || value === '/' || /\s/.test(value);
}

function findTagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return -1;
}

function findOpeningTag(xml: string, name: string, from: number): number {
  const needle = `<${name}`;
  let cursor = from;
  while (cursor < xml.length) {
    const index = xml.indexOf('<', cursor);
    if (index === -1) return -1;
    if (xml.startsWith('<![CDATA[', index)) {
      const end = xml.indexOf(']]>', index + 9);
      if (end === -1) return -1;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!--', index)) {
      const end = xml.indexOf('-->', index + 4);
      if (end === -1) return -1;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', index)) {
      const end = xml.indexOf('?>', index + 2);
      if (end === -1) return -1;
      cursor = end + 2;
      continue;
    }
    const end = findTagEnd(xml, index + 1);
    if (end === -1) return -1;
    if (xml.startsWith(needle, index) && isNameBoundary(xml[index + needle.length])) return index;
    cursor = end + 1;
  }
  return -1;
}

function parseAttributes(openingTag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const nameEnd = openingTag.search(/[\s/>]/);
  if (nameEnd === -1) return attributes;
  const source = openingTag.slice(nameEnd);
  const expression = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(expression)) {
    attributes[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function findMatchingClose(xml: string, name: string, contentStart: number): number {
  let depth = 1;
  let cursor = contentStart;
  const openingNeedle = `<${name}`;
  const closingNeedle = `</${name}`;

  while (cursor < xml.length) {
    const markup = xml.indexOf('<', cursor);
    if (markup === -1) return -1;

    if (xml.startsWith('<![CDATA[', markup)) {
      const end = xml.indexOf(']]>', markup + 9);
      if (end === -1) return -1;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!--', markup)) {
      const end = xml.indexOf('-->', markup + 4);
      if (end === -1) return -1;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', markup)) {
      const end = xml.indexOf('?>', markup + 2);
      if (end === -1) return -1;
      cursor = end + 2;
      continue;
    }

    const end = findTagEnd(xml, markup + 1);
    if (end === -1) return -1;
    if (
      xml.startsWith(closingNeedle, markup) &&
      isNameBoundary(xml[markup + closingNeedle.length])
    ) {
      depth -= 1;
      if (depth === 0) return markup;
    } else if (
      xml.startsWith(openingNeedle, markup) &&
      isNameBoundary(xml[markup + openingNeedle.length]) &&
      xml[end - 1] !== '/'
    ) {
      depth += 1;
    }
    cursor = end + 1;
  }
  return -1;
}

export function extractElements(xml: string, name: string): XmlElement[] {
  const elements: XmlElement[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const openStart = findOpeningTag(xml, name, cursor);
    if (openStart === -1) break;
    const openEnd = findTagEnd(xml, openStart + name.length + 1);
    if (openEnd === -1) throw new Error(`Malformed XML: unclosed <${name}> tag`);
    const openingTag = xml.slice(openStart + 1, openEnd);
    if (openingTag.trimEnd().endsWith('/')) {
      elements.push({
        attributes: parseAttributes(openingTag),
        inner: '',
        raw: xml.slice(openStart, openEnd + 1),
      });
      cursor = openEnd + 1;
      continue;
    }

    const closeStart = findMatchingClose(xml, name, openEnd + 1);
    if (closeStart === -1) throw new Error(`Malformed XML: missing </${name}> tag`);
    const closeEnd = findTagEnd(xml, closeStart + name.length + 2);
    if (closeEnd === -1) throw new Error(`Malformed XML: unclosed </${name}> tag`);
    elements.push({
      attributes: parseAttributes(openingTag),
      inner: xml.slice(openEnd + 1, closeStart),
      raw: xml.slice(openStart, closeEnd + 1),
    });
    cursor = closeEnd + 1;
  }
  return elements;
}

export function firstElement(xml: string, name: string): XmlElement | null {
  return extractElements(xml, name)[0] ?? null;
}

export function extractStartTags(xml: string, name: string): XmlElement[] {
  const elements: XmlElement[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const openStart = findOpeningTag(xml, name, cursor);
    if (openStart === -1) break;
    const openEnd = findTagEnd(xml, openStart + name.length + 1);
    if (openEnd === -1) throw new Error(`Malformed XML: unclosed <${name}> tag`);
    const openingTag = xml.slice(openStart + 1, openEnd);
    elements.push({
      attributes: parseAttributes(openingTag),
      inner: '',
      raw: xml.slice(openStart, openEnd + 1),
    });
    cursor = openEnd + 1;
  }
  return elements;
}

export function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      if (entity === '&amp;') return '&';
      if (entity === '&lt;') return '<';
      if (entity === '&gt;') return '>';
      if (entity === '&quot;') return '"';
      return "'";
    },
  );
}

export function elementText(element: XmlElement | null): string {
  if (!element) return '';
  const source = element.inner;
  let result = '';
  let cursor = 0;
  while (cursor < source.length) {
    const cdataStart = source.indexOf('<![CDATA[', cursor);
    if (cdataStart === -1) {
      result += decodeXmlEntities(source.slice(cursor));
      break;
    }
    result += decodeXmlEntities(source.slice(cursor, cdataStart));
    const cdataEnd = source.indexOf(']]>', cdataStart + 9);
    if (cdataEnd === -1) throw new Error('Malformed XML: unclosed CDATA section');
    result += source.slice(cdataStart + 9, cdataEnd);
    cursor = cdataEnd + 3;
  }
  return result;
}

export function firstText(xml: string, name: string): string {
  return elementText(firstElement(xml, name));
}
