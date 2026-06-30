/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Strip HTML tags and decode the small set of named entities that show up
 * routinely in RSS / vendor JSON descriptions.
 *
 * RSS feeds embed HTML in `<description>` and `<content:encoded>`. A
 * full HTML parse is overkill — we only need plain text for
 * `content.body_text`, which feeds inference (`semantic_text`) and the
 * BM25 sibling field. The downstream `nl_extraction_behavioral`
 * workflow re-runs IOC regex extraction on `body_text` and does not
 * benefit from intact markup.
 *
 * The original HTML is preserved as `content.body_html` (mapped
 * `index: false`) so the dashboard / digest can render the formatted
 * version when the operator clicks through.
 */
export const stripHtml = (html: string | undefined | null): string => {
  if (!html) return '';
  // Drop the most expensive substrings up front (script/style bodies)
  // before falling through to the generic tag stripper.
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(withoutTags);
  return collapseWhitespace(decoded);
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '\u00a9',
  reg: '\u00ae',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

const decodeEntities = (input: string): string =>
  input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const replacement = NAMED_ENTITIES[entity];
    return replacement !== undefined ? replacement : match;
  });

/**
 * Collapse runs of whitespace (including unicode line separators) and
 * trim. A naive `\s+` would leave the leading/trailing whitespace that
 * `<description><![CDATA[ ... ]]></description>` introduces.
 */
export const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

/**
 * Truncate to a max length, keeping a sensible word boundary if one
 * lands close to the cap. Used to keep `content.title` short enough that
 * the dashboard list view doesn't have to wrap (titles are
 * `semantic_text` so longer-than-needed strings also waste tokens at
 * inference time).
 */
export const truncate = (input: string, maxLength: number): string => {
  if (input.length <= maxLength) return input;
  const slice = input.slice(0, maxLength);
  const lastBoundary = slice.lastIndexOf(' ');
  // Only honor the boundary if it's reasonably close to the cap — otherwise
  // a title like "x ".repeat(N) + "very long word" would shrink to two
  // characters.
  if (lastBoundary > maxLength * 0.6) return `${slice.slice(0, lastBoundary).trimEnd()}\u2026`;
  return `${slice.trimEnd()}\u2026`;
};

/**
 * Convert HTML to a structured text form that preserves block boundaries,
 * table rows, headers, and lists so that IOC extraction can see table-cell
 * values as recoverable tokens rather than a collapsed space-run.
 *
 * TRANSIENT — the result is used only inside `extract_iocs`; it is never
 * stored, indexed, or emitted to any search field. `body_text` storage and
 * `stripHtml` are UNCHANGED.
 *
 * Transformations:
 *   <script>/<style>          → stripped (mirrors stripHtml pre-pass)
 *   <h1>–<h6>                 → ## heading text
 *   <tr> with <td>/<th> cells → | cell1 | cell2 | pipe-delimited row
 *   <li>                      → - item text
 *   block elements (p, div, br, …) → newline boundary
 *   inline tags               → removed; content kept
 *   HTML entities             → decoded (reuses decodeEntities)
 */
export const htmlToStructured = (html: string | undefined | null): string => {
  if (!html) return '';

  // 1. Drop script/style bodies (same pre-pass as stripHtml).
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // 2. Headings → "## text\n"
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, ' ').trim();
    return text ? `\n## ${collapseWhitespace(text)}\n` : '';
  });

  // 3. Table rows → "| cell | cell |\n"
  // Process each <tr> independently; extract <td>/<th> cell content.
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_m, inner: string) => {
    const cellTexts: string[] = [];
    const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(inner)) !== null) {
      const cellContent = cellMatch[1].replace(/<[^>]+>/g, ' ').trim();
      cellTexts.push(collapseWhitespace(cellContent));
    }
    return cellTexts.length > 0 ? `\n| ${cellTexts.join(' | ')} |\n` : '\n';
  });

  // 4. List items → "- text\n"
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, ' ').trim();
    return text ? `\n- ${collapseWhitespace(text)}\n` : '';
  });

  // 5. Block-level elements → newline boundary (br, p, div, section, article, …)
  s = s.replace(/<\/?(p|div|section|article|aside|header|footer|main|figure|blockquote|pre|ul|ol|table|thead|tbody|tfoot)[^>]*>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');

  // 6a. Lift <a href="URL"> hrefs into plain text so IOC URLs are extractable.
  //     Produces "anchortext URL" — the URL appears as a bare token the regex
  //     patterns can match. No markdown [label](url) syntax is emitted.
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, ' ').trim();
    return `${text} ${href} `;
  });

  // 6b. Strip remaining tags (inline and any leftovers).
  s = s.replace(/<[^>]+>/g, '');

  // 7. Decode HTML entities.
  s = decodeEntities(s);

  // 8. Normalise runs within each line (collapse intra-line spaces) but
  //    preserve the newlines that carry structural meaning.
  const lines = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n');
};

/** `content` block written by every ingest path (adapters + manual ingest). */
export interface ReportContentDocument {
  title: string;
  body_text: string;
  body_html?: string;
  language: string;
}

/**
 * Build the `content` object for a threat report. The `content.title_bm25` /
 * `content.body_text_bm25` siblings are populated by Elasticsearch `copy_to`
 * on index (see `setup/index_templates.ts`) so ingest paths stay aligned with
 * the strict mapping and `normalizedReportSchema`.
 */
export const buildReportContent = ({
  title,
  bodyText,
  bodyHtml,
  language = 'en',
}: {
  title: string;
  bodyText: string;
  bodyHtml?: string;
  language?: string;
}): ReportContentDocument => ({
  title,
  body_text: bodyText,
  ...(bodyHtml !== undefined ? { body_html: bodyHtml } : {}),
  language,
});
