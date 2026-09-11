/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MigrationResult, InvokeDashboardOutput } from './migration_client';

export type { MigrationResult, InvokeDashboardOutput } from './migration_client';

/**
 * Represents a parsed Kibana panel extracted from the elastic_dashboard.data JSON string.
 * Each panel comes from the panelsJSON array stored in the dashboard attributes.
 * The ES|QL query lives at:
 *   embeddableConfig.attributes.state.datasourceStates.textBased.layers[layerId].query.esql
 * The index pattern lives at:
 *   embeddableConfig.attributes.state.datasourceStates.textBased.indexPatternRefs[0].title
 * The panel title lives at the top-level `title` property.
 */
interface KibanaPanelLayer {
  query?: { esql: string };
  [key: string]: unknown;
}

interface KibanaPanelState {
  datasourceStates?: {
    textBased?: {
      layers?: Record<string, KibanaPanelLayer>;
      indexPatternRefs?: Array<{ id: string; title: string; timeField?: string }>;
    };
  };
  query?: { esql: string };
  [key: string]: unknown;
}

interface KibanaPanelAttributes {
  state?: KibanaPanelState;
  [key: string]: unknown;
}

interface KibanaPanel {
  title?: string;
  embeddableConfig?: {
    attributes?: KibanaPanelAttributes;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface KibanaDashboardAttributes {
  panelsJSON?: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
}

interface KibanaDashboardData {
  attributes?: KibanaDashboardAttributes;
  [key: string]: unknown;
}

/**
 * Parses the elastic_dashboard.data JSON string and returns the array of Kibana panels.
 * Returns an empty array if data is missing, not valid JSON, or has no panelsJSON.
 */
export function parsePanels(dashboard: InvokeDashboardOutput): KibanaPanel[] {
  const rawData = dashboard.elastic_dashboard?.data;
  if (!rawData) {
    return [];
  }
  let dashboardData: KibanaDashboardData;
  try {
    dashboardData = JSON.parse(rawData) as KibanaDashboardData;
  } catch {
    return [];
  }
  const panelsJSON = dashboardData.attributes?.panelsJSON;
  if (!panelsJSON) {
    return [];
  }
  let panels: KibanaPanel[];
  try {
    panels = JSON.parse(panelsJSON) as KibanaPanel[];
  } catch {
    return [];
  }
  return Array.isArray(panels) ? panels : [];
}

/**
 * Extracts the ES|QL query string from a Kibana panel.
 * Looks in datasourceStates.textBased.layers[*].query.esql first,
 * then falls back to state.query.esql.
 */
function extractQueryFromPanel(panel: KibanaPanel): string | undefined {
  const state = panel.embeddableConfig?.attributes?.state;
  if (!state) {
    return undefined;
  }
  // Try textBased layers first
  const layers = state.datasourceStates?.textBased?.layers;
  if (layers) {
    for (const layer of Object.values(layers)) {
      const esql = layer.query?.esql;
      if (typeof esql === 'string' && esql.trim()) {
        return esql;
      }
    }
  }
  // Fallback: top-level state.query.esql
  const topQuery = state.query?.esql;
  if (typeof topQuery === 'string' && topQuery.trim()) {
    return topQuery;
  }
  return undefined;
}

/**
 * Extracts the index pattern title from a Kibana panel.
 * Looks in datasourceStates.textBased.indexPatternRefs[0].title,
 * then falls back to parsing FROM clause in the ES|QL query.
 */
function extractIndexPatternFromPanel(panel: KibanaPanel): string | undefined {
  const state = panel.embeddableConfig?.attributes?.state;
  const refs = state?.datasourceStates?.textBased?.indexPatternRefs;
  if (refs && refs.length > 0 && refs[0].title) {
    return refs[0].title;
  }
  // Fallback: parse FROM clause from ES|QL query
  const query = extractQueryFromPanel(panel);
  if (query) {
    const fromMatch = query.match(/FROM\s+`?([^\s|`]+)`?/i);
    if (fromMatch) {
      return fromMatch[1];
    }
  }
  return undefined;
}

/**
 * Extracts all ES|QL queries from translated dashboard panels.
 * Returns an array of { panelTitle, query } for panels that have queries.
 */
export function extractEsqlQueries(
  result: MigrationResult
): Array<{ panelTitle: string; query: string }> {
  const queries: Array<{ panelTitle: string; query: string }> = [];
  for (const dashboard of result.dashboards) {
    const panels = parsePanels(dashboard);
    for (const panel of panels) {
      const query = extractQueryFromPanel(panel);
      if (query) {
        queries.push({ panelTitle: panel.title ?? '', query });
      }
    }
  }
  return queries;
}

/**
 * Extracts index patterns from ES|QL FROM clauses.
 * Returns an array of { panelTitle, indexPattern }.
 */
export function extractIndexPatterns(
  result: MigrationResult
): Array<{ panelTitle: string; indexPattern: string }> {
  const patterns: Array<{ panelTitle: string; indexPattern: string }> = [];
  for (const dashboard of result.dashboards) {
    const panels = parsePanels(dashboard);
    for (const panel of panels) {
      const indexPattern = extractIndexPatternFromPanel(panel);
      if (indexPattern) {
        patterns.push({ panelTitle: panel.title ?? '', indexPattern });
      }
    }
  }
  return patterns;
}

/**
 * Detects lookup command patterns in SPL queries.
 * Matches: lookup, | lookup — but excludes inputlookup, outputlookup.
 */
export function splHasLookups(splXml: string): boolean {
  const lookupMatches = splXml.match(/(?<![a-zA-Z])lookup\s+\w+/gi) ?? [];
  return lookupMatches.some((match) => !/(?:input|output)lookup/i.test(match));
}

/**
 * Checks if an ES|QL query contains a LOOKUP JOIN clause.
 */
export function esqlHasLookupJoin(esqlQuery: string): boolean {
  return /LOOKUP\s+JOIN/i.test(esqlQuery);
}

/**
 * Checks if a markdown panel contains error patterns.
 * Returns true if the content starts with "Error:" (case-insensitive).
 */
export function markdownHasError(markdownContent: string): boolean {
  return /^\s*Error:/i.test(markdownContent);
}

/**
 * Counts translated panels from the migration result.
 * A panel is counted if it appears in the parsed panelsJSON of elastic_dashboard.data.
 */
export function countTranslatedPanels(result: MigrationResult): number {
  let count = 0;
  for (const dashboard of result.dashboards) {
    count += parsePanels(dashboard).length;
  }
  return count;
}
