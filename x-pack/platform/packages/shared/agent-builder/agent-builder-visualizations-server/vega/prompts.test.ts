/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAuthorVegaSpecPrompt } from './prompts';

const systemText = (nlQuery: string): string => {
  const [system] = createAuthorVegaSpecPrompt({ nlQuery, esqlQuery: 'FROM logs-*' });
  return String((system as [string, string])[1]);
};

describe('createAuthorVegaSpecPrompt', () => {
  it('injects the raw-Vega rules and reference example for a Sankey request', () => {
    const text = systemText('show me a sankey of source to destination country');

    expect(text).toContain('RAW VEGA REQUIRED');
    expect(text).toContain('REFERENCE EXAMPLE (sankey)');
    expect(text).toContain('"linkpath"');
    // The example embeds a complete, copyable inline ES|QL data source.
    expect(text).toContain('"%type%": "esql"');
  });

  it('injects the raw-Vega rules and reference example for a trend-indicator request', () => {
    const text = systemText('a trend indicator of total requests');

    expect(text).toContain('RAW VEGA REQUIRED');
    expect(text).toContain('REFERENCE EXAMPLE (trend indicator)');
  });

  it('injects a Vega-Lite reference example (without raw rules) for a scatter request', () => {
    const text = systemText('a scatter plot of bytes vs latency by host');

    expect(text).toContain('REFERENCE EXAMPLE (scatter / bubble plot)');
    expect(text).toContain('Follow this Vega-Lite reference');
    expect(text).not.toContain('RAW VEGA REQUIRED');
  });

  it('does not inject any reference example for a standard Vega-Lite request', () => {
    const text = systemText('a bar chart of counts by status');

    expect(text).not.toContain('RAW VEGA REQUIRED');
    expect(text).not.toContain('REFERENCE EXAMPLE');
  });

  it('always includes the dotted-field escaping guidance', () => {
    expect(systemText('any chart')).toContain('DOTS IN FIELD NAMES');
  });
});
