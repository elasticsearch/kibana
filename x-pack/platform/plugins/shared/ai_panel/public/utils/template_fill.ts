/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import DOMPurify from 'dompurify';
import { Liquid } from 'liquidjs';
import { columnNamesToKeys } from '../../common/utils';

export const TEMPLATE_SENTINEL = '<!--ai-template-->';

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`;

// Single shared engine — stateless, safe to reuse across renders.
// dynamicPartials: false disables {% include %} / {% render %} tags which in the
// browser bundle would otherwise fire synchronous XHR requests.
// outputEscape: 'escape' HTML-escapes all {{ variable }} output, providing defense-in-depth
// against data-injected HTML before DOMPurify runs.
const liquid = new Liquid({
  strictFilters: false,
  strictVariables: false,
  dynamicPartials: false,
  outputEscape: 'escape',
});

export function injectCsp(html: string): string {
  if (html.includes(CSP_META)) return html;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch?.index !== undefined) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + CSP_META + html.slice(at);
  }
  return CSP_META + html;
}

// Sanitizes HTML and injects the CSP meta tag — the two steps always go together
// before an HTML string is set as iframe srcDoc. Also strips markdown fences in
// case the LLM wraps its output in ```html...```.
export function prepareHtml(html: string): string {
  return injectCsp(sanitizeHtml(stripMarkdownFences(html)));
}

// Strips <a> anchor tags and other unsafe elements before the HTML reaches the iframe.
// Applied after Liquid rendering so injected data values are also covered.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['a'],
    WHOLE_DOCUMENT: true,
    FORCE_BODY: false,
  }) as string;
}

export function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  // Strip leading and trailing fences (the common wrapping case)
  s = s.replace(/^```(?:html|HTML)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  // Strip any residual fence markers embedded inside the HTML (e.g. inside <body>)
  s = s.replace(/```(?:html|HTML)?/g, '').replace(/```/g, '');
  return s.trim();
}

export function sanitizeTemplate(raw: string): string {
  let s = stripMarkdownFences(raw);
  const idx = s.indexOf(TEMPLATE_SENTINEL);
  if (idx > 0) {
    s = s.slice(idx);
  } else if (idx === -1) {
    s = TEMPLATE_SENTINEL + '\n' + s;
  }
  return s;
}

export function isValidTemplate(template: string): boolean {
  return /<[a-zA-Z]/.test(template);
}

export interface TemplateColumn {
  name: string;
  type: string;
}

export function fillTemplate(
  template: string,
  columns: TemplateColumn[],
  rows: unknown[][]
): string {
  let tpl = template.trimStart();
  if (tpl.startsWith(TEMPLATE_SENTINEL)) {
    tpl = tpl.slice(TEMPLATE_SENTINEL.length);
  }

  const keys = columnNamesToKeys(columns.map((c) => c.name));

  // Pre-compute column max values for _pct variants
  const maxValues: Record<string, number> = {};
  columns.forEach((_col, i) => {
    const nums = rows.map((r) => Number(r[i])).filter((v) => isFinite(v));
    if (nums.length > 0) maxValues[keys[i]] = nums.reduce((a, b) => (b > a ? b : a), -Infinity);
  });

  // Each row becomes a plain object: { col_name: value, col_name_pct: 0–100 }
  const rowObjects = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((_col, i) => {
      const key = keys[i];
      obj[key] = row[i];
      const max = maxValues[key];
      if (max !== undefined) {
        const num = Number(row[i]);
        obj[`${key}_pct`] =
          max === 0
            ? 0
            : isFinite(num)
            ? Math.min(100, Math.max(0, Math.round((num / max) * 100)))
            : 0;
      }
    });
    return obj;
  });

  let rendered: string;
  try {
    rendered = liquid.parseAndRenderSync(tpl, { rows: rowObjects, max: maxValues });
  } catch {
    rendered =
      '<p style="color:#d36086;padding:16px">Template error — please edit the prompt to regenerate.</p>';
  }

  return prepareHtml(rendered);
}
