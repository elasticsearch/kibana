/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS,
  WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS,
} from './mappings';

// The workflow index mappings are read by the engine, the inbox
// provider, telemetry, and any cross-workflow listing. Pinning them
// at the property-shape level here turns accidental schema drift
// (e.g. flipping `dynamic: false` off, retyping a keyword as text,
// or unintentionally dropping a core lifecycle field) into a clear
// test failure rather than a silent empty-result query in production.

describe('WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS', () => {
  it('keeps `dynamic: false` so unmapped step-doc properties are never auto-indexed', () => {
    // HITL response payloads can carry arbitrary user-shaped JSON in
    // `output` / `state`. Explicit mode keeps ES from indexing those
    // keys dynamically.
    expect(WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS.dynamic).toBe(false);
  });

  it('exposes `stepType` as a top-level keyword for cross-workflow term filters', () => {
    // Cross-workflow listings issue `term: { stepType: '<type>' }`
    // against this index. A `text` mapping or a sub-property would
    // break that — pin field type and position.
    const stepType = WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS.properties?.stepType;
    expect(stepType).toEqual({ type: 'keyword' });
  });

  it('nests the HITL audit envelope under `hitl` with the documented field types', () => {
    // The audit fields are namespaced under `hitl` rather than living
    // at the top level so the step schema stays generic — only
    // HITL-aware steps populate them. Pinning the nested types makes
    // the contract explicit for downstream readers (inbox query
    // service, mapper) and guards against a future "promote one of
    // these to top level" refactor that would silently break queries.
    const hitl = WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS.properties?.hitl as
      | { type?: string; properties: Record<string, { type: string }> }
      | undefined;
    expect(hitl).toBeDefined();
    expect(hitl?.type).toBe('object');
    expect(hitl?.properties).toEqual({
      respondedBy: { type: 'keyword' },
      respondedAt: { type: 'date' },
      channel: { type: 'keyword' },
    });
  });

  it('keeps the existing core lifecycle fields indexed', () => {
    // Regression guard for the existing schema. Update these
    // expectations deliberately when a core field's type or presence
    // is intentionally changed.
    const properties = WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS.properties ?? {};
    expect(properties.spaceId).toEqual({ type: 'keyword' });
    expect(properties.id).toEqual({ type: 'keyword' });
    expect(properties.stepId).toEqual({ type: 'keyword' });
    expect(properties.workflowRunId).toEqual({ type: 'keyword' });
    expect(properties.workflowId).toEqual({ type: 'keyword' });
    expect(properties.status).toEqual({ type: 'keyword' });
    expect(properties.isTestRun).toEqual({ type: 'boolean' });
    expect(properties.startedAt).toEqual({ type: 'date' });
    expect(properties.finishedAt).toEqual({ type: 'date' });
    expect(properties.duration).toEqual({ type: 'long' });
  });
});

describe('WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS', () => {
  it('preserves `dynamic: false` and the existing core fields', () => {
    // Workflow-level mapping is documented separately from
    // `step-executions`. Pinning the shape here catches incidental
    // edits that would otherwise pass through this file's review.
    expect(WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS.dynamic).toBe(false);
    const properties = WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS.properties ?? {};
    expect(properties.spaceId).toEqual({ type: 'keyword' });
    expect(properties.workflowId).toEqual({ type: 'keyword' });
    expect(properties.status).toEqual({ type: 'keyword' });
    expect(properties.createdBy).toEqual({ type: 'keyword' });
    expect(properties.executedBy).toEqual({ type: 'keyword' });
    expect(properties.triggeredBy).toEqual({ type: 'keyword' });
    expect(properties.workflowDefinition).toEqual({ type: 'object', enabled: false });
    expect(properties.version).toEqual({ type: 'long' });
  });

  it('does not carry an `hitl` envelope — HITL audit lives on the step doc', () => {
    // A workflow can host multiple HITL steps; placing the audit on
    // the step row keeps a distinct record per step instead of
    // conflating them into a single workflow-level entry. This test
    // pins that decision so a future contributor doesn't accidentally
    // duplicate the envelope here.
    const properties = WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS.properties ?? {};
    expect(properties.hitl).toBeUndefined();
  });
});
