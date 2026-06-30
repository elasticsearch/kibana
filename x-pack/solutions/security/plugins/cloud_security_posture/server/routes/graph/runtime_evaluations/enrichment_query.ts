/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { allIntegrationEvaluations } from './registry';
import type { IntegrationEvaluations } from './types';
import {
  formatCaseAssignment,
  mergeAssignments,
  parseEvalSnippet,
  type ParsedAssignment,
} from './merge_eval';

/** Pipeline phases merged into one `| EVAL` each (`detection_flags` is skipped). */
export const ENRICHMENT_PHASES = [
  'actor',
  'event_action',
  'target',
  'optional_classification',
] as const;

export type EnrichmentPhase = (typeof ENRICHMENT_PHASES)[number];

export interface BuildEnrichmentQueryOptions {
  /**
   * Integration package codes to include (e.g. `["slack", "openai"]`).
   * Default: all integrations with at least one evaluation snippet.
   */
  integrations?: readonly string[];
  /**
   * Output columns to omit from every `| EVAL` phase (e.g. `["host.ip", "host.target.ip"]`).
   * Default: none skipped.
   */
  skipColumns?: readonly string[];
}

function defaultIntegrationIds(): string[] {
  return Object.entries(allIntegrationEvaluations)
    .filter(([, mod]) => mod.evaluations.length > 0)
    .map(([id]) => id)
    .sort();
}

function resolveModules(ids: readonly string[]): IntegrationEvaluations[] {
  const missing: string[] = [];
  const modules: IntegrationEvaluations[] = [];

  for (const id of ids) {
    const mod = allIntegrationEvaluations[id as keyof typeof allIntegrationEvaluations];
    if (!mod) {
      missing.push(id);
      continue;
    }
    if (mod.evaluations.length > 0) {
      modules.push(mod);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Unknown integration(s): ${missing.join(', ')}`);
  }

  return modules;
}

function mergePhase(modules: IntegrationEvaluations[], phase: EnrichmentPhase): ParsedAssignment[] {
  const byColumn = new Map<string, ParsedAssignment>();

  for (const mod of modules) {
    const snippet = mod.evaluations.find((e) => e.id === phase);
    if (!snippet) {
      continue;
    }

    for (const assignment of parseEvalSnippet(snippet.esql)) {
      const existing = byColumn.get(assignment.column);
      byColumn.set(
        assignment.column,
        existing ? mergeAssignments(existing, assignment) : assignment
      );
    }
  }

  return [...byColumn.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, assignment]) => assignment);
}

/** Integration codes that have at least one evaluation snippet. */
export function listIntegrationsWithEvaluations(): string[] {
  return defaultIntegrationIds();
}

/**
 * Build a paste-ready ES|QL enrichment pipeline at runtime.
 * Merges per-integration `| EVAL` snippets by column (dataset guards stay in each CASE branch).
 */
export function buildEnrichmentQuery(options: BuildEnrichmentQueryOptions = {}): string {
  const integrationIds = options.integrations ?? defaultIntegrationIds();
  const modules = resolveModules(integrationIds);
  const skip = new Set(options.skipColumns ?? []);

  const lines: string[] = [];

  for (const phase of ENRICHMENT_PHASES) {
    const assignments = mergePhase(modules, phase).filter((a) => !skip.has(a.column));
    if (assignments.length === 0) {
      continue;
    }

    const body = assignments.map(formatCaseAssignment).join(',\n');
    lines.push(`| EVAL\n${body}`);
  }

  return `${lines.join('\n')}\n`;
}
