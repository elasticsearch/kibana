/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { groupingModeSchema, MATCHER_CONTEXT_FIELDS } from '@kbn/alerting-v2-schemas';
import type { ActionPolicyWorkflowPayload, AlertEpisode } from '../../lib/dispatcher/types';
import {
  generateApiSchemaDoc,
  generateOperationsDoc,
  generateOperationsUsageList,
  generateRuleSchemaDoc,
  generateRuleOperationsDoc,
  generateRuleOperationsUsageList,
  generateRuleKindDoc,
  generateEpisodeLifecycleDoc,
  generateStateTransitionDoc,
  generateRecoveryStrategyDoc,
  generateNoDataStrategyDoc,
  generateSeverityDoc,
  generateActionPolicySchemaDoc,
  generateGroupingModesDoc,
  generateThrottleStrategiesDoc,
  generateThrottleGroupingCompatibilityDoc,
  generateMatcherContextDoc,
  getSeverityValues,
  getDescribedEnumValues,
  generateActionPolicyOperationsDoc,
  generateActionPolicyWorkflowPayloadDoc,
  generateNotificationsOverviewDoc,
  generateWorkflowDestinationsDoc,
  generateDispatchFlowDoc,
  generateSingleRuleActionPolicyDoc,
  generateMultiRuleActionPolicyDoc,
} from './schema_to_skill_docs';

/**
 * Drift-guard: if `ActionPolicyWorkflowPayload` / `AlertEpisode` gain or lose a
 * field, these maps cause a TypeScript compile error — forcing the generated
 * skill docs assertions to be updated in lockstep.
 */
const payloadKeyGuard: Record<keyof ActionPolicyWorkflowPayload, true> = {
  id: true,
  policyId: true,
  groupKey: true,
  episodes: true,
  rules: true,
};

const episodeKeyGuard: Record<keyof AlertEpisode, true> = {
  last_event_timestamp: true,
  rule_id: true,
  source: true,
  space_id: true,
  group_hash: true,
  episode_id: true,
  episode_status: true,
  severity: true,
  data: true,
};

describe('schema_to_skill_docs', () => {
  describe('generateApiSchemaDoc', () => {
    const exampleApiSchema = z.object({
      name: z.string().min(1).max(64).describe('Display name.'),
      enabled: z.boolean().optional().describe('Whether the resource is enabled.'),
    });

    it('renders title and top-level field table', () => {
      const doc = generateApiSchemaDoc({
        title: 'Example API Schema Reference',
        schema: exampleApiSchema,
      });

      expect(doc).toContain('# Example API Schema Reference');
      expect(doc).toContain('## Top-Level Fields');
      expect(doc).toContain(
        '| `name` | string | required | Display name. (min length: 1, max length: 64) |'
      );
      expect(doc).toContain(
        '| `enabled` | boolean | optional | Whether the resource is enabled. |'
      );
    });

    it('renders nullable fields as a type union, keeping array item types', () => {
      const doc = generateApiSchemaDoc({
        title: 'Nullable Example',
        schema: z.object({
          matcher: z.string().nullable().describe('KQL query, or null for a catch-all.'),
          groupBy: z.array(z.string()).nullable().describe('Grouping fields.'),
        }),
      });

      expect(doc).toContain(
        '| `matcher` | string \\| null | required | KQL query, or null for a catch-all. |'
      );
      expect(doc).toContain('| `groupBy` | string[] \\| null | required | Grouping fields. |');
    });

    it('escapes union separators so each cell stays a single table column', () => {
      const doc = generateApiSchemaDoc({
        title: 'Enum Example',
        schema: z.object({ mode: z.enum(['a', 'b', 'c']).describe('Mode.') }),
      });

      const rows = doc.split('\n').filter((line) => line.startsWith('| `mode`'));
      expect(rows).toEqual([
        '| `mode` | "a" \\| "b" \\| "c" | required | Mode. (enum: a \\| b \\| c) |',
      ]);
      // Unescaped `|` would split the enum cells into extra columns.
      expect(rows[0].split(/(?<!\\)\|/).length - 2).toBe(4);
    });

    it('escapes backslashes so they cannot consume the escape added for a following pipe', () => {
      const doc = generateApiSchemaDoc({
        title: 'Pattern Example',
        schema: z.object({
          code: z
            .string()
            .regex(/^a\|b$/)
            .describe('Code.'),
        }),
      });

      // `\\` renders as a literal backslash and `\|` as a literal pipe, so the cell holds `^a\|b$`.
      expect(doc).toContain('| `code` | string | required | Code. (pattern: ^a\\\\\\|b$) |');
    });

    it('appends extra sections from the converted JSON schema', () => {
      const doc = generateApiSchemaDoc({
        title: 'Example API Schema Reference',
        schema: exampleApiSchema,
        extraSections: () => [{ heading: 'Notes', content: 'Extra guidance for the agent.' }],
      });

      expect(doc).toContain('## Notes');
      expect(doc).toContain('Extra guidance for the agent.');
    });
  });

  describe('generateOperationsDoc', () => {
    const exampleOperationSchema = z.discriminatedUnion('operation', [
      z
        .object({
          operation: z.literal('set_name'),
          name: z.string().min(1).max(64).describe('Display name.'),
        })
        .describe('Display name of the resource.'),
      z
        .object({
          operation: z.literal('validate'),
        })
        .describe('Validates the accumulated resource against the API request schema.'),
    ]);

    it('renders title and discriminated operation variants', () => {
      const doc = generateOperationsDoc({
        title: 'Example Operations Schema Reference',
        schema: exampleOperationSchema,
      });

      expect(doc).toContain('# Example Operations Schema Reference');
      expect(doc).toContain('#### `operation: "set_name"`');
      expect(doc).toContain('Display name of the resource.');
      expect(doc).toContain('#### `operation: "validate"`');
      expect(doc).toContain(
        '| `name` | string | required | Display name. (min length: 1, max length: 64) |'
      );
      expect(doc).toContain('| `operation` | "set_name" | required |');
      expect(doc).toMatch(
        /#### `operation: "set_name"`\n\nDisplay name of the resource.\n\n\| Field \|/
      );
    });

    it('throws when an operation variant is missing a top-level describe', () => {
      const schema = z.discriminatedUnion('operation', [
        z.object({
          operation: z.literal('set_name'),
          name: z.string(),
        }),
      ]);

      expect(() =>
        generateOperationsDoc({
          title: 'Missing Describe',
          schema,
        })
      ).toThrow(/Missing \.describe\(\) on operation variant\(s\): set_name/);
    });
  });

  describe('generateOperationsUsageList', () => {
    const exampleOperationSchema = z.discriminatedUnion('operation', [
      z
        .object({
          operation: z.literal('set_name'),
          name: z.string(),
        })
        .describe('Use `set_name` to name the resource.'),
      z
        .object({
          operation: z.literal('validate'),
        })
        .describe('Use `validate` as the last operation to confirm the resource is ready to save.'),
    ]);

    it('renders each operation .describe() as a bullet', () => {
      const doc = generateOperationsUsageList({
        title: 'Example Operations',
        schema: exampleOperationSchema,
      });

      expect(doc).toBe(
        [
          '- Use `set_name` to name the resource.',
          '- Use `validate` as the last operation to confirm the resource is ready to save.',
        ].join('\n')
      );
    });

    it('throws when an operation variant is missing a top-level describe', () => {
      const schema = z.discriminatedUnion('operation', [
        z.object({
          operation: z.literal('set_name'),
          name: z.string(),
        }),
      ]);

      expect(() =>
        generateOperationsUsageList({
          title: 'Missing Describe',
          schema,
        })
      ).toThrow(/Missing \.describe\(\) on operation variant\(s\): set_name/);
    });
  });

  describe('getDescribedEnumValues', () => {
    it('returns each literal value with its .describe() copy', () => {
      const schema = z.union([
        z.literal('inactive').describe('Fully recovered'),
        z.literal('active').describe('Alert is firing'),
      ]);

      expect(getDescribedEnumValues(schema, 'exampleStatusSchema')).toEqual([
        { value: 'inactive', description: 'Fully recovered' },
        { value: 'active', description: 'Alert is firing' },
      ]);
    });

    it('throws when a literal is missing .describe()', () => {
      const schema = z.union([
        z.literal('inactive').describe('Fully recovered'),
        z.literal('pending'),
      ]);

      expect(() => getDescribedEnumValues(schema, 'exampleStatusSchema')).toThrow(
        /Missing \.describe\(\) on exampleStatusSchema value\(s\): pending/
      );
    });

    it('throws when the schema is not a union of literals', () => {
      expect(() => getDescribedEnumValues(z.enum(['a', 'b']), 'exampleStatusSchema')).toThrow(
        /exampleStatusSchema is not a union of described literals/
      );
    });
  });

  describe('generateRuleSchemaDoc', () => {
    it('matches the snapshot', () => {
      expect(generateRuleSchemaDoc()).toMatchSnapshot();
    });
  });

  describe('generateRuleOperationsDoc', () => {
    it('matches the snapshot', () => {
      expect(generateRuleOperationsDoc()).toMatchSnapshot();
    });

    it('includes all operation types', () => {
      const doc = generateRuleOperationsDoc();
      expect(doc).toContain('set_metadata');
      expect(doc).toContain('set_kind');
      expect(doc).toContain('set_schedule');
      expect(doc).toContain('set_query');
      expect(doc).toContain('set_grouping');
      expect(doc).toContain('set_state_transition');
      expect(doc).toContain('set_dashboards');
      expect(doc).toContain('set_runbook');
      expect(doc).toContain('validate');
    });

    it('includes pending_count and recovering_count fields', () => {
      const doc = generateRuleOperationsDoc();
      expect(doc).toContain('pending_count');
      expect(doc).toContain('recovering_count');
    });

    it('describes each operation in terms of the user goal it solves', () => {
      const doc = generateRuleOperationsDoc();
      expect(doc).toContain(
        'Use `set_state_transition` to delay alert firing until the threshold is breached N times in a row. This reduces noise from transient spikes. State transition is only allowed on `kind: alert` rules.'
      );
      expect(doc).toContain("Use `set_kind` to choose a rule kind matching the user's goal");
    });
  });

  describe('generateRuleOperationsUsageList', () => {
    it('includes every manage_rule operation describe', () => {
      const doc = generateRuleOperationsUsageList();
      expect(doc).toContain('Use `set_metadata`');
      expect(doc).toContain('Use `set_kind`');
      expect(doc).toContain('Use `set_schedule`');
      expect(doc).toContain('Use `set_query`');
      expect(doc).toContain('Use `set_grouping`');
      expect(doc).toContain('Use `set_state_transition`');
      expect(doc).toContain('Use `set_dashboards`');
      expect(doc).toContain('Use `set_runbook`');
      expect(doc).toContain('Use `validate`');
    });
  });

  describe('getSeverityValues', () => {
    it('matches the snapshot', () => {
      expect(getSeverityValues().join(', ')).toMatchInlineSnapshot(
        `"info, low, medium, high, critical"`
      );
    });
  });

  describe('generateActionPolicySchemaDoc', () => {
    /**
     * Snapshot of the generated skill markdown for the action policy create API
     * schema (`createActionPolicyDataSchema` from `@kbn/alerting-v2-schemas`).
     *
     * This snapshot exists so reviewers can verify the LLM-facing docs look
     * correct — field names, types, required/optional flags, descriptions, and
     * constraints. When the upstream Zod schema changes, regenerate with `-u`
     * and review the diff for accuracy before landing.
     */
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateActionPolicySchemaDoc()).toMatchSnapshot();
    });

    it('includes key field names', () => {
      const doc = generateActionPolicySchemaDoc();
      expect(doc).toContain('`name`');
      expect(doc).toContain('`destinations`');
      expect(doc).toContain('`matcher`');
      expect(doc).toContain('`grouping_mode`');
      expect(doc).toContain('`throttle`');
    });
  });

  /**
   * Every schema carrying a `.meta({ id })` — added so the OAS emits named
   * components — is hoisted into `definitions` / `$defs` by `z.toJSONSchema`
   * and replaced by a `$ref` (`#/definitions/...` or `#/$defs/...`). These
   * docs are read by an LLM, so the pointers have to be expanded back into
   * real types rather than rendered as `unknown`.
   */
  describe('schemas extracted into `definitions` / `$defs`', () => {
    const allDocs = () => [
      generateRuleSchemaDoc(),
      generateRuleOperationsDoc(),
      generateActionPolicySchemaDoc(),
      generateActionPolicyOperationsDoc(),
      generateActionPolicyWorkflowPayloadDoc(),
    ];

    // Matched on the pointer prefixes rather than the `$ref` keyword: authored workflow YAML
    // legitimately contains `$ref: '#/kibana/definitions/...'` as an input contract.
    it('never leaves an unresolved pointer or type in any doc', () => {
      for (const doc of allDocs()) {
        expect(doc).not.toContain('#/definitions/');
        expect(doc).not.toContain('#/$defs/');
        expect(doc).not.toContain('| unknown');
        expect(doc).not.toContain('unknown[]');
      }
    });

    it('renders referenced object schemas with their type and description', () => {
      const doc = generateRuleSchemaDoc();
      expect(doc).toContain('| `metadata` | object | required | Rule metadata. |');
      expect(doc).toContain(
        '| `schedule` | object | required | Execution schedule configuration. |'
      );
    });

    it('renders a referenced discriminated union as its variants', () => {
      expect(generateRuleSchemaDoc()).toContain(
        '| `query` | { format: "composed", ... } \\| { format: "standalone", ... } | required | Detection query configuration. |'
      );
      expect(generateRuleOperationsDoc()).toContain(
        '| `query` | { format: "composed", ... } \\| { format: "standalone", ... } | required | Detection query configuration. |'
      );
    });

    it('expands the variant tables of a referenced union', () => {
      const doc = generateRuleSchemaDoc();
      expect(doc).toContain('## Query Formats');
      expect(doc).toContain('#### `format: "composed"`');
      expect(doc).toContain('#### `format: "standalone"`');
      expect(doc).toContain(
        '| `base` | string | required | Base ES\\|QL query. Time filters are applied automatically via the lookback window. (min length: 1, max length: 10000) |'
      );
    });

    it('renders arrays whose items are referenced schemas', () => {
      expect(generateRuleSchemaDoc()).toContain(
        '| `artifacts` | object[] | optional | Artifacts attached to the rule, each shaped as `{ id, type, data }`. `data` is a type-specific object (for example a `runbook` may carry `content`, a `dashboard` may carry `dashboard_id`). Per-type shape is validated by the artifact-type registry when the type is registered; unregistered types pass through with envelope bounds only. (max items: 100) |'
      );
      expect(generateActionPolicySchemaDoc()).toContain(
        '| `destinations` | { type: "workflow", ... }[] | required | The list of destinations. At least one is required. (min items: 1, max items: 10) |'
      );
    });

    it('merges a reference with the sibling keys draft-7 moves into `allOf`', () => {
      expect(generateRuleSchemaDoc()).toContain(
        '| `grouping` | object | optional | Grouping configuration. |'
      );
      expect(generateActionPolicySchemaDoc()).toContain(
        '| `throttle` | object | optional | The throttle configuration for notifications. |'
      );
    });

    it('keeps the referencing field description when the definition also has one', () => {
      const doc = generateActionPolicySchemaDoc();
      expect(doc).toContain(
        '| `grouping_mode` | "per_episode" \\| "all" \\| "per_field" | optional | The grouping mode for alert notifications. |'
      );
      expect(doc).not.toContain('per_episode groups by episode lifecycle');
    });
  });

  describe('generateActionPolicyOperationsDoc', () => {
    /**
     * Snapshot of the generated skill markdown for `manage_action_policy`
     * operations (`actionPolicyOperationSchema`).
     *
     * Review the diff when regenerating with `-u` — this is LLM-facing docs.
     */
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateActionPolicyOperationsDoc()).toMatchSnapshot();
    });

    it('includes all operation types', () => {
      const doc = generateActionPolicyOperationsDoc();
      expect(doc).toContain('set_metadata');
      expect(doc).toContain('set_destinations');
      expect(doc).toContain('set_matcher');
      expect(doc).toContain('set_grouping');
      expect(doc).toContain('set_throttle');
      expect(doc).toContain('validate');
    });

    it('renders Zod literals (JSON Schema const) as quoted types, not bare string', () => {
      const doc = generateActionPolicyOperationsDoc();
      // z.literal('set_metadata') → { const: "set_metadata" } → Type column "set_metadata"
      expect(doc).toContain('| `operation` | "set_metadata" | required |');
      expect(doc).not.toMatch(/\| `operation` \| string \|/);
    });
  });

  describe('generateRuleKindDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateRuleKindDoc()).toMatchSnapshot();
    });

    it('uses product labels from RULE_KIND_LABELS', () => {
      const doc = generateRuleKindDoc();
      expect(doc).toContain('### Alerts (`kind: alert`)');
      expect(doc).toContain('### Events (`kind: signal`)');
      expect(doc).not.toContain('### Signal (`kind: signal`)');
    });
  });

  describe('generateNotificationsOverviewDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateNotificationsOverviewDoc()).toMatchSnapshot();
    });

    it('uses product labels and distinguishes draft vs persisted kind changes', () => {
      const doc = generateNotificationsOverviewDoc();
      expect(doc).toContain('Alerts (`kind: alert`)');
      expect(doc).toContain('Events (`kind: signal`)');
      expect(doc).toContain('**Explain the difference**');
      expect(doc).toContain(
        'If the rule is a **draft (in-memory)**: use `set_kind` to change it to `alert`'
      );
      expect(doc).toContain('If the rule is **persisted**: `kind` is immutable after creation');
      expect(doc).toContain('existing Events (`kind: signal`) rule cannot be converted');
      expect(doc).toContain('After ensuring the rule is `kind: alert`');
    });

    it('links sibling references without a ./references/ prefix', () => {
      const doc = generateNotificationsOverviewDoc();
      expect(doc).toContain('(./rule-kind.md)');
      expect(doc).toContain('(./episode-lifecycle.md)');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('generateEpisodeLifecycleDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateEpisodeLifecycleDoc()).toMatchSnapshot();
    });
  });

  describe('generateRecoveryStrategyDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateRecoveryStrategyDoc()).toMatchSnapshot();
    });

    it('links sibling references without a ./references/ prefix', () => {
      const doc = generateRecoveryStrategyDoc();
      expect(doc).toContain('(./episode-lifecycle.md)');
      expect(doc).toContain('(./rule-kind.md)');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('generateNoDataStrategyDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateNoDataStrategyDoc()).toMatchSnapshot();
    });

    it('links sibling references without a ./references/ prefix', () => {
      const doc = generateNoDataStrategyDoc();
      expect(doc).toContain('(./rule-kind.md)');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('generateSeverityDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateSeverityDoc()).toMatchSnapshot();
    });
  });

  describe('generateGroupingModesDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateGroupingModesDoc()).toMatchSnapshot();
    });

    it('is a standalone reference that links to throttle compatibility', () => {
      const doc = generateGroupingModesDoc();
      expect(doc).toContain('# Grouping Modes');
      expect(doc).toContain('action-policy-throttle-grouping-compatibility.md');
    });
  });

  describe('generateThrottleStrategiesDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateThrottleStrategiesDoc()).toMatchSnapshot();
    });

    it('links to the dedicated compatibility reference', () => {
      const doc = generateThrottleStrategiesDoc();
      expect(doc).toContain('# Throttle Strategies');
      expect(doc).toContain('action-policy-throttle-grouping-compatibility.md');
    });
  });

  describe('generateMatcherContextDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateMatcherContextDoc()).toMatchSnapshot();
    });

    it('documents every MATCHER_CONTEXT_FIELDS path', () => {
      const doc = generateMatcherContextDoc();
      for (const field of MATCHER_CONTEXT_FIELDS) {
        expect(doc).toContain(`\`${field.path}\``);
      }
    });

    it('enriches episode_status and severity with schema enum values', () => {
      const doc = generateMatcherContextDoc();
      expect(doc).toContain('`active`');
      expect(doc).toContain('`critical`');
    });
  });

  describe('generateThrottleGroupingCompatibilityDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateThrottleGroupingCompatibilityDoc()).toMatchSnapshot();
    });

    it('documents every grouping mode from the schema, then lists caveats', () => {
      const doc = generateThrottleGroupingCompatibilityDoc();
      expect(doc).toContain('# Throttle / Grouping Compatibility');
      expect(doc).toContain('Caveats:');
      expect(doc).toContain('set_grouping');
      expect(doc).toContain('set_throttle');

      for (const { value } of getDescribedEnumValues(groupingModeSchema, 'groupingModeSchema')) {
        expect(doc).toContain(`- \`${value}\`:`);
      }
    });
  });

  describe('generateWorkflowDestinationsDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateWorkflowDestinationsDoc()).toMatchSnapshot();
    });

    it('requires manual triggers and workflow IDs rather than connector IDs', () => {
      const doc = generateWorkflowDestinationsDoc();
      expect(doc).toContain('# Workflows');
      expect(doc).toContain('workflow IDs');
      expect(doc).toContain('triggers: - type: manual');
      expect(doc).toContain('workflow-authoring');
    });
  });

  describe('generateDispatchFlowDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateDispatchFlowDoc()).toMatchSnapshot();
    });

    it('covers matcher, grouping, throttle, and workflow dispatch', () => {
      const doc = generateDispatchFlowDoc();
      expect(doc).toContain('# Dispatch Flow');
      expect(doc).toContain('Matcher evaluation');
      expect(doc).toContain('scheduleWorkflow');
      expect(doc).toContain("type == 'alert'");
    });
  });

  describe('generateSingleRuleActionPolicyDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateSingleRuleActionPolicyDoc()).toMatchSnapshot();
    });

    it('scopes with rule.id and defers shared policies to the multi-rule reference', () => {
      const doc = generateSingleRuleActionPolicyDoc();
      expect(doc).toContain('# Single-rule Action Policies');
      expect(doc).toContain('set_metadata');
      expect(doc).toContain('set_destinations');
      expect(doc).toContain('rule.id:');
      expect(doc).toContain('kind: signal');
      expect(doc).toContain('(./action-policy-multi-rule.md)');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('generateMultiRuleActionPolicyDoc', () => {
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateMultiRuleActionPolicyDoc()).toMatchSnapshot();
    });

    it('covers catch-all, tag, and severity matchers and links siblings without a ./references/ prefix', () => {
      const doc = generateMultiRuleActionPolicyDoc();
      expect(doc).toContain('# Multi-rule Action Policies');
      expect(doc).toContain('Catch-all');
      expect(doc).toContain('rule.tags');
      expect(doc).toContain('(./action-policy-matchers.md)');
      expect(doc).toContain('(./action-policy-single-rule.md)');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('generateActionPolicyWorkflowPayloadDoc', () => {
    /**
     * Snapshot of the generated skill markdown for the action-policy → workflow
     * dispatch payload (`ActionPolicyWorkflowPayload` / `AlertEpisode`).
     *
     * This snapshot exists so reviewers can verify the LLM-facing docs look
     * correct — field names, types, required/optional flags, descriptions, and
     * Liquid access guidance. When the upstream schema changes
     * (`alertingV2NotificationGroup` / dispatcher types), regenerate with
     * `-u` and review the diff for accuracy before landing.
     */
    it('matches the reviewed skill-doc snapshot', () => {
      expect(generateActionPolicyWorkflowPayloadDoc()).toMatchSnapshot();
    });

    it('documents every ActionPolicyWorkflowPayload top-level field', () => {
      const doc = generateActionPolicyWorkflowPayloadDoc();
      for (const field of Object.keys(payloadKeyGuard)) {
        expect(doc).toContain(`\`${field}\``);
      }
    });

    it('documents every AlertEpisode field', () => {
      const doc = generateActionPolicyWorkflowPayloadDoc();
      for (const field of Object.keys(episodeKeyGuard)) {
        expect(doc).toContain(`\`${field}\``);
      }
    });

    it('documents rule_id as nullable, since external-alert episodes have no rule', () => {
      const doc = generateActionPolicyWorkflowPayloadDoc();
      expect(doc).toContain('| `rule_id` | string \\| null | required |');
    });

    it('documents the inputs.payload Liquid access pattern', () => {
      const doc = generateActionPolicyWorkflowPayloadDoc();
      expect(doc).toContain('inputs.payload');
    });

    it('adds data-field notes and an example without a separate Liquid cookbook', () => {
      const doc = generateActionPolicyWorkflowPayloadDoc();
      expect(doc).toContain('### `data`');
      expect(doc).toContain('ep.data.host.name');
      expect(doc).toContain('| LIMIT 0');
      expect(doc).toContain('## Example');
      expect(doc).toContain('```yaml');
      expect(doc).toContain('inputs.payload.rules[ep.rule_id].name');
      expect(doc).not.toContain('## Liquid Templates');
      expect(doc).not.toContain('./references/');
    });
  });

  describe('Alerting v2 agent builder start contract', () => {
    it.each([
      ['zodToJsonSchema via generateRuleSchemaDoc', generateRuleSchemaDoc],
      ['zodToJsonSchema via generateActionPolicySchemaDoc', generateActionPolicySchemaDoc],
      ['manage_rule operation .describe()', generateRuleOperationsDoc],
      ['manage_rule operation usage list', generateRuleOperationsUsageList],
      ['manage_action_policy operation .describe()', generateActionPolicyOperationsDoc],
      ['generateEnumTable (episode status from spec)', generateEpisodeLifecycleDoc],
      ['generateEnumTable (no-data strategy from spec)', generateNoDataStrategyDoc],
      ['generateEnumList (recovery strategy from spec)', generateRecoveryStrategyDoc],
      ['generateEnumList (grouping modes from spec)', generateGroupingModesDoc],
      ['generateEnumList (throttle strategies from spec)', generateThrottleStrategiesDoc],
      ['generateWorkflowDestinationsDoc', generateWorkflowDestinationsDoc],
      ['generateDispatchFlowDoc', generateDispatchFlowDoc],
      ['generateSingleRuleActionPolicyDoc', generateSingleRuleActionPolicyDoc],
      ['generateMultiRuleActionPolicyDoc', generateMultiRuleActionPolicyDoc],
      ['generateRuleKindDoc from spec', generateRuleKindDoc],
      ['generateNotificationsOverviewDoc from spec', generateNotificationsOverviewDoc],
      ['generateStateTransitionDoc field .describe()', generateStateTransitionDoc],
      [
        'generateActionPolicyWorkflowPayloadDoc workflow input definition',
        generateActionPolicyWorkflowPayloadDoc,
      ],
    ] as const)('%s does not throw', (_label, generate) => {
      expect(generate()).toEqual(expect.any(String));
    });
  });
});
