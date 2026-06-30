/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildReportContent, collapseWhitespace, htmlToStructured, stripHtml, truncate } from './text';

describe('stripHtml', () => {
  it('returns an empty string for nullish input', () => {
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml('')).toBe('');
  });

  it('drops <script> and <style> bodies before tag stripping', () => {
    const html = `<p>before</p><script>alert("xss")</script><style>body{color:red}</style><p>after</p>`;
    const result = stripHtml(html);
    expect(result).toBe('before after');
  });

  it('decodes the named entities feeds use most often', () => {
    const html = '<p>&copy;&nbsp;Acme &mdash; &ldquo;hello&rdquo;</p>';
    expect(stripHtml(html)).toBe('\u00a9 Acme \u2014 \u201chello\u201d');
  });

  it('decodes numeric (decimal and hex) entities', () => {
    expect(stripHtml('&#65; &#x42;')).toBe('A B');
  });

  it('collapses whitespace runs introduced by tag-stripping', () => {
    expect(stripHtml('<p>a</p>\n<p>  b  </p>')).toBe('a b');
  });
});

describe('collapseWhitespace', () => {
  it('replaces runs of whitespace (including unicode separators) with a single space', () => {
    expect(collapseWhitespace('  hello\n\tworld\u2028!  ')).toBe('hello world !');
  });
});

describe('truncate', () => {
  it('returns the input unchanged when shorter than max', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('appends an ellipsis when truncated', () => {
    expect(truncate('a'.repeat(50), 10)).toBe('aaaaaaaaaa\u2026');
  });

  it('respects a word boundary close to the cap', () => {
    // The boundary heuristic only honors `lastIndexOf(' ')` when it
    // lands past 60% of the cap. For maxLength=12, the heuristic
    // requires a space at index >= 7.2; the trailing space at index 11
    // (after "hello world") qualifies, so we cut on that boundary.
    const input = 'hello world goodbye';
    expect(truncate(input, 12)).toBe('hello world\u2026');
  });

  it('falls back to a hard cut when the boundary is too far back', () => {
    // The "word" is the entire string, so there's no boundary close
    // to the cap. The hard cut wins.
    const input = 'noboundariesatallnoboundariesatall';
    expect(truncate(input, 5).startsWith('nobou')).toBe(true);
    expect(truncate(input, 5).endsWith('\u2026')).toBe(true);
  });
});

describe('htmlToStructured', () => {
  it('returns empty string for nullish input', () => {
    expect(htmlToStructured(undefined)).toBe('');
    expect(htmlToStructured(null)).toBe('');
    expect(htmlToStructured('')).toBe('');
  });

  it('converts an IOC table so header labels and values appear on recoverable rows', () => {
    const html = `
      <table>
        <tr><th>Type</th><th>Indicator</th></tr>
        <tr><td>Domain</td><td>evil[.]com</td></tr>
        <tr><td>IP</td><td>192.0.2.1</td></tr>
      </table>
    `;
    const result = htmlToStructured(html);
    // Header row must survive as pipe-delimited
    expect(result).toContain('Type | Indicator');
    // Value rows must survive — domain and IP on recoverable lines
    expect(result).toContain('Domain | evil[.]com');
    expect(result).toContain('IP | 192.0.2.1');
    // Must NOT be collapsed into a single space-run (the stripHtml failure mode)
    expect(result).not.toMatch(/Type\s+Indicator\s+Domain\s+evil/);
  });

  it('converts headings to ## prefix', () => {
    const html = '<h2>Indicators of Compromise</h2><p>See table below.</p>';
    const result = htmlToStructured(html);
    expect(result).toContain('## Indicators of Compromise');
  });

  it('converts list items to - prefix', () => {
    const html = '<ul><li>evil.com</li><li>bad.net</li></ul>';
    const result = htmlToStructured(html);
    expect(result).toContain('- evil.com');
    expect(result).toContain('- bad.net');
  });

  it('emits anchor href URLs as plain text so they are extractable', () => {
    const html = '<p>See <a href="https://evil.com/payload">this link</a> for details.</p>';
    const result = htmlToStructured(html);
    expect(result).toContain('https://evil.com/payload');
  });

  it('strips script and style bodies', () => {
    const html = '<script>alert(1)</script><p>safe</p><style>body{}</style>';
    const result = htmlToStructured(html);
    expect(result).toContain('safe');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('body{}');
  });

  it('decodes HTML entities in structured output', () => {
    const html = '<p>server at 10[.]0[.]0[.]1 &mdash; evil&amp;co.com</p>';
    const result = htmlToStructured(html);
    expect(result).toContain('—'); // mdash decoded
    expect(result).toContain('evil&co.com'); // &amp; decoded
  });

  it('does not produce markdown link [label](url) syntax', () => {
    const html = '<a href="https://c2.evil.com/beacon">click here</a>';
    const result = htmlToStructured(html);
    expect(result).not.toMatch(/\[.*\]\(.*\)/);
    // href still present as plain text
    expect(result).toContain('https://c2.evil.com/beacon');
  });

  it('preserves multi-column IOC table structure for downstream regex extraction', () => {
    // Realistic vendor HTML snippet: Type/Indicator columns
    const html = `
      <table>
        <thead><tr><th>Indicator Type</th><th>Value</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>Domain</td><td>c2.attacker[.]top</td><td>Stage 2 C2</td></tr>
          <tr><td>IP Address</td><td>198.51.100[.]42</td><td>Pivot host</td></tr>
          <tr><td>Hash (MD5)</td><td>d41d8cd98f00b204e9800998ecf8427e</td><td>Loader</td></tr>
        </tbody>
      </table>
    `;
    const result = htmlToStructured(html);
    // Each row must be on its own line with | separators
    const lines = result.split('\n');
    const domainRow = lines.find((l) => l.includes('c2.attacker[.]top'));
    const ipRow = lines.find((l) => l.includes('198.51.100[.]42'));
    const hashRow = lines.find((l) => l.includes('d41d8cd98f00b204e9800998ecf8427e'));
    expect(domainRow).toBeDefined();
    expect(ipRow).toBeDefined();
    expect(hashRow).toBeDefined();
    // Values must not be merged onto a single line
    expect(domainRow).not.toContain('198.51.100');
    expect(ipRow).not.toContain('d41d8cd98f00b204e9800998ecf8427e');
  });
});

describe('buildReportContent', () => {
  it('builds the strict-mapping content block without bm25 siblings', () => {
    expect(
      buildReportContent({
        title: 'Ransomware uptick',
        bodyText: 'Campaign details',
        language: 'en',
      })
    ).toEqual({
      title: 'Ransomware uptick',
      body_text: 'Campaign details',
      language: 'en',
    });
    expect(
      buildReportContent({
        title: 'Advisory',
        bodyText: 'Details',
        bodyHtml: '<p>Details</p>',
      })
    ).toEqual({
      title: 'Advisory',
      body_text: 'Details',
      body_html: '<p>Details</p>',
      language: 'en',
    });
  });
});
