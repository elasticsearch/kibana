/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { THREAT_INTEL_INGEST_FEEDS_WORKFLOW } from '.';

const findStepByName = (steps: unknown[], name: string): Record<string, unknown> | undefined => {
  for (const step of steps) {
    const s = step as Record<string, unknown>;
    if (s.name === name) return s;
    for (const key of ['steps', 'else']) {
      const nested = s[key];
      if (Array.isArray(nested)) {
        const found = findStepByName(nested, name);
        if (found) return found;
      }
    }
  }
  return undefined;
};

/**
 * Static assertions over the shipped yaml. There is no execution harness in this package,
 * so these pin the structure the MVP source contract depends on rather than runtime
 * behaviour.
 */
describe('THREAT_INTEL_INGEST_FEEDS_WORKFLOW yaml', () => {
  const workflow = parse(THREAT_INTEL_INGEST_FEEDS_WORKFLOW.yaml) as {
    enabled?: boolean;
    steps: unknown[];
  };

  it('ships disabled so operators must enable in Workflows management', () => {
    expect(workflow.enabled).toBe(false);
  });

  // Not "-global": a space literally named "global" running the pre-space-aware
  // version of this workflow would collide with a real global install's key.
  it('uses a concurrency key with no space or "global" suffix', () => {
    expect(THREAT_INTEL_INGEST_FEEDS_WORKFLOW.yaml).toContain('key: "threat-intel-ingest"');
  });

  // Load-bearing invariant: a disabled source must cause no fetch. The only source
  // enumeration the workflow does is `load_sources`, and every fetch runs inside the
  // foreach over its hits — so filtering `enabled: true` here is what keeps a disabled
  // AWS or FortiGuard pack from ever being requested. Enablement is per-document, so this
  // also means enabling one source never enables another.
  it('loads only enabled sources', () => {
    const step = findStepByName(workflow.steps, 'load_sources') as {
      with?: { query?: { bool?: { filter?: Array<Record<string, unknown>> } } };
    };
    const filters = step?.with?.query?.bool?.filter ?? [];

    const enabledFilter = filters.find(
      (f) => (f.term as { enabled?: { value?: unknown } } | undefined)?.enabled !== undefined
    );
    expect(enabledFilter).toBeDefined();
    expect((enabledFilter?.term as { enabled: { value: boolean } }).enabled.value).toBe(true);
  });

  // Load-bearing for future space-owned sources: this workflow is installed once,
  // globally. A `space_id` filter here (even one that accepted the current space
  // plus `*`) would silently exclude a source owned by any other real space,
  // because there is only ever one instance of this workflow and it has no "current
  // space" of its own. `enabled` is deliberately the only gate.
  it('loads sources space-blind, with no space_id filter on load_sources', () => {
    const step = findStepByName(workflow.steps, 'load_sources') as {
      with?: { query?: { bool?: { filter?: Array<Record<string, unknown>> } } };
    };
    const filters = step?.with?.query?.bool?.filter ?? [];
    const spaceFilter = filters.find(
      (f) => (f.terms as { space_id?: unknown } | undefined)?.space_id !== undefined
    );
    expect(spaceFilter).toBeUndefined();
  });

  // Same reasoning as load_sources: a duplicate report written under a
  // space-owned source's own `space_id` still has to suppress a re-fetch of the
  // same fingerprint, so dedup cannot be scoped to a single space either.
  it('dedupes space-blind, with no space_id filter on check_dedup', () => {
    const step = findStepByName(workflow.steps, 'check_dedup') as {
      with?: { query?: { bool?: { filter?: Array<Record<string, unknown>> } } };
    };
    const filters = step?.with?.query?.bool?.filter ?? [];
    const spaceFilter = filters.find(
      (f) => (f.terms as { space_id?: unknown } | undefined)?.space_id !== undefined
    );
    expect(spaceFilter).toBeUndefined();
  });

  it('fetches sources only from within the load_sources foreach', () => {
    // If a `fetch_source` step existed outside the enabled-filtered foreach, it could fetch
    // a source the filter excluded. It must live under `dispatch_each_source`.
    const topLevelFetch = (workflow.steps as Array<Record<string, unknown>>).find(
      (s) => s.type === 'threat_intel.fetch_source'
    );
    expect(topLevelFetch).toBeUndefined();

    const dispatch = findStepByName(workflow.steps, 'dispatch_each_source');
    expect(dispatch).toBeDefined();
    expect(findStepByName([dispatch as Record<string, unknown>], 'fetch_source')).toBeDefined();
  });
});
