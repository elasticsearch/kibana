/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { THREAT_INTEL_ENRICH_REPORT_WORKFLOW } from '.';

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
 * These assertions run against the static yaml the definition ships. There is no
 * workflow-execution harness in this package, so this cannot prove how the engine
 * evaluates the gate at run time. What it does pin is the structure the fix depends
 * on, which is where the original bug lived: the completion gate probed only two of
 * the three continued steps.
 */
describe('THREAT_INTEL_ENRICH_REPORT_WORKFLOW yaml', () => {
  const workflow = parse(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml) as {
    enabled?: boolean;
    steps: unknown[];
  };

  /** Steps whose failure must leave the report retryable. */
  const GATED_STEPS = ['extract_iocs', 'classify_severity', 'enrich_taxonomy'] as const;

  const gateCondition = (name: string) => {
    const step = findStepByName(workflow.steps, name) as {
      if?: string;
      with?: Record<string, unknown>;
    };
    expect(step).toBeDefined();
    return step;
  };

  describe('completion gate', () => {
    // The bug: extract_iocs runs with on-failure continue, but the gate only probed
    // classify_severity and enrich_taxonomy. A transient IOC-route failure therefore
    // wrote workflow_v2, which load_pending_reports filters on, so the report was
    // never revisited and never produced an indicator.
    it.each(GATED_STEPS)('requires %s to have succeeded before marking complete', (step) => {
      const gate = gateCondition('mark_llm_enrich_complete');
      expect(gate.if).toContain(`steps.${step}.error == null`);
    });

    it('marks the report workflow_v2 when the gate passes', () => {
      const gate = gateCondition('mark_llm_enrich_complete');
      expect(gate.with?.extraction_method).toBe('workflow_v2');
    });

    it.each(GATED_STEPS)('leaves the report pending when %s failed', (step) => {
      const gate = gateCondition('mark_llm_enrich_incomplete');
      expect(gate.if).toContain(`steps.${step}.error != null`);
    });

    it('marks the report pending when the gate fails', () => {
      const gate = gateCondition('mark_llm_enrich_incomplete');
      expect(gate.with?.extraction_method).toBe('pending');
    });

    it('bumps revision once after a successful enrich pass', () => {
      const bump = findStepByName(workflow.steps, 'bump_revision') as {
        if?: string;
        with?: { script?: { source?: string } };
      };
      expect(bump).toBeDefined();
      expect(bump.if).toContain('steps.extract_iocs.error == null');
      expect(bump.if).toContain('steps.persist_extractions.error == null');
      expect(bump.with?.script?.source).toContain('ctx._source.revision');
    });

    // The gate references persist_extractions by name; a rename that misses the
    // gate makes `steps.<missing>.error == null` vacuously true and bumps
    // revision even when the write never landed.
    it('gates revision on a step that actually exists', () => {
      const bump = findStepByName(workflow.steps, 'bump_revision') as { if?: string };
      expect(findStepByName(workflow.steps, 'persist_extractions')).toBeDefined();
      expect(bump.if).toContain('steps.persist_extractions.error');
    });

    // The two gates are separate conditions over the same steps, so updating one
    // and not the other would leave a report neither marked complete nor retryable.
    it('keeps the two gates complementary', () => {
      const complete = gateCondition('mark_llm_enrich_complete').if ?? '';
      const incomplete = gateCondition('mark_llm_enrich_incomplete').if ?? '';

      expect(complete).toContain(' and ');
      expect(complete).not.toContain(' or ');
      expect(incomplete).toContain(' or ');
      expect(incomplete).not.toContain(' and ');

      for (const step of GATED_STEPS) {
        expect(complete).toContain(`steps.${step}.`);
        expect(incomplete).toContain(`steps.${step}.`);
      }
    });
  });

  // Without on-failure continue, a failing step aborts the run before either gate is
  // reached, so the gate change above would be unreachable.
  it.each(GATED_STEPS)('%s continues on failure so the gate is reached', (step) => {
    const s = findStepByName(workflow.steps, step) as {
      'on-failure'?: { continue?: boolean };
    };
    expect(s?.['on-failure']?.continue).toBe(true);
  });

  // Dropped in this PR: it was a closed-set taxonomy field nothing consumed, and the
  // gate was using its presence as a stand-in for step health.
  it('no longer references detection_actionability anywhere', () => {
    expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).not.toContain('detection_actionability');
  });

  // MVP stores and processes plain text only. Reports no longer carry content.body_html,
  // and the enrichment routes accept bounded text, so the enrich workflow must not send an
  // html body to any step.

  it('ships disabled so operators must enable in Workflows management', () => {
    expect(workflow.enabled).toBe(false);
  });

  // Not "-global": a space literally named "global" running the pre-space-aware
  // version of this workflow would collide with a real global install's key.
  it('uses a concurrency key with no space or "global" suffix', () => {
    expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).toContain('key: "threat-intel-enrich"');
  });

  // No `/s/{id}/` prefix resolves to the `default` space implicitly, same as the
  // former `routeSpaceId: "default"` variable did, without needing the variable.
  it('calls the enrich routes with no space prefix, resolving to the default space', () => {
    expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).not.toContain('routeSpaceId');
    expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).not.toMatch(/path:\s*"\/s\//);
    expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).toContain(
      'path: "/internal/threat_intel/assess_relevance"'
    );
  });

  it('selects pending reports space-blind (no space_id filter on load_pending_reports)', () => {
    const load = findStepByName(workflow.steps, 'load_pending_reports') as {
      with?: { query?: { bool?: { filter?: unknown } } };
    };
    expect(load.with?.query?.bool?.filter).toBeUndefined();
  });

  describe('plain-text-only enrichment', () => {
    it('never references content.body_html', () => {
      expect(THREAT_INTEL_ENRICH_REPORT_WORKFLOW.yaml).not.toContain('body_html');
    });

    it.each(['assess_relevance', 'extract_iocs'])('%s sends body_text but not html', (stepName) => {
      const step = findStepByName(workflow.steps, stepName) as {
        with?: { body?: Record<string, unknown> };
      };
      const body = step?.with?.body ?? {};
      expect(body).toHaveProperty('text');
      expect(body).not.toHaveProperty('html');
    });
  });
});
