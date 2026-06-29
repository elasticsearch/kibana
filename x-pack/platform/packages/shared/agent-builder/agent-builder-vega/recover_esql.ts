/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Read the ES|QL query from a Kibana Vega `data.url` object, if it is one. */
const esqlQueryFromUrl = (url: unknown): string | undefined => {
  if (!url || typeof url !== 'object') {
    return undefined;
  }
  const { '%type%': type, query } = url as Record<string, unknown>;
  if (type === 'esql' && typeof query === 'string' && query.trim()) {
    return query;
  }
  return undefined;
};

/**
 * Recover the ES|QL query embedded in a Vega spec's data source so that edits
 * can reuse the original query instead of regenerating one. The query is
 * injected during normalization as a `%type%: 'esql'` data url, which makes the
 * stored spec the source of truth across save/import round-trips.
 *
 * Both dialects are supported: Vega-Lite binds the query on a single `data.url`,
 * while raw Vega binds it on the `url` of one of the data sets in the `data`
 * array (the base `source` set). Accepts a serialized spec or a parsed object;
 * returns undefined when no ES|QL data binding is present or the input cannot be
 * parsed.
 */
export const extractEsqlFromSpec = (
  spec: string | Record<string, unknown> | null | undefined
): string | undefined => {
  if (!spec) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
  } catch {
    return undefined;
  }

  const { data } = (parsed as { data?: unknown } | null) ?? {};

  // Raw Vega: `data` is an array of data sets; the ES|QL url lives on one of them.
  if (Array.isArray(data)) {
    for (const dataSet of data) {
      const query = esqlQueryFromUrl((dataSet as { url?: unknown } | null)?.url);
      if (query) {
        return query;
      }
    }
    return undefined;
  }

  // Vega-Lite: a single `data.url`.
  return esqlQueryFromUrl((data as { url?: unknown } | null)?.url);
};
