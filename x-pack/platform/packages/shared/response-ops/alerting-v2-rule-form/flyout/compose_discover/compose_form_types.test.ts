/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComposedQuery, StandaloneQuery } from './compose_form_types';
import { getBreachQuery, getRecoverQuery } from './compose_form_types';

const BASE = 'FROM logs-*\n| STATS count = COUNT(*) BY host.name';
const ALERT_SEGMENT = 'WHERE count > 100';
const RECOVERY_SEGMENT = 'WHERE count < 100';

describe('getBreachQuery', () => {
  it('returns empty string for undefined input', () => {
    expect(getBreachQuery(undefined)).toBe('');
  });

  it('returns breach directly for standalone query', () => {
    const query: StandaloneQuery = {
      format: 'standalone',
      breach: { query: 'FROM logs-* | LIMIT 10' },
    };
    expect(getBreachQuery(query)).toBe('FROM logs-* | LIMIT 10');
  });

  it('returns empty string for standalone query with empty breach', () => {
    const query: StandaloneQuery = { format: 'standalone', breach: { query: '' } };
    expect(getBreachQuery(query)).toBe('');
  });

  it('joins base and breach segment for composed query', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
    };
    expect(getBreachQuery(query)).toBe(`${BASE}\n| ${ALERT_SEGMENT}`);
  });

  it('returns just breach segment when composed base is empty', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: '',
      breach: { segment: ALERT_SEGMENT },
    };
    expect(getBreachQuery(query)).toBe(`| ${ALERT_SEGMENT}`);
  });

  it('returns just base when composed breach segment is empty', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: '' },
    };
    expect(getBreachQuery(query)).toBe(BASE);
  });

  it('does not duplicate the pipe when the breach segment already starts with |', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: '| WHERE count > 100' },
    };
    expect(getBreachQuery(query)).toBe(`${BASE}\n| WHERE count > 100`);
  });

  it('ignores whitespace-only breach segments', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: '   ' },
    };
    expect(getBreachQuery(query)).toBe(BASE);
  });
});

describe('getRecoverQuery', () => {
  it('returns empty string for undefined input', () => {
    expect(getRecoverQuery(undefined)).toBe('');
  });

  it('returns recovery query for standalone query with recovery', () => {
    const query: StandaloneQuery = {
      format: 'standalone',
      breach: { query: 'FROM logs-*' },
      recovery: { query: 'FROM logs-* | WHERE status = "ok"' },
    };
    expect(getRecoverQuery(query)).toBe('FROM logs-* | WHERE status = "ok"');
  });

  it('returns empty string for standalone query without recovery', () => {
    const query: StandaloneQuery = { format: 'standalone', breach: { query: 'FROM logs-*' } };
    expect(getRecoverQuery(query)).toBe('');
  });

  it('joins base and recovery segment for composed query with recovery', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
      recovery: { segment: RECOVERY_SEGMENT },
    };
    expect(getRecoverQuery(query)).toBe(`${BASE}\n| ${RECOVERY_SEGMENT}`);
  });

  it('returns empty string for composed query without recovery', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
    };
    expect(getRecoverQuery(query)).toBe('');
  });

  it('returns empty string for composed query with empty recovery segment', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
      recovery: { segment: '' },
    };
    expect(getRecoverQuery(query)).toBe('');
  });

  it('returns just recovery segment when composed base is empty', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: '',
      breach: { segment: '' },
      recovery: { segment: RECOVERY_SEGMENT },
    };
    expect(getRecoverQuery(query)).toBe(`| ${RECOVERY_SEGMENT}`);
  });

  it('does not duplicate the pipe when the recovery segment already starts with |', () => {
    const query: ComposedQuery = {
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
      recovery: { segment: '| WHERE count < 100' },
    };
    expect(getRecoverQuery(query)).toBe(`${BASE}\n| WHERE count < 100`);
  });
});
