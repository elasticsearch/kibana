/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import type { z } from '@kbn/zod/v4';

import { getWorkflowZodSchema } from '../../common/schema';
import {
  applyFieldUpdates,
  applyYamlUpdate,
  getTriggerTypesFromDefinition,
} from '../api/lib/workflow_prepare';
import type { WorkflowProperties } from '../storage/workflow_storage';

describe('snapshot restore completeness', () => {
  const zodSchema: z.ZodType = getWorkflowZodSchema({}, [], { lightweight: true });
  const triggerDefinitions: Array<{ id: string; eventSchema: z.ZodType }> = [];

  const workflowYamlV1 = [
    'name: Workflow',
    'enabled: true',
    'tags:',
    '  - team-a',
    'triggers:',
    '  - type: manual',
    'settings:',
    '  timeout: 30',
    'inputs:',
    '  - name: comment',
    '    type: string',
    'steps:',
    '  - name: step-one',
    '    type: custom.step',
    '    with:',
    '      message: "version-one"',
  ].join('\n');

  const workflowYamlV2 = workflowYamlV1
    .replace('team-a', 'team-b')
    .replace('message: "version-one"', 'message: "version-two"');

  const makeSourceDocument = (yaml: string): WorkflowProperties => {
    const applied = applyYamlUpdate({ workflowYaml: yaml, zodSchema, triggerDefinitions });
    if (!applied.updatedDataPatch.valid || applied.validationErrors.length > 0) {
      throw new Error(`Test fixture YAML is invalid: ${applied.validationErrors.join(', ')}`);
    }

    return {
      name: applied.updatedDataPatch.name ?? 'Workflow',
      description: applied.updatedDataPatch.description ?? '',
      enabled: applied.updatedDataPatch.enabled ?? false,
      tags: applied.updatedDataPatch.tags ?? [],
      triggerTypes: applied.updatedDataPatch.triggerTypes ?? [],
      yaml,
      definition: applied.updatedDataPatch.definition ?? null,
      createdBy: 'alice',
      lastUpdatedBy: 'alice',
      spaceId: 'default',
      valid: true,
      deleted_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      version: 1,
    };
  };

  const snapshotYamlFromDocument = (document: WorkflowProperties): string => document.yaml;

  const restoreFromSnapshotYaml = (yaml: string) =>
    applyYamlUpdate({ workflowYaml: yaml, zodSchema, triggerDefinitions });

  const stepMessage = (definition: WorkflowYaml | null | undefined): string | undefined => {
    const step = definition?.steps?.[0];
    if (!step || typeof step !== 'object' || !('with' in step)) {
      return undefined;
    }
    const withBlock = (step as { with?: { message?: string } }).with;
    return withBlock?.message;
  };

  it('restores full YAML definition (steps, triggers, inputs, settings) from snapshot', () => {
    const historicalDocument = makeSourceDocument(workflowYamlV1);
    const snapshotYaml = snapshotYamlFromDocument(historicalDocument);

    const currentDocument = makeSourceDocument(workflowYamlV2);
    expect(currentDocument.definition).not.toEqual(historicalDocument.definition);

    const restored = restoreFromSnapshotYaml(snapshotYaml);
    expect(restored.validationErrors).toEqual([]);
    expect(restored.updatedDataPatch.valid).toBe(true);
    expect(restored.updatedDataPatch.tags).toEqual(['team-a']);
    expect(restored.updatedDataPatch.enabled).toBe(true);
    expect(getTriggerTypesFromDefinition(restored.updatedDataPatch.definition)).toEqual(['manual']);
    expect(stepMessage(restored.updatedDataPatch.definition)).toBe('version-one');
    expect(restored.updatedDataPatch.definition?.settings).toEqual({ timeout: 30 });
    expect(restored.updatedDataPatch.yaml).toContain('inputs:');
    expect(restored.updatedDataPatch.yaml).toContain('name: comment');
  });

  it('restores enabled state after an enable/disable toggle-only update', () => {
    const source = makeSourceDocument(workflowYamlV1);
    const { patch } = applyFieldUpdates({ enabled: false }, source);
    const afterToggle = { ...source, ...patch };

    expect(afterToggle.enabled).toBe(false);
    expect(afterToggle.yaml).toContain('enabled: false');

    const snapshotYaml = snapshotYamlFromDocument(afterToggle);
    const restored = restoreFromSnapshotYaml(snapshotYaml);

    expect(restored.validationErrors).toEqual([]);
    expect(restored.updatedDataPatch.enabled).toBe(false);
    expect(restored.updatedDataPatch.yaml).toContain('enabled: false');
  });

  it('restores tags after a tag-only API update without a YAML body', () => {
    const source = makeSourceDocument(workflowYamlV1);
    const { patch } = applyFieldUpdates({ tags: ['team-a', 'security'] }, source);
    const afterTagUpdate = { ...source, ...patch };

    expect(afterTagUpdate.tags).toEqual(['team-a', 'security']);
    expect(afterTagUpdate.yaml).toContain('team-a');
    expect(afterTagUpdate.yaml).toContain('security');

    const snapshotYaml = snapshotYamlFromDocument(afterTagUpdate);
    const restored = restoreFromSnapshotYaml(snapshotYaml);

    expect(restored.validationErrors).toEqual([]);
    expect(restored.updatedDataPatch.tags).toEqual(['team-a', 'security']);
  });

  it('logs yaml-only snapshots that include field-synced metadata', () => {
    const source = makeSourceDocument(workflowYamlV1);
    const { patch } = applyFieldUpdates({ enabled: false, tags: ['restored-tag'] }, source);
    const documentAfterWrite = { ...source, ...patch, version: 4 };

    const loggedSnapshot = { yaml: documentAfterWrite.yaml };

    expect(loggedSnapshot).toEqual({ yaml: expect.any(String) });
    expect(loggedSnapshot.yaml).toContain('enabled: false');
    expect(loggedSnapshot.yaml).toContain('restored-tag');

    const restored = restoreFromSnapshotYaml(loggedSnapshot.yaml);
    expect(restored.updatedDataPatch.enabled).toBe(false);
    expect(restored.updatedDataPatch.tags).toEqual(['restored-tag']);
  });
});
