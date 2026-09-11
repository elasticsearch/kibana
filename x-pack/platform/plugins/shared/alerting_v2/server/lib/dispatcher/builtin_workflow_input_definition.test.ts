/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Drift-guard for `alertingV2NotificationGroup`.
 *
 * Same shape as the action-policy skill-doc tests:
 * 1. Snapshot the JSON Schema so reviewers see field names, types, required,
 *    enums, and `additionalProperties` when it changes (`-u`, then review).
 * 2. `Required<…>` example objects: a new type field fails compile here.
 *    After the example is updated, the key assertions fail until the JSON
 *    Schema lists that field. The snapshot does not catch type-only adds.
 */

import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  builtinWorkflowInputDefinitions,
  type JsonSchema,
} from '@kbn/workflows';
import { alertEpisodeStatus, alertEventSeverity } from '../../resources/datastreams/alert_events';
import type {
  ActionPolicyWorkflowPayload,
  ActionPolicyWorkflowPayloadRule,
  AlertEpisode,
} from './types';

const examplePayload: Required<ActionPolicyWorkflowPayload> = {
  id: 'group-1',
  policyId: 'policy-1',
  groupKey: {},
  episodes: [],
  rules: {},
};

const exampleEpisode: Required<AlertEpisode> = {
  last_event_timestamp: '2026-01-22T07:10:00.000Z',
  rule_id: 'rule-1',
  source: 'internal',
  space_id: 'default',
  group_hash: 'hash-1',
  episode_id: 'episode-1',
  episode_status: 'active',
  severity: 'critical',
  data: {},
};

const exampleRuleValue: Required<ActionPolicyWorkflowPayloadRule> = {
  name: 'CPU spike',
};

const episodeItemSchema = (schema: JsonSchema): JsonSchema => {
  const items = schema.properties?.episodes?.items;
  if (items == null || Array.isArray(items)) {
    throw new Error('expected episodes.items to be a single object schema');
  }
  return items;
};

const ruleValueSchema = (schema: JsonSchema): JsonSchema => {
  const additional = schema.properties?.rules?.additionalProperties;
  if (additional == null || typeof additional === 'boolean') {
    throw new Error('expected rules.additionalProperties to be a value schema');
  }
  return additional;
};

const SCHEMA_PATH =
  'src/platform/packages/shared/kbn-workflows/spec/builtin_workflow_input_definitions.ts';

const expectSchemaKeysMatchType = (
  schemaKeys: string[],
  typeKeys: string[],
  typeName: string
): void => {
  const missingFromSchema = typeKeys.filter((key) => !schemaKeys.includes(key));
  const extraOnSchema = schemaKeys.filter((key) => !typeKeys.includes(key));
  if (missingFromSchema.length === 0 && extraOnSchema.length === 0) {
    return;
  }

  const lines = [
    `Drift between ${typeName} and the alertingV2NotificationGroup JSON Schema.`,
    missingFromSchema.length > 0
      ? `Add these fields to the JSON Schema (${SCHEMA_PATH}): ${missingFromSchema.join(', ')}`
      : undefined,
    extraOnSchema.length > 0
      ? `Remove these fields from the JSON Schema, or add them to ${typeName}: ${extraOnSchema.join(
          ', '
        )}`
      : undefined,
  ].filter((line): line is string => line != null);

  throw new Error(lines.join('\n'));
};

describe('alertingV2NotificationGroup builtin workflow input definition', () => {
  const schema =
    builtinWorkflowInputDefinitions[ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID];

  /**
   * Snapshot of the built-in workflow input JSON Schema for the action-policy
   * dispatch payload. When the schema or dispatcher types change, regenerate
   * with `-u` and review the diff before landing.
   */
  it('matches the reviewed schema snapshot', () => {
    expect(schema).toMatchSnapshot();
  });

  it('exposes every ActionPolicyWorkflowPayload field', () => {
    expectSchemaKeysMatchType(
      Object.keys(schema.properties ?? {}),
      Object.keys(examplePayload),
      'ActionPolicyWorkflowPayload'
    );
  });

  it('exposes every AlertEpisode field on episode items', () => {
    expectSchemaKeysMatchType(
      Object.keys(episodeItemSchema(schema).properties ?? {}),
      Object.keys(exampleEpisode),
      'AlertEpisode'
    );
  });

  it('exposes every ActionPolicyWorkflowPayloadRule field on rules values', () => {
    expectSchemaKeysMatchType(
      Object.keys(ruleValueSchema(schema).properties ?? {}),
      Object.keys(exampleRuleValue),
      'ActionPolicyWorkflowPayloadRule'
    );
  });

  it('allows null rule_id on episode items (AlertEpisode.rule_id is RuleId | null)', () => {
    expect(episodeItemSchema(schema).properties?.rule_id?.type).toEqual(['string', 'null']);
  });

  it('locks episode_status enum to AlertEpisodeStatus', () => {
    expect([...(episodeItemSchema(schema).properties?.episode_status?.enum ?? [])].sort()).toEqual(
      Object.values(alertEpisodeStatus).sort()
    );
  });

  it('locks severity enum to AlertEventSeverity', () => {
    expect([...(episodeItemSchema(schema).properties?.severity?.enum ?? [])].sort()).toEqual(
      Object.values(alertEventSeverity).sort()
    );
  });
});
