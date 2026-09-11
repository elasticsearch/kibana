/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { createRuleDataSchema } from './rule_data_schema';
import { ruleTemplateDataSchema } from './rule_template_schema';

const exampleTemplateAttributes = {
  engine: 'v2' as const,
  rule: {
    kind: 'alert' as const,
    metadata: {
      name: '[Kubernetes OTel] Pod CrashLoopBackOff',
      description: 'Alerts when containers have a high restart count, indicating CrashLoopBackOff.',
      tags: ['Kubernetes'],
    },
    schedule: {
      every: '1m',
      lookback: '15m',
    },
    state_transition: {
      pending_count: 3,
    },
    recovery_strategy: 'no_breach' as const,
    artifacts: [
      {
        id: 'kubernetes_otel-pod-crashloopbackoff-v2-runbook',
        type: 'runbook',
        data: {
          content: '## Pod CrashLoopBackOff\n\n### Triage Steps\n1. Identify the affected pod(s).',
        },
      },
    ],
    query: {
      format: 'composed' as const,
      base: 'TS metrics-k8sclusterreceiver.otel-*\n| STATS restarts = MAX(k8s.container.restarts)\n    BY k8s.pod.name, k8s.container.name, k8s.namespace.name',
      breach: {
        segment:
          'WHERE restarts > 0\n| SORT restarts DESC\n| KEEP k8s.namespace.name, k8s.pod.name, k8s.container.name, restarts\n| LIMIT 50',
      },
    },
    grouping: {
      fields: ['k8s.pod.name', 'k8s.container.name', 'k8s.namespace.name'],
    },
    time_field: '@timestamp',
  },
};

describe('ruleTemplateDataSchema', () => {
  it('parses valid template attributes', () => {
    const result = ruleTemplateDataSchema.parse(exampleTemplateAttributes);
    expect(result.engine).toBe('v2');
    expect(result.rule.kind).toBe('alert');
  });

  it('rejects a v1 rule template', () => {
    const v1RuleTemplate = {
      name: 'Sample alerting rule template',
      tags: ['Testing'],
      description: 'This is a sample alerting rule template description',
      artifacts: {
        dashboards: [{ id: 'dash-1' }],
        investigation_guide: { blob: 'text' },
      },
      ruleTypeId: '.index-threshold',
      schedule: {
        interval: '1m',
      },
      params: {
        aggType: 'count',
        termSize: 5,
        thresholdComparator: '>',
        timeWindowSize: 5,
        timeWindowUnit: 'm',
        groupBy: 'all',
        threshold: [1000],
        index: ['logs-test-default'],
        timeField: '@timestamp',
      },
      alertDelay: {
        active: 1,
      },
    };

    expect(() => ruleTemplateDataSchema.parse(v1RuleTemplate)).toThrow();
  });

  it('rejects flat v2 create-rule attributes without a rule envelope', () => {
    expect(() =>
      ruleTemplateDataSchema.parse({
        engine: 'v2',
        ...exampleTemplateAttributes.rule,
      })
    ).toThrow();
  });

  it('applies create-rule refines under rule', () => {
    const { state_transition: _stateTransition, ...ruleWithoutStateTransition } =
      exampleTemplateAttributes.rule;

    expect(() =>
      ruleTemplateDataSchema.parse({
        engine: 'v2',
        rule: {
          ...ruleWithoutStateTransition,
          kind: 'signal',
          query: {
            format: 'standalone',
            breach: { query: 'FROM logs-* | KEEP @timestamp | LIMIT 1' },
          },
          recovery_strategy: 'no_breach',
        },
      })
    ).toThrow(/Signal rules cannot set recovery_strategy/);
  });
});

/**
 * Tripwire: template.rule must stay the full create-rule schema
 * (same Zod value, including refines), not a forked copy.
 */
describe('rule template create-rule schema coupling', () => {
  const toStableJsonSchema = (schema: z.ZodType) => {
    const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
      target: 'draft-7',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    return rest;
  };

  it('top-level keys are engine and rule', () => {
    expect(Object.keys(ruleTemplateDataSchema.shape).sort()).toEqual(['engine', 'rule']);
  });

  it('reuses create-rule schema by reference under rule', () => {
    if (ruleTemplateDataSchema.shape.rule !== createRuleDataSchema) {
      throw new Error(
        'Rule template field "rule" is not the same Zod schema as createRuleDataSchema. ' +
          'Keep ruleTemplateDataSchema = z.object({ engine, rule: createRuleDataSchema }).'
      );
    }
  });

  /**
   * Full structural snapshot of the create-rule schema.
   * When create-rule changes, update this snapshot and confirm the template
   * schema still nests the same schema under `rule`.
   */
  it('matches the snapshot of the full create-rule JSON schema', () => {
    expect({
      hint: 'Create-rule schema changed. Update this snapshot and confirm ruleTemplateDataSchema.rule still uses createRuleDataSchema.',
      schema: toStableJsonSchema(createRuleDataSchema),
    }).toMatchInlineSnapshot(`
      Object {
        "hint": "Create-rule schema changed. Update this snapshot and confirm ruleTemplateDataSchema.rule still uses createRuleDataSchema.",
        "schema": Object {
          "additionalProperties": false,
          "definitions": Object {
            "alerting_composed_rule_query": Object {
              "additionalProperties": false,
              "description": "Composed query: a shared base with appendable breach and recovery segments.",
              "properties": Object {
                "base": Object {
                  "description": "Base ES|QL query. Time filters are applied automatically via the lookback window.",
                  "maxLength": 10000,
                  "minLength": 1,
                  "type": "string",
                },
                "breach": Object {
                  "additionalProperties": false,
                  "description": "Breach detection configuration. Omit to treat every base row as a breach.",
                  "properties": Object {
                    "segment": Object {
                      "description": "A clause appended to the end of the rule's ES|QL query. Required in breach blocks.",
                      "maxLength": 10000,
                      "minLength": 1,
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "segment",
                  ],
                  "type": "object",
                },
                "format": Object {
                  "const": "composed",
                  "type": "string",
                },
                "recovery": Object {
                  "additionalProperties": false,
                  "description": "Recovery query segment. Required when recovery_strategy is \\"query\\".",
                  "properties": Object {
                    "segment": Object {
                      "description": "Appendable ES|QL segment for recovery detection.",
                      "maxLength": 10000,
                      "minLength": 1,
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "segment",
                  ],
                  "type": "object",
                },
              },
              "required": Array [
                "format",
                "base",
              ],
              "type": "object",
            },
            "alerting_rule_artifact": Object {
              "additionalProperties": false,
              "properties": Object {
                "data": Object {
                  "additionalProperties": Object {},
                  "description": "Structured artifact data.",
                  "propertyNames": Object {
                    "maxLength": 256,
                    "minLength": 1,
                    "type": "string",
                  },
                  "type": "object",
                },
                "id": Object {
                  "description": "Artifact identifier.",
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string",
                },
                "type": Object {
                  "description": "Artifact type.",
                  "maxLength": 128,
                  "minLength": 1,
                  "type": "string",
                },
              },
              "required": Array [
                "id",
                "type",
                "data",
              ],
              "type": "object",
            },
            "alerting_rule_grouping": Object {
              "additionalProperties": false,
              "description": "Grouping configuration.",
              "properties": Object {
                "fields": Object {
                  "description": "Fields to group alerts by, e.g. [\\"host.name\\", \\"service.name\\"]. Should match ES|QL GROUP BY fields.",
                  "items": Object {
                    "maxLength": 256,
                    "minLength": 1,
                    "type": "string",
                  },
                  "maxItems": 16,
                  "type": "array",
                },
              },
              "required": Array [
                "fields",
              ],
              "type": "object",
            },
            "alerting_rule_metadata": Object {
              "additionalProperties": false,
              "description": "Rule metadata.",
              "properties": Object {
                "builder_fields": Object {
                  "additionalProperties": Object {},
                  "description": "Structured parameters for the rule builder identified by \`builder_type\`. The server generates the rule query from these fields.",
                  "propertyNames": Object {
                    "maxLength": 256,
                    "minLength": 1,
                    "type": "string",
                  },
                  "type": "object",
                },
                "builder_type": Object {
                  "description": "Identifies the rule builder that authored this rule (e.g. \\"threshold\\"). Absent for rules authored directly in ES|QL.",
                  "maxLength": 64,
                  "minLength": 1,
                  "type": "string",
                },
                "description": Object {
                  "description": "Human-readable description of the rule.",
                  "maxLength": 1024,
                  "type": "string",
                },
                "name": Object {
                  "description": "Rule name (must be unique within the space).",
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string",
                },
                "owner": Object {
                  "description": "Owner of the rule.",
                  "maxLength": 256,
                  "type": "string",
                },
                "tags": Object {
                  "description": "Tags for categorization, e.g. [\\"production\\", \\"infra\\"].",
                  "items": Object {
                    "maxLength": 128,
                    "minLength": 1,
                    "type": "string",
                  },
                  "maxItems": 20,
                  "minItems": 1,
                  "type": "array",
                },
              },
              "required": Array [
                "name",
              ],
              "type": "object",
            },
            "alerting_rule_query": Object {
              "description": "Detection query configuration.",
              "oneOf": Array [
                Object {
                  "$ref": "#/definitions/alerting_composed_rule_query",
                },
                Object {
                  "$ref": "#/definitions/alerting_standalone_rule_query",
                },
              ],
            },
            "alerting_rule_schedule": Object {
              "additionalProperties": false,
              "description": "Execution schedule configuration.",
              "properties": Object {
                "every": Object {
                  "description": "Execution interval, e.g. 1m, 5m, 1h.",
                  "type": "string",
                },
                "lookback": Object {
                  "description": "Lookback window for the query, e.g. 5m, 1h. Can also be expressed in ES|QL.",
                  "type": "string",
                },
              },
              "required": Array [
                "every",
              ],
              "type": "object",
            },
            "alerting_standalone_rule_query": Object {
              "additionalProperties": false,
              "description": "Standalone queries: independent full queries for breach, recovery, and no_data.",
              "properties": Object {
                "breach": Object {
                  "additionalProperties": false,
                  "description": "Breach detection configuration (required).",
                  "properties": Object {
                    "query": Object {
                      "description": "Full ES|QL query for breach detection (required).",
                      "maxLength": 10000,
                      "minLength": 1,
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "query",
                  ],
                  "type": "object",
                },
                "format": Object {
                  "const": "standalone",
                  "type": "string",
                },
                "no_data": Object {
                  "additionalProperties": false,
                  "description": "No-data detection query. Required when no_data_strategy is not \\"none\\".",
                  "properties": Object {
                    "query": Object {
                      "description": "Full ES|QL query that detects presence of data.",
                      "maxLength": 10000,
                      "minLength": 1,
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "query",
                  ],
                  "type": "object",
                },
                "recovery": Object {
                  "additionalProperties": false,
                  "description": "Recovery query. Required when recovery_strategy is \\"query\\".",
                  "properties": Object {
                    "query": Object {
                      "description": "Full ES|QL query for recovery detection.",
                      "maxLength": 10000,
                      "minLength": 1,
                      "type": "string",
                    },
                  },
                  "required": Array [
                    "query",
                  ],
                  "type": "object",
                },
              },
              "required": Array [
                "format",
                "breach",
              ],
              "type": "object",
            },
          },
          "properties": Object {
            "artifacts": Object {
              "description": "Artifacts attached to the rule, each shaped as \`{ id, type, data }\`. \`data\` is a type-specific object (for example a \`runbook\` may carry \`content\`, a \`dashboard\` may carry \`dashboard_id\`). Per-type shape is validated by the artifact-type registry when the type is registered; unregistered types pass through with envelope bounds only.",
              "items": Object {
                "$ref": "#/definitions/alerting_rule_artifact",
              },
              "maxItems": 100,
              "type": "array",
            },
            "grouping": Object {
              "allOf": Array [
                Object {
                  "$ref": "#/definitions/alerting_rule_grouping",
                },
              ],
            },
            "kind": Object {
              "anyOf": Array [
                Object {
                  "const": "alert",
                  "description": "Default. Tracks each problem as an alert episode and its lifecycle, link it to workflows to notify your team. Use when the user wants to detect and respond.",
                  "type": "string",
                },
                Object {
                  "const": "signal",
                  "description": "Matches are stored as queryable events. No alerts, no notifications - just data. Use when the user wants to collect evidence.",
                  "type": "string",
                },
              ],
              "description": "The kind of the rule.",
            },
            "metadata": Object {
              "$ref": "#/definitions/alerting_rule_metadata",
            },
            "no_data_strategy": Object {
              "anyOf": Array [
                Object {
                  "const": "last_known_status",
                  "description": "Holds the last known episode status when no data is present.",
                  "type": "string",
                },
                Object {
                  "const": "emit",
                  "description": "Emits a \`no_data\` alert event when no_data query returns no rows for the group. \\"emit\\" is not currently accepted by the create/update API.",
                  "type": "string",
                },
                Object {
                  "const": "recover",
                  "description": "Resolves the alert episode to inactive on the first no-data run.",
                  "type": "string",
                },
                Object {
                  "const": "none",
                  "description": "No-data situations are ignored (default).",
                  "type": "string",
                },
              ],
              "description": "How to handle no-data situations. \\"last_known_status\\" holds the last known status; \\"recover\\" forces recovery; \\"none\\" disables no-data detection. \\"emit\\" is not currently accepted by the create/update API. Standalone-format rules must provide a \`no_data\` query block when this is not \\"none\\"; composed-format rules use \`base\` as the data-presence query.",
            },
            "query": Object {
              "allOf": Array [
                Object {
                  "$ref": "#/definitions/alerting_rule_query",
                },
              ],
            },
            "recovery_strategy": Object {
              "anyOf": Array [
                Object {
                  "const": "no_breach",
                  "description": "recovers groups that stop breaching (default).",
                  "type": "string",
                },
                Object {
                  "const": "query",
                  "description": "uses a custom recovery query to detect recovery.",
                  "type": "string",
                },
                Object {
                  "const": "none",
                  "description": "disables recovery entirely.",
                  "type": "string",
                },
              ],
              "description": "How recovery is detected. \\"no_breach\\" recovers groups that stop breaching; \\"query\\" uses a custom recovery query; \\"none\\" disables recovery.",
            },
            "schedule": Object {
              "$ref": "#/definitions/alerting_rule_schedule",
            },
            "state_transition": Object {
              "anyOf": Array [
                Object {
                  "additionalProperties": false,
                  "description": "Episode state transition thresholds (alert-only).",
                  "properties": Object {
                    "pending_count": Object {
                      "description": "Consecutive breaches before transitioning to active.",
                      "maximum": 1000,
                      "minimum": 0,
                      "type": "integer",
                    },
                    "pending_operator": Object {
                      "description": "How to combine count and timeframe for pending.",
                      "enum": Array [
                        "AND",
                        "OR",
                      ],
                      "type": "string",
                    },
                    "pending_timeframe": Object {
                      "description": "Time window for pending evaluation, e.g. 5m, 15m.",
                      "type": "string",
                    },
                    "recovering_count": Object {
                      "description": "Consecutive recoveries before transitioning to inactive.",
                      "maximum": 1000,
                      "minimum": 0,
                      "type": "integer",
                    },
                    "recovering_operator": Object {
                      "description": "How to combine count and timeframe for recovering.",
                      "enum": Array [
                        "AND",
                        "OR",
                      ],
                      "type": "string",
                    },
                    "recovering_timeframe": Object {
                      "description": "Time window for recovering evaluation, e.g. 5m, 15m.",
                      "type": "string",
                    },
                  },
                  "type": "object",
                },
                Object {
                  "type": "null",
                },
              ],
            },
            "time_field": Object {
              "default": "@timestamp",
              "description": "Time field used for the lookback window range filter.",
              "maxLength": 128,
              "minLength": 1,
              "type": "string",
            },
          },
          "required": Array [
            "kind",
            "metadata",
            "time_field",
            "schedule",
          ],
          "type": "object",
        },
      }
    `);
  });

  it('template JSON schema is engine plus create-rule under rule', () => {
    const createJson = toStableJsonSchema(createRuleDataSchema);
    const templateJson = toStableJsonSchema(ruleTemplateDataSchema) as {
      properties?: Record<string, unknown>;
      required?: string[];
      definitions?: Record<string, unknown>;
    };

    expect({
      hint: 'Rule template must expose engine:"v2" and nest create-rule under rule.',
      engine: templateJson.properties?.engine,
      required: [...(templateJson.required ?? [])].sort(),
    }).toEqual({
      hint: 'Rule template must expose engine:"v2" and nest create-rule under rule.',
      engine: {
        type: 'string',
        const: 'v2',
        description: 'The alerting engine this template targets. Always "v2" for v2 templates.',
      },
      required: ['engine', 'rule'],
    });

    // createRuleDataSchema carries .meta({ id: 'alerting_new_rule' }), so when nested
    // under the template schema Zod emits a $ref instead of inlining the object.
    expect(templateJson.properties?.rule).toEqual({
      $ref: '#/definitions/alerting_new_rule',
    });

    const { alerting_new_rule: ruleBody, ...ruleNestedDefs } = templateJson.definitions ?? {};
    const resolvedRule = {
      ...(ruleBody as Record<string, unknown>),
      definitions: ruleNestedDefs,
    };

    expect({
      hint: 'Rule template rule property must match createRuleDataSchema. Keep rule: createRuleDataSchema.',
      rule: resolvedRule,
      createRule: createJson,
    }).toEqual({
      hint: 'Rule template rule property must match createRuleDataSchema. Keep rule: createRuleDataSchema.',
      rule: createJson,
      createRule: createJson,
    });
  });
});
