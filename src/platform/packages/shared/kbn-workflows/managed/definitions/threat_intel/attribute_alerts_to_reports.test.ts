/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { THREAT_INTEL_ATTRIBUTE_ALERTS_WORKFLOW } from '.';
import { createWorkflowLiquidEngine } from '../../../common/utils/create_workflow_liquid_engine/create_workflow_liquid_engine';

interface WorkflowStep {
  name?: string;
  type?: string;
  steps?: WorkflowStep[];
  with?: Record<string, unknown>;
}

const findStepByName = (
  steps: WorkflowStep[] | undefined,
  name: string
): WorkflowStep | undefined => {
  for (const step of steps ?? []) {
    if (step.name === name) return step;
    const nested = findStepByName(step.steps, name);
    if (nested) return nested;
  }
  return undefined;
};

/**
 * Mirrors `WorkflowTemplatingEngine.evaluateExpression`: drop the leading `$`,
 * then take everything between the first `{{` and the last `}}`.
 */
const evaluateExpression = (
  engine: ReturnType<typeof createWorkflowLiquidEngine>,
  template: string,
  context: Record<string, unknown>
): unknown => {
  const open = template.indexOf('{{');
  const close = template.lastIndexOf('}}');
  return engine.evalValueSync(template.substring(open + 2, close).trim(), context);
};

/**
 * Mirrors `WorkflowTemplatingEngine.renderValueRecursively`: `${{ ... }}` strings
 * are evaluated to typed values, plain strings are rendered, and objects and
 * arrays are walked.
 */
const renderValueRecursively = (
  engine: ReturnType<typeof createWorkflowLiquidEngine>,
  value: unknown,
  context: Record<string, unknown>
): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.startsWith('${{') && value.endsWith('}}')
      ? evaluateExpression(engine, value.substring(1), context)
      : engine.parseAndRenderSync(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderValueRecursively(engine, item, context));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        renderValueRecursively(engine, item, context),
      ])
    );
  }

  return value;
};

describe('THREAT_INTEL_ATTRIBUTE_ALERTS_WORKFLOW yaml', () => {
  const workflow = parse(THREAT_INTEL_ATTRIBUTE_ALERTS_WORKFLOW.yaml) as {
    enabled?: boolean;
    steps?: WorkflowStep[];
  };

  it('ships disabled so operators must enable in Workflows management', () => {
    expect(workflow.enabled).toBe(false);
  });

  it('scopes alert queries to the executing space', () => {
    expect(THREAT_INTEL_ATTRIBUTE_ALERTS_WORKFLOW.yaml).toContain(
      '.alerts-security.alerts-{{ variables.spaceId }}'
    );
  });

  it('loads reports for the executing space plus the global catalog', () => {
    const loadStep = findStepByName(workflow.steps, 'load_reports_with_extractions');
    expect(loadStep).toBeDefined();
    const filter = JSON.stringify(loadStep?.with);
    // Space-keyed evidence is what makes including '*' safe: each space
    // writes its own nested element instead of clobbering a shared flat object.
    expect(filter).toContain('"space_id":["{{ variables.spaceId }}","*"]');
  });

  it('holds the evidence script in a data.set step as a block scalar', () => {
    const scriptStep = findStepByName(workflow.steps, 'set_evidence_script');
    expect(scriptStep).toBeDefined();
    const source = scriptStep?.with?.evidence_script;
    expect(typeof source).toBe('string');
    // The per-space dedupe guard. A Liquid-mangled body would lose this.
    expect(source as string).toContain('instanceof List');
    // Liquid must not consume any of the script source.
    expect(source as string).not.toContain('{{');
    expect(source as string).not.toContain('{%');
    // The evidence write must not advance the report revision.
    expect(source as string).not.toContain('revision');
  });

  // evidence is shared with Hunt Watch's writer, which sets a disjoint set
  // of keys (last_hunt_*, corroborated_rank_score) on the same per-space element.
  it('only assigns alert_hits keys, never the whole matched element', () => {
    const source = findStepByName(workflow.steps, 'set_evidence_script')?.with
      ?.evidence_script as string;
    expect(source).toMatch(/evidence\[i\]\.alert_hits\s*=/);
    expect(source).toMatch(/evidence\[i\]\.alert_hits_total\s*=/);
    // A wholesale `evidence[i] = ...` replace would erase Hunt Watch's
    // last_hunt_*/corroborated_rank_score keys on that same per-space element.
    expect(source).not.toMatch(/evidence\[i\]\s*=\s*[^.]/);
    expect(source).not.toContain('last_hunt');
  });

  it('writes via elasticsearch.update, not bulk', () => {
    // Bulk API rejects scripted updates on indices that contain semantic_text
    // fields (the reports index does). The Update API accepts them.
    const writeStep = findStepByName(workflow.steps, 'write_evidence');
    expect(writeStep?.type).toBe('elasticsearch.update');
    expect(THREAT_INTEL_ATTRIBUTE_ALERTS_WORKFLOW.yaml).not.toContain('elasticsearch.bulk');
  });

  describe('write_evidence renders a scripted per-space upsert', () => {
    const engine = createWorkflowLiquidEngine();
    const evidenceScript = findStepByName(workflow.steps, 'set_evidence_script')?.with
      ?.evidence_script as string;
    const writeStep = findStepByName(workflow.steps, 'write_evidence');

    const context = {
      variables: {
        layer1_count: 3,
        layer2_count: 4,
        spaceId: 'space-a',
        evidence_script: evidenceScript,
      },
      foreach: { item: { _id: 'report-1', _index: '.kibana-threat-reports' } },
      now: '2024-06-01T00:00:00.000Z',
    };

    it('renders index, id, retry_on_conflict, and script params', () => {
      expect(writeStep).toBeDefined();
      const rendered = renderValueRecursively(engine, writeStep?.with, context) as {
        index: string;
        id: string;
        retry_on_conflict: number;
        script: { lang: string; source: string; params: Record<string, unknown> };
        upsert?: unknown;
        doc?: unknown;
      };

      expect(rendered.index).toBe('.kibana-threat-reports');
      expect(rendered.id).toBe('report-1');
      // Cross-space concurrency on shared global docs; concurrency.key only
      // serializes runs within a space.
      expect(rendered.retry_on_conflict).toBe(3);
      expect(rendered.doc).toBeUndefined();
      expect(rendered.upsert).toBeUndefined();
      expect(rendered.script.lang).toBe('painless');
      expect(rendered.script.source).toBe(evidenceScript);
      expect(rendered.script.source).toContain('instanceof List');
      expect(rendered.script.params).toEqual({
        space_id: 'space-a',
        window: '7d',
        computed_at: '2024-06-01T00:00:00.000Z',
        ioc_match_hits: 3,
        technique_overlap_hits: 4,
        alert_hits_total: 7,
      });
    });
  });
});
