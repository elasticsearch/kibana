/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import nodePath from 'path';

// @ts-ignore
import { REPO_ROOT } from '@kbn/repo-info';

interface PackageRule {
  matchDepNames?: string[];
  matchPackageNames?: string[];
  matchDepPatterns?: string[];
  reviewers?: string[];
  enabled?: boolean;
  groupName?: string;
}

interface RenovateConfig {
  packageRules?: PackageRule[];
}

export interface RenovateMatch {
  team: string | null;
  group: string | null;
  orphan: boolean;
}

// "team:kibana-operations" → "elastic/kibana-operations"
function normalizeTeam(reviewer: string): string {
  return reviewer.startsWith('team:') ? `elastic/${reviewer.slice(5)}` : reviewer;
}

interface CompiledRule {
  exactNames: Set<string>;
  patterns: RegExp[];
  team: string | null;
  group: string | null;
}

/**
 * Returns a function that, given a dep name, returns its renovate reviewer team
 * and group, or marks it as an orphan if no enabled rule covers it.
 *
 * Patterns are compiled once at construction time (not per-lookup) and anchored
 * with ^ and $ to match Renovate's own anchoring behaviour and avoid substring
 * false-positives (e.g. "cypress" matching "cypress-axe").
 */
export function buildRenovateMatcher(renovatePath?: string): (dep: string) => RenovateMatch {
  const configPath = renovatePath ?? nodePath.join(REPO_ROOT, 'renovate.json');
  let config: RenovateConfig = {};
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    // no config found — everything will be an orphan
  }

  // Only keep rules that are explicitly enabled and have a non-empty first reviewer.
  // The first rule {"matchDepPatterns": [".*"], "enabled": false} acts as a
  // global disable; specific rules then opt packages in with "enabled": true.
  const compiledRules: CompiledRule[] = (config.packageRules ?? [])
    .filter((r) => r.enabled !== false && r.reviewers?.[0])
    .map((r) => ({
      exactNames: new Set([...(r.matchDepNames ?? []), ...(r.matchPackageNames ?? [])]),
      patterns: (r.matchDepPatterns ?? []).flatMap((p) => {
        try {
          return [new RegExp(`^(?:${p})$`)];
        } catch {
          return [];
        }
      }),
      team: normalizeTeam(r.reviewers![0]),
      group: r.groupName ?? null,
    }));

  return (dep: string): RenovateMatch => {
    const match = compiledRules.find(
      (r) => r.exactNames.has(dep) || r.patterns.some((re) => re.test(dep))
    );
    if (!match) return { team: null, group: null, orphan: true };
    return { team: match.team, group: match.group, orphan: false };
  };
}
