/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getWorkflowJsonSchema, isDynamicConnector, StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import {
  createMockConnectorInstance,
  createMockConnectorTypeInfo,
} from './mocks/connector_type_info';
import {
  addDynamicConnectorsToCache,
  convertDynamicConnectorsToContracts,
  getAllConnectorsInternal,
  getAllConnectorsWithDynamic,
  getCachedAllConnectorsMap,
  getCachedDynamicConnectorTypes,
  getDeprecatedStepMetadataMap,
  getWorkflowZodSchema,
} from './schema';
import { EmailParamsSchema } from './stack_connectors_schema/email';
import { stepSchemas } from './step_schemas';

describe('schema - additional coverage', () => {
  describe('EmailParamsSchema attachments', () => {
    const baseEmailParams = {
      to: ['ops@example.com'],
      subject: 'Daily CSV report',
      message: 'Attached is the generated report.',
    };

    const attachment = {
      filename: 'report.csv',
      contentType: 'text/csv',
      content: 'host,risk\nhost-1,high\n',
    };

    const createWorkflowWithEmailStep = () => ({
      name: 'email attachments workflow',
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'send-report',
          type: 'email',
          'connector-id': 'stakeholder-email',
          with: {
            ...baseEmailParams,
            attachments: [attachment],
          },
        },
      ],
    });

    const createWorkflowEmailSchema = () =>
      getWorkflowZodSchema({
        '.email': createMockConnectorTypeInfo({
          actionTypeId: '.email',
          displayName: 'Email',
        }),
      });

    it('accepts email params with typical attachment fields', () => {
      expect(() =>
        EmailParamsSchema.parse({
          ...baseEmailParams,
          attachments: [attachment],
        })
      ).not.toThrow();
    });

    it('keeps filename and content in JSON Schema required for attachment items (Monaco YAML templates)', () => {
      const jsonSchema = getWorkflowJsonSchema(createWorkflowEmailSchema());
      expect(jsonSchema).not.toBeNull();

      const hasAttachmentItemRequired = (node: unknown): boolean => {
        if (!node || typeof node !== 'object') {
          return false;
        }
        const o = node as Record<string, unknown>;
        const req = o.required;
        const props = o.properties as Record<string, unknown> | undefined;
        if (
          Array.isArray(req) &&
          req.includes('filename') &&
          req.includes('content') &&
          props &&
          typeof props.contentType !== 'undefined'
        ) {
          return true;
        }
        return Object.values(o).some(hasAttachmentItemRequired);
      };

      expect(hasAttachmentItemRequired(jsonSchema)).toBe(true);
    });

    it('accepts a workflow YAML email step with attachments', () => {
      expect(() => createWorkflowEmailSchema().parse(createWorkflowWithEmailStep())).not.toThrow();
    });

    it('rejects attachments missing required filename', () => {
      expect(() =>
        EmailParamsSchema.parse({
          ...baseEmailParams,
          attachments: [{ content: 'host,risk\nhost-1,high\n' }],
        })
      ).toThrow();
    });

    it('rejects attachments missing required content', () => {
      expect(() =>
        EmailParamsSchema.parse({
          ...baseEmailParams,
          attachments: [{ filename: 'report.csv' }],
        })
      ).toThrow();
    });

    it('rejects attachments with invalid field types', () => {
      expect(() =>
        EmailParamsSchema.parse({
          ...baseEmailParams,
          attachments: [{ filename: 'report.csv', content: 123 }],
        })
      ).toThrow();
    });

    it('rejects attachments with content exceeding the max length', () => {
      expect(() =>
        EmailParamsSchema.parse({
          ...baseEmailParams,
          attachments: [{ filename: 'report.csv', content: 'a'.repeat(3 * 1024 * 1024 + 1) }],
        })
      ).toThrow();
    });
  });

  describe('getAllConnectorsInternal', () => {
    it('should include the console connector', () => {
      const connectors = getAllConnectorsInternal();
      const consoleConnector = connectors.find((c) => c.type === 'console');
      expect(consoleConnector).toBeDefined();
      expect(consoleConnector?.summary).toBeDefined();
    });

    it('should include elasticsearch connectors', () => {
      const connectors = getAllConnectorsInternal();
      const esConnectors = connectors.filter((c) => c.type.startsWith('elasticsearch.'));
      expect(esConnectors.length).toBeGreaterThan(0);
    });

    it('should include kibana connectors', () => {
      const connectors = getAllConnectorsInternal();
      const kibanaConnectors = connectors.filter((c) => c.type.startsWith('kibana.'));
      expect(kibanaConnectors.length).toBeGreaterThan(0);
    });

    it('should return cached result on subsequent calls', () => {
      const first = getAllConnectorsInternal();
      const second = getAllConnectorsInternal();
      expect(first).toBe(second);
    });
  });

  describe('getDeprecatedStepMetadataMap', () => {
    it('should freeze the cached metadata map', () => {
      const metadata = getDeprecatedStepMetadataMap();

      expect(Object.isFrozen(metadata)).toBe(true);
    });

    it('should return the same cached frozen object on subsequent calls', () => {
      const first = getDeprecatedStepMetadataMap();
      const second = getDeprecatedStepMetadataMap();

      expect(first).toBe(second);
      expect(Object.isFrozen(second)).toBe(true);
    });
  });

  describe('getAllConnectorsWithDynamic', () => {
    it('should return base connectors when no dynamic types provided', () => {
      const result = getAllConnectorsWithDynamic();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return base connectors when empty object provided', () => {
      const result = getAllConnectorsWithDynamic({});
      expect(result.length).toBeGreaterThan(0);
    });

    it('should add dynamic connectors', () => {
      const dynamicTypes = {
        '.my-dynamic-test-type': createMockConnectorTypeInfo({
          actionTypeId: '.my-dynamic-test-type',
          displayName: 'My Dynamic Type',
        }),
      };

      const result = getAllConnectorsWithDynamic(dynamicTypes);
      const found = result.find((c) => c.type === 'my-dynamic-test-type');
      expect(found).toBeDefined();
      expect(found?.description).toContain('My Dynamic Type');
    });

    it('should not add duplicate types that exist in static connectors', () => {
      const dynamicTypes = {
        '.dup-type-test': createMockConnectorTypeInfo({
          actionTypeId: '.dup-type-test',
          displayName: 'Dup Type',
        }),
      };

      const result = getAllConnectorsWithDynamic(dynamicTypes);
      const dupEntries = result.filter((c) => c.type === 'dup-type-test');
      expect(dupEntries.length).toBeLessThanOrEqual(1);
    });

    it('should skip disabled dynamic connectors', () => {
      const dynamicTypes = {
        '.disabled-test-type': createMockConnectorTypeInfo({
          actionTypeId: '.disabled-test-type',
          displayName: 'Disabled',
          enabled: false,
        }),
      };

      const result = getAllConnectorsWithDynamic(dynamicTypes);
      const found = result.find((c) => c.type === 'disabled-test-type');
      expect(found).toBeUndefined();
    });
  });

  describe('convertDynamicConnectorsToContracts', () => {
    it('should convert a connector without sub-actions to a single contract', () => {
      const types = {
        '.simple-action': createMockConnectorTypeInfo({
          actionTypeId: '.simple-action',
          displayName: 'Simple Action',
          instances: [createMockConnectorInstance({ id: 'i1', name: 'Instance 1' })],
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('simple-action');
      expect(contracts[0]).toHaveProperty('displayName', 'Simple Action');
      expect(contracts[0].summary).toBe('Simple Action');
      expect(contracts[0].description).toBe('Simple Action connector');
    });

    it('should create sub-action contracts for connectors with subActions', () => {
      const types = {
        '.inference': createMockConnectorTypeInfo({
          actionTypeId: '.inference',
          displayName: 'Inference',
          subActions: [
            { name: 'completion', displayName: 'Completion' },
            { name: 'rerank', displayName: 'Rerank' },
            { name: 'textEmbedding', displayName: 'Text Embedding' },
          ],
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      expect(contracts).toHaveLength(3);
      expect(contracts.map((c) => c.type)).toEqual([
        'inference.completion',
        'inference.rerank',
        'inference.textEmbedding',
      ]);
      const dynamicContracts = contracts.filter(isDynamicConnector);
      expect(dynamicContracts).toHaveLength(3);
      expect(dynamicContracts.every((contract) => contract.displayName === 'Inference')).toBe(true);
    });

    it('should skip disabled connectors', () => {
      const types = {
        '.disabled': createMockConnectorTypeInfo({
          actionTypeId: '.disabled',
          displayName: 'Disabled',
          enabled: false,
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      expect(contracts).toHaveLength(0);
    });

    it('should handle connector with empty subActions array as fallback', () => {
      const types = {
        '.no-subs': createMockConnectorTypeInfo({
          actionTypeId: '.no-subs',
          displayName: 'No Subs',
          subActions: [],
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      expect(contracts).toHaveLength(1);
      expect(contracts[0].type).toBe('no-subs');
    });

    it('should include instances in the contract', () => {
      const instances = [
        createMockConnectorInstance({ id: 'inst-1', name: 'First' }),
        createMockConnectorInstance({ id: 'inst-2', name: 'Second' }),
      ];

      const types = {
        '.with-instances': createMockConnectorTypeInfo({
          actionTypeId: '.with-instances',
          displayName: 'With Instances',
          instances,
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      expect(contracts[0]).toHaveProperty('instances', instances);
    });

    it('should add XSOAR action schemas, documentation, and examples', () => {
      const types = {
        '.xsoar': createMockConnectorTypeInfo({
          actionTypeId: '.xsoar',
          displayName: 'XSOAR',
          subActions: [
            { name: 'getPlaybooks', displayName: 'Get Playbooks' },
            { name: 'run', displayName: 'Run' },
          ],
        }),
      };

      const contracts = convertDynamicConnectorsToContracts(types);
      const getPlaybooks = contracts.find((contract) => contract.type === 'xsoar.getPlaybooks');
      const run = contracts.find((contract) => contract.type === 'xsoar.run');

      expect(getPlaybooks?.description).toBe('Retrieve XSOAR playbooks visible to the connector.');
      expect(getPlaybooks?.examples?.snippet).toContain('type: xsoar.getPlaybooks');
      expect(run?.description).toBe(
        'Create an XSOAR incident and optionally associate it with a playbook.'
      );
      expect(run?.documentation).toBeUndefined();
      expect(run?.examples?.snippet).toContain('createInvestigation: true');
      expect(
        run?.paramsSchema.parse({
          name: 'Suspicious login detected',
          createInvestigation: true,
          severity: '2',
        })
      ).toEqual({
        name: 'Suspicious login detected',
        playbookId: null,
        createInvestigation: true,
        severity: 2,
        isRuleSeverity: false,
        body: null,
      });
    });
  });

  describe('addDynamicConnectorsToCache', () => {
    it('should store dynamic connector types in cache', () => {
      const dynamicTypes = {
        '.cache-test-action': createMockConnectorTypeInfo({
          actionTypeId: '.cache-test-action',
          displayName: 'Cache Test',
        }),
      };

      addDynamicConnectorsToCache(dynamicTypes);

      const cached = getCachedDynamicConnectorTypes();
      expect(cached).not.toBeNull();
      expect(cached?.['.cache-test-action']).toBeDefined();
    });

    it('should update the all-connectors map cache', () => {
      const dynamicTypes = {
        '.map-cache-test': createMockConnectorTypeInfo({
          actionTypeId: '.map-cache-test',
          displayName: 'Map Cache Test',
        }),
      };

      addDynamicConnectorsToCache(dynamicTypes);

      const map = getCachedAllConnectorsMap();
      expect(map).not.toBeNull();
      expect(map?.has('map-cache-test')).toBe(true);
    });

    it('should skip reprocessing when types hash has not changed', () => {
      const dynamicTypes = {
        '.stable-hash-test': createMockConnectorTypeInfo({
          actionTypeId: '.stable-hash-test',
          displayName: 'Stable Hash',
        }),
      };

      addDynamicConnectorsToCache(dynamicTypes);
      const firstMap = getCachedAllConnectorsMap();

      addDynamicConnectorsToCache(dynamicTypes);
      const secondMap = getCachedAllConnectorsMap();

      expect(firstMap).toBe(secondMap);
    });

    it('should rebuild cache when enabled flag changes', () => {
      addDynamicConnectorsToCache({
        '.toggle-test': createMockConnectorTypeInfo({
          actionTypeId: '.toggle-test',
          displayName: 'Toggle Test',
        }),
      });
      const firstMap = getCachedAllConnectorsMap();
      expect(firstMap?.has('toggle-test')).toBe(true);

      addDynamicConnectorsToCache({
        '.toggle-test': createMockConnectorTypeInfo({
          actionTypeId: '.toggle-test',
          displayName: 'Toggle Test',
          enabled: false,
        }),
      });
      const secondMap = getCachedAllConnectorsMap();
      expect(secondMap).not.toBe(firstMap);
      expect(secondMap?.has('toggle-test')).toBe(false);
    });

    it('should handle dynamic connectors with sub-actions', () => {
      const dynamicTypes = {
        '.sub-action-test': createMockConnectorTypeInfo({
          actionTypeId: '.sub-action-test',
          displayName: 'Sub Action Test',
          subActions: [
            { name: 'doA', displayName: 'Do A' },
            { name: 'doB', displayName: 'Do B' },
          ],
        }),
      };

      addDynamicConnectorsToCache(dynamicTypes);

      const map = getCachedAllConnectorsMap();
      expect(map?.has('sub-action-test.doA')).toBe(true);
      expect(map?.has('sub-action-test.doB')).toBe(true);
    });

    it('should allow lookup by type after caching', () => {
      const dynamicTypes = {
        '.lookup-test': createMockConnectorTypeInfo({
          actionTypeId: '.lookup-test',
          displayName: 'Lookup Test',
        }),
      };

      addDynamicConnectorsToCache(dynamicTypes);

      const map = getCachedAllConnectorsMap();
      const connector = map?.get('lookup-test');
      expect(connector).toBeDefined();
      expect(connector?.summary).toBe('Lookup Test');
    });
  });

  describe('registered step definitions (public)', () => {
    const longDescription =
      'Transform an array of items by applying a step to each one. Useful for shaping data.';
    const publicStepDefinition = {
      id: 'data.test_map',
      label: 'Map Collection',
      description: longDescription,
      category: StepCategory.Data,
      inputSchema: z.object({}),
      outputSchema: z.any(),
    };

    let originalGetAll: typeof stepSchemas.getAllRegisteredStepDefinitions;
    let originalGetByType: typeof stepSchemas.getStepDefinition;

    beforeAll(() => {
      originalGetAll = stepSchemas.getAllRegisteredStepDefinitions.bind(stepSchemas);
      originalGetByType = stepSchemas.getStepDefinition.bind(stepSchemas);

      stepSchemas.getAllRegisteredStepDefinitions = () => [publicStepDefinition] as never;
      stepSchemas.getStepDefinition = (stepTypeId: string) =>
        stepTypeId === publicStepDefinition.id ? (publicStepDefinition as never) : undefined;

      // Force the all-connectors cache to be rebuilt with the registered step.
      stepSchemas.setAllConnectorsCache(null);
      stepSchemas.setAllConnectorsMapCache(null);
    });

    afterAll(() => {
      stepSchemas.getAllRegisteredStepDefinitions = originalGetAll;
      stepSchemas.getStepDefinition = originalGetByType;
      stepSchemas.setAllConnectorsCache(null);
      stepSchemas.setAllConnectorsMapCache(null);
    });

    it('exposes the short label as `summary` and the long description as `description`', () => {
      const connectors = getAllConnectorsInternal();
      const registered = connectors.find((c) => c.type === publicStepDefinition.id);

      expect(registered).toBeDefined();
      expect(registered?.summary).toBe('Map Collection');
      expect(registered?.description).toBe(longDescription);
    });
  });
});
