/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// DOMPurify requires a real DOM — pass-through in Jest (security is tested in the browser)
jest.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

import {
  fillTemplate,
  sanitizeTemplate,
  isValidTemplate,
  TEMPLATE_SENTINEL,
} from './template_fill';

const cols = [
  { name: 'category.keyword', type: 'keyword' },
  { name: 'total_revenue', type: 'double' },
];
const rows = [
  ['Clothing', 8000],
  ['Shoes', 3000],
  ['Accessories', 1000],
];

const wrap = (body: string) => `${TEMPLATE_SENTINEL}\n<html><body>${body}</body></html>`;

describe('fillTemplate', () => {
  describe('column name normalization', () => {
    it('maps dot-notation column names to underscored placeholders', () => {
      const tpl = wrap('{{ rows[0].category_keyword }}');
      expect(fillTemplate(tpl, cols, rows)).toContain('Clothing');
    });

    it('converts @-prefixed column names to at_ so they remain distinct', () => {
      // "@ts" → "at_ts", naturally distinct from a column named "ts"
      const tpl = wrap('{{ rows[0].at_ts }}');
      const result = fillTemplate(tpl, [{ name: '@ts', type: 'date' }], [['2024-01-01']]);
      expect(result).toContain('2024-01-01');
    });
  });

  describe('Liquid loops', () => {
    it('renders one element per row inside {% for %}', () => {
      const tpl = wrap('{% for row in rows %}<span>{{ row.category_keyword }}</span>{% endfor %}');
      const result = fillTemplate(tpl, cols, rows);
      expect(result).toContain('Clothing');
      expect(result).toContain('Shoes');
      expect(result).toContain('Accessories');
    });

    it('renders nothing for the loop when rows is empty', () => {
      const tpl = wrap('{% for row in rows %}<span>{{ row.category_keyword }}</span>{% endfor %}');
      const result = fillTemplate(tpl, cols, []);
      expect(result).not.toContain('<span>');
    });
  });

  describe('empty state', () => {
    it('renders {% if rows.size == 0 %} block when there are no rows', () => {
      const tpl = wrap('{% if rows.size == 0 %}<p>No data</p>{% endif %}');
      expect(fillTemplate(tpl, cols, [])).toContain('No data');
    });

    it('does not render the empty block when rows are present', () => {
      const tpl = wrap('{% if rows.size == 0 %}<p>No data</p>{% endif %}');
      expect(fillTemplate(tpl, cols, rows)).not.toContain('No data');
    });
  });

  describe('_pct variants', () => {
    it('computes _pct as percentage of max value', () => {
      const tpl = wrap('{% for row in rows %}{{ row.total_revenue_pct }}{% endfor %}');
      const result = fillTemplate(tpl, cols, rows);
      // max is 8000 → 8000/8000=100, 3000/8000=38, 1000/8000=13
      expect(result).toContain('100');
      expect(result).toContain('38');
      expect(result).toContain('13');
    });

    it('clamps _pct to 100 maximum', () => {
      const tpl = wrap('{{ rows[0].val_pct }}');
      const result = fillTemplate(tpl, [{ name: 'val', type: 'double' }], [[999999]]);
      expect(result).toContain('100');
    });
  });

  describe('conditional blocks', () => {
    it('applies green/yellow/red status logic', () => {
      const tpl = wrap(
        '{% for row in rows %}' +
          '{% if row.total_revenue >= 5000 %}green{% elsif row.total_revenue >= 2000 %}yellow{% else %}red{% endif %}' +
          '{% endfor %}'
      );
      const result = fillTemplate(tpl, cols, rows);
      expect(result).toContain('green'); // 8000
      expect(result).toContain('yellow'); // 3000
      expect(result).toContain('red'); // 1000
    });
  });

  describe('HTML escaping', () => {
    it('escapes < and > in column values', () => {
      const tpl = wrap('{% for row in rows %}{{ row.label }}{% endfor %}');
      const result = fillTemplate(
        tpl,
        [{ name: 'label', type: 'keyword' }],
        [['<script>alert(1)</script>']]
      );
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('sentinel stripping', () => {
    it('strips the sentinel before rendering', () => {
      const tpl = `${TEMPLATE_SENTINEL}\n<p>hello</p>`;
      expect(fillTemplate(tpl, [], [])).not.toContain(TEMPLATE_SENTINEL);
    });
  });

  describe('error recovery', () => {
    it('returns an error message for invalid Liquid syntax', () => {
      const tpl = wrap('{% invalid_tag %}');
      const result = fillTemplate(tpl, cols, rows);
      expect(result).toContain('Template error');
    });
  });
});

describe('sanitizeTemplate', () => {
  it('strips markdown code fences', () => {
    const raw = '```html\n' + TEMPLATE_SENTINEL + '\n<p>hi</p>\n```';
    expect(sanitizeTemplate(raw)).toContain(TEMPLATE_SENTINEL);
    expect(sanitizeTemplate(raw)).not.toContain('```');
  });

  it('discards LLM preamble before the sentinel', () => {
    const raw = 'Here is the template:\n' + TEMPLATE_SENTINEL + '\n<p>hi</p>';
    expect(sanitizeTemplate(raw).startsWith(TEMPLATE_SENTINEL)).toBe(true);
  });

  it('adds the sentinel if missing', () => {
    const raw = '<p>no sentinel here</p>';
    expect(sanitizeTemplate(raw)).toContain(TEMPLATE_SENTINEL);
  });
});

describe('isValidTemplate', () => {
  it('returns true when the template contains an HTML element', () => {
    expect(isValidTemplate(TEMPLATE_SENTINEL + '\n<div>hi</div>')).toBe(true);
    expect(isValidTemplate(TEMPLATE_SENTINEL + '\n<p>hi</p>')).toBe(true);
  });

  it('returns false for empty or sentinel-only content', () => {
    expect(isValidTemplate(TEMPLATE_SENTINEL)).toBe(false);
    expect(isValidTemplate('')).toBe(false);
  });
});
