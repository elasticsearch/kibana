/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';

import {
  applyFieldUpdates,
  applyYamlUpdate,
  getTriggerTypesFromDefinition,
  prepareWorkflowDocumentFromYaml,
  workflowYamlDeclaresTopLevelEnabled,
} from './workflow_prepare';
import { getWorkflowZodSchema } from '../../../common/schema';
import type { WorkflowProperties } from '../../storage/workflow_storage';

describe('getTriggerTypesFromDefinition', () => {
  it('returns empty array for null definition', () => {
    expect(getTriggerTypesFromDefinition(null)).toEqual([]);
  });

  it('returns empty array for undefined definition', () => {
    expect(getTriggerTypesFromDefinition(undefined)).toEqual([]);
  });

  it('returns empty array for definition with no triggers', () => {
    expect(getTriggerTypesFromDefinition({ triggers: [] } as unknown as WorkflowYaml)).toEqual([]);
  });

  it('extracts trigger type ids from definition', () => {
    const definition = {
      triggers: [{ type: 'manual' }, { type: 'scheduled' }, { type: 'cases.updated' }],
    } as unknown as WorkflowYaml;
    expect(getTriggerTypesFromDefinition(definition)).toEqual([
      'manual',
      'scheduled',
      'cases.updated',
    ]);
  });

  it('filters out null and non-string trigger types', () => {
    const definition = {
      triggers: [{ type: 'manual' }, { type: null }, { type: 123 }, {}],
    } as unknown as WorkflowYaml;
    expect(getTriggerTypesFromDefinition(definition)).toEqual(['manual']);
  });
});

describe('workflowYamlDeclaresTopLevelEnabled', () => {
  it('returns true when YAML contains enabled: true', () => {
    expect(workflowYamlDeclaresTopLevelEnabled('name: Test\nenabled: true')).toBe(true);
  });

  it('returns true when YAML contains enabled: false', () => {
    expect(workflowYamlDeclaresTopLevelEnabled('name: Test\nenabled: false')).toBe(true);
  });

  it('returns false when YAML does not contain enabled', () => {
    expect(workflowYamlDeclaresTopLevelEnabled('name: Test\ndescription: A workflow')).toBe(false);
  });

  it('returns false for malformed YAML', () => {
    expect(workflowYamlDeclaresTopLevelEnabled('{{{')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(workflowYamlDeclaresTopLevelEnabled('')).toBe(false);
  });
});

describe('applyFieldUpdates', () => {
  const baseSource: WorkflowProperties = {
    name: 'Original',
    description: 'Original description',
    enabled: true,
    tags: ['original'],
    triggerTypes: ['manual'],
    yaml: 'name: Original\nenabled: true\ndescription: Original description',
    definition: null,
    createdBy: 'user1',
    lastUpdatedBy: 'user1',
    spaceId: 'default',
    valid: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  it('returns empty patch when no fields are provided', () => {
    const { patch, validationErrors } = applyFieldUpdates({}, baseSource);
    expect(patch).toEqual({});
    expect(validationErrors).toEqual([]);
  });

  it('patches name and synchronizes YAML', () => {
    const { patch } = applyFieldUpdates({ name: 'New Name' }, baseSource);
    expect(patch.name).toBe('New Name');
    expect(patch.yaml).toBeDefined();
  });

  it('patches description', () => {
    const { patch } = applyFieldUpdates({ description: 'New desc' }, baseSource);
    expect(patch.description).toBe('New desc');
  });

  it('patches tags', () => {
    const { patch } = applyFieldUpdates({ tags: ['a', 'b'] }, baseSource);
    expect(patch.tags).toEqual(['a', 'b']);
  });

  it('allows disabling a workflow and syncs definition.enabled', () => {
    const sourceWithDef = {
      ...baseSource,
      definition: { name: 'Original', enabled: true, version: '1' } as WorkflowYaml,
    };
    const { patch } = applyFieldUpdates({ enabled: false }, sourceWithDef);
    expect(patch.enabled).toBe(false);
    expect(patch.definition).toBeDefined();
    expect(patch.definition?.enabled).toBe(false);
    // other definition fields must be preserved
    expect(patch.definition?.name).toBe('Original');
  });

  it('allows enabling a workflow only if it has a definition, and syncs definition.enabled', () => {
    const sourceWithDefinition = {
      ...baseSource,
      enabled: false,
      definition: { name: 'Original', enabled: false, version: '1' } as WorkflowYaml,
    };
    const { patch, validationErrors } = applyFieldUpdates({ enabled: true }, sourceWithDefinition);
    expect(patch.enabled).toBe(true);
    expect(patch.definition).toBeDefined();
    expect(patch.definition?.enabled).toBe(true);
    expect(validationErrors).toEqual([]);
  });

  it('does not set definition in patch when definition is null', () => {
    const { patch } = applyFieldUpdates({ enabled: false }, baseSource); // baseSource has definition: null
    expect(patch.enabled).toBe(false);
    expect(patch.definition).toBeUndefined();
  });

  it('surfaces a validation error and does not rewrite YAML when enabling a workflow without a definition', () => {
    const sourceWithoutDef = { ...baseSource, enabled: false, definition: null };
    const { patch, validationErrors } = applyFieldUpdates({ enabled: true }, sourceWithoutDef);
    expect(patch.enabled).toBeUndefined();
    expect(patch.yaml).toBeUndefined();
    expect(validationErrors).toEqual([
      'Cannot enable a workflow without a valid definition. Provide valid YAML first.',
    ]);
  });

  it('does not update YAML when source has no yaml', () => {
    const sourceNoYaml = { ...baseSource, yaml: '' };
    const { patch } = applyFieldUpdates({ name: 'New' }, sourceNoYaml);
    expect(patch.name).toBe('New');
    expect(patch.yaml).toBeUndefined();
  });
});

describe('applyYamlUpdate', () => {
  const failingSchema = {
    parse: () => {
      throw new Error('invalid');
    },
    safeParse: () => ({ success: false, error: { issues: [] } }),
  } as any;

  it('coerces definition to null (not undefined) on the invalid branch so full-replace index does not drop the field', () => {
    const result = applyYamlUpdate({
      workflowYaml: 'not: valid: yaml:',
      zodSchema: failingSchema,
      triggerDefinitions: [],
    });
    expect(result.updatedDataPatch).toHaveProperty('definition', null);
    // Guard the specific regression: `undefined` would be silently dropped by JSON.stringify.
    expect(result.updatedDataPatch.definition).not.toBeUndefined();
    expect(result.updatedDataPatch.enabled).toBe(false);
    expect(result.updatedDataPatch.valid).toBe(false);
    expect(result.updatedDataPatch.triggerTypes).toEqual([]);
  });

  it('surfaces validation errors when the renamed YAML still fails schema validation', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithName = [
      'version: "1"',
      'name: Renamed Invalid Workflow',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = applyYamlUpdate({
      workflowYaml: invalidYamlWithName,
      zodSchema,
      triggerDefinitions: [],
    });

    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it('recovers tags from YAML that has valid tags but fails schema validation', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithTags = [
      'version: "1"',
      'name: Tagged Invalid Workflow',
      'tags:',
      '  - alpha',
      '  - beta',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = applyYamlUpdate({
      workflowYaml: invalidYamlWithTags,
      zodSchema,
      triggerDefinitions: [],
    });

    expect(result.updatedDataPatch.tags).toEqual(['alpha', 'beta']);
    expect(result.updatedDataPatch.valid).toBe(false);
  });

  it('recovers name/description from YAML that has a valid title but fails schema validation', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithName = [
      'version: "1"',
      'name: Multi-Source IOC Enrichment and Tiered Response',
      'description: Check an IOC against six threat-intel sources in parallel, aggregate the risk, then route to a tiered response.',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = applyYamlUpdate({
      workflowYaml: invalidYamlWithName,
      zodSchema,
      triggerDefinitions: [],
    });

    expect(result.updatedDataPatch.name).toBe('Multi-Source IOC Enrichment and Tiered Response');
    expect(result.updatedDataPatch.description).toBe(
      'Check an IOC against six threat-intel sources in parallel, aggregate the risk, then route to a tiered response.'
    );
    expect(result.updatedDataPatch.valid).toBe(false);
    expect(result.updatedDataPatch.definition).toBeNull();
  });

  it('omits name/description from the patch when invalid YAML has no title, so the stored name is preserved', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithoutName = [
      'version: "1"',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = applyYamlUpdate({
      workflowYaml: invalidYamlWithoutName,
      zodSchema,
      triggerDefinitions: [],
    });

    expect(result.updatedDataPatch).not.toHaveProperty('name');
    expect(result.updatedDataPatch).not.toHaveProperty('description');
    expect(result.updatedDataPatch).not.toHaveProperty('tags');
  });
});

describe('prepareWorkflowDocumentFromYaml', () => {
  const now = new Date('2024-01-01T00:00:00.000Z');

  it('recovers name/description from YAML that has a valid title but fails schema validation', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithName = [
      'version: "1"',
      'name: Multi-Source IOC Enrichment and Tiered Response',
      'description: Check an IOC against six threat-intel sources in parallel, aggregate the risk, then route to a tiered response.',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = prepareWorkflowDocumentFromYaml({
      yaml: invalidYamlWithName,
      zodSchema,
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
    });

    expect(result.workflowData.name).toBe('Multi-Source IOC Enrichment and Tiered Response');
    expect(result.workflowData.description).toBe(
      'Check an IOC against six threat-intel sources in parallel, aggregate the risk, then route to a tiered response.'
    );
    expect(result.workflowData.valid).toBe(false);
    expect(result.workflowData.definition).toBeNull();
  });

  it('falls back to "Untitled workflow" when invalid YAML has no name', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithoutName = [
      'version: "1"',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = prepareWorkflowDocumentFromYaml({
      yaml: invalidYamlWithoutName,
      zodSchema,
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
    });

    expect(result.workflowData.name).toBe('Untitled workflow');
    expect(result.workflowData.description).toBeUndefined();
    expect(result.workflowData.tags).toEqual([]);
  });

  it('recovers tags from YAML that has valid tags but fails schema validation', () => {
    const zodSchema = getWorkflowZodSchema({});
    const invalidYamlWithTags = [
      'version: "1"',
      'name: Tagged Invalid Workflow',
      'tags:',
      '  - alpha',
      '  - beta',
      'triggers:',
      '  - type: manual',
      'steps:',
      '  - name: step1',
      '    type: nonexistent_connector_type_xyz',
      '    with:',
      '      message: hello',
    ].join('\n');

    const result = prepareWorkflowDocumentFromYaml({
      yaml: invalidYamlWithTags,
      zodSchema,
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
    });

    expect(result.workflowData.tags).toEqual(['alpha', 'beta']);
    expect(result.workflowData.valid).toBe(false);
  });

  it('uses nameFallback when the YAML root cannot carry a name (e.g. cloning invalid YAML)', () => {
    const zodSchema = getWorkflowZodSchema({});

    // A scalar root has no `name` key to extract, so without the fallback this would
    // collapse to "Untitled workflow".
    const result = prepareWorkflowDocumentFromYaml({
      yaml: 'not-a-workflow',
      zodSchema,
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
      nameFallback: 'Original Copy',
    });

    expect(result.workflowData.name).toBe('Original Copy');
    expect(result.workflowData.valid).toBe(false);
  });

  it('prefers the YAML-embedded name over nameFallback', () => {
    const zodSchema = getWorkflowZodSchema({});

    const result = prepareWorkflowDocumentFromYaml({
      yaml: 'name: From YAML\ndescription: still broken',
      zodSchema,
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
      nameFallback: 'Fallback Name',
    });

    expect(result.workflowData.name).toBe('From YAML');
  });

  it('retains managed provenance without retaining managed ownership', () => {
    const result = prepareWorkflowDocumentFromYaml({
      yaml: 'name: Managed copy\nenabled: false\ntriggers: []\nsteps: []',
      zodSchema: getWorkflowZodSchema({}),
      authenticatedUser: 'user1',
      now,
      spaceId: 'default',
      originManagedWorkflowId: 'system-inference_pii_anonymization',
    });

    expect(result.workflowData).toEqual(
      expect.objectContaining({
        enabled: false,
        managed: false,
        managedBy: null,
        lifecycle: null,
        originManagedWorkflowId: 'system-inference_pii_anonymization',
      })
    );
  });
});
