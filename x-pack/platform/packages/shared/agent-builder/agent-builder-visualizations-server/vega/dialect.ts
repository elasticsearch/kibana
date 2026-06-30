/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Vega-Lite is the default dialect; raw Vega is the escalation tier (flow/hierarchy charts). */
export type VegaDialect = 'vega-lite' | 'vega';

/** Raw Vega schema, used for charts Vega-Lite cannot express (e.g. Sankey). */
export const VEGA_V5_SCHEMA = 'https://vega.github.io/schema/vega/v5.json';

/**
 * Decide whether a spec is Vega-Lite or raw Vega.
 *
 * The `$schema` is authoritative (Vega-Lite urls contain `vega-lite`, raw Vega
 * urls match `/vega/vN`). When it is missing or unrecognized we fall back to
 * structure: a top-level `marks` ARRAY is unique to raw Vega (Vega-Lite uses the
 * singular `mark`, or composite `layer`/`facet`/`repeat`/`concat` keys), so
 * anything else defaults to Vega-Lite.
 */
export const detectVegaDialect = (spec: Record<string, unknown>): VegaDialect => {
  const schema = typeof spec.$schema === 'string' ? spec.$schema : '';
  if (schema.includes('vega-lite')) {
    return 'vega-lite';
  }
  if (/\/vega\/v\d/i.test(schema)) {
    return 'vega';
  }
  return Array.isArray((spec as { marks?: unknown }).marks) ? 'vega' : 'vega-lite';
};
