/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type TestElasticsearchUtils,
  type TestKibanaUtils,
} from '@kbn/core-test-helpers-kbn-server';
import { uniq } from 'lodash';
import { z } from '@kbn/zod/v4';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { setupTestServers } from './lib';
import type { RuleTypeRegistry } from '../rule_type_registry';

jest.mock('../rule_type_registry', () => {
  const actual = jest.requireActual('../rule_type_registry');
  return {
    ...actual,
    RuleTypeRegistry: jest.fn().mockImplementation((opts) => {
      return new actual.RuleTypeRegistry(opts);
    }),
  };
});

/**
 * These rule types are manually updated.
 *
 * TODO: We should spin up three serverless projects and pull the rule types
 * directly from them to ensure the list below remains up to date. We will still
 * need a copied list of rule types here because they are needed to write
 * test scenarios below.
 */
const ruleTypesInEsProjects: string[] = [
  '.index-threshold',
  '.geo-containment',
  '.es-query',
  'transform_health',
];
const ruleTypesInObltProjects: string[] = [
  '.index-threshold',
  '.geo-containment',
  '.es-query',
  'transform_health',
  'xpack.ml.anomaly_detection_alert',
  'xpack.ml.anomaly_detection_jobs_health',
  'slo.rules.burnRate',
  'observability.rules.custom_threshold',
  'metrics.alert.inventory.threshold',
  'apm.error_rate',
  'apm.transaction_error_rate',
  'apm.transaction_duration',
  'apm.anomaly',
];
const ruleTypesInSecurityProjects: string[] = [
  '.index-threshold',
  '.geo-containment',
  '.es-query',
  'transform_health',
  'xpack.ml.anomaly_detection_alert',
  'xpack.ml.anomaly_detection_jobs_health',
  'siem.notifications',
  'siem.eqlRule',
  'siem.indicatorRule',
  'siem.mlRule',
  'siem.queryRule',
  'siem.savedQueryRule',
  'siem.thresholdRule',
  'siem.newTermsRule',
];

/**
 * Recursively replaces lazySchema Proxy wrappers with real Zod schema instances
 * so that z.toJSONSchema() works correctly.
 *
 * lazySchema() wraps schemas in a Proxy (target: empty `{}`). z.toJSONSchema()
 * keys its internal seen-map by object identity: it stores the proxy, but the
 * processJSONSchema closure captures the real materialized instance — so the
 * lookup fails and throws. Converting proxies to real instances before calling
 * z.toJSONSchema() avoids the mismatch.
 */
function resolveSchemaProxies(schema: z.ZodType): z.ZodType {
  if (!schema || typeof schema !== 'object') return schema;

  const zod = (
    schema as unknown as {
      _zod?: { def?: { type?: string }; constr?: new (def: unknown) => z.ZodType };
    }
  )._zod;
  if (!zod?.def) return schema;

  if (Object.getPrototypeOf(schema) === Object.prototype) {
    return new zod.constr!(zod.def);
  }

  const def = zod.def as Record<string, unknown>;
  switch (def.type) {
    case 'intersection': {
      const left = resolveSchemaProxies(def.left as z.ZodType);
      const right = resolveSchemaProxies(def.right as z.ZodType);
      if (left === def.left && right === def.right) return schema;
      return new zod.constr!({ ...def, left, right });
    }
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const newShape: Record<string, z.ZodType> = {};
      let changed = false;
      for (const key of Object.keys(shape)) {
        const resolved = resolveSchemaProxies(shape[key]);
        newShape[key] = resolved;
        if (resolved !== shape[key]) changed = true;
      }
      if (!changed) return schema;
      return new zod.constr!({ ...def, shape: newShape });
    }
    default:
      return schema;
  }
}

describe('Serverless upgrade and rollback checks', () => {
  let esServer: TestElasticsearchUtils;
  let kibanaServer: TestKibanaUtils;
  let ruleTypeRegistry: RuleTypeRegistry;
  const ruleTypesToCheck: string[] = uniq(
    ruleTypesInEsProjects.concat(ruleTypesInObltProjects).concat(ruleTypesInSecurityProjects)
  );

  beforeAll(async () => {
    const setupResult = await setupTestServers();
    esServer = setupResult.esServer;
    kibanaServer = setupResult.kibanaServer;

    const mockedRuleTypeRegistry = jest.requireMock('../rule_type_registry');
    expect(mockedRuleTypeRegistry.RuleTypeRegistry).toHaveBeenCalledTimes(1);
    ruleTypeRegistry = mockedRuleTypeRegistry.RuleTypeRegistry.mock.results[0].value;
  });

  afterAll(async () => {
    if (kibanaServer) {
      await kibanaServer.stop();
    }
    if (esServer) {
      await esServer.stop();
    }
  });

  for (const ruleTypeId of ruleTypesToCheck) {
    test(`detect param changes to review for: ${ruleTypeId}`, async () => {
      const ruleType = ruleTypeRegistry.get(ruleTypeId);
      if (!ruleType?.schemas?.params) {
        throw new Error('schema.params is required for rule type:' + ruleTypeId);
      }
      const schemaType = ruleType.schemas.params.type;
      if (schemaType === 'config-schema') {
        expect(ruleType.schemas.params.schema.getSchema().describe()).toMatchSnapshot();
      } else if (schemaType === 'zod') {
        const schema = ruleType.schemas.params.schema;
        let jsonSchema: Record<string, unknown>;
        if (schema && typeof schema === 'object' && '_zod' in schema) {
          // Zod v4 schema
          const resolvedSchema = resolveSchemaProxies(schema as z.ZodType);
          const { $schema, ...rest } = z.toJSONSchema(resolvedSchema, {
            unrepresentable: 'any',
            io: 'input',
            reused: 'ref',
          }) as Record<string, unknown>;
          jsonSchema = rest;
        } else {
          // Zod v3 schema — use zod-to-json-schema
          const { $schema, ...rest } = zodToJsonSchema(schema) as Record<string, unknown>;
          jsonSchema = rest;
        }
        expect(jsonSchema).toMatchSnapshot();
      } else {
        throw new Error(`Support for ${schemaType} missing`);
      }
    });
  }
});
