/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { convertLegacyFieldsToJsonSchema } from './lib/field_conversion';
import { BaseEventSchema } from './schema/common/base_event';
import { JsonModelSchema } from './schema/common/json_model_schema';
import { TriggerSchema } from './schema/triggers';
import { AlertEventSchema } from './schema/triggers/alert_trigger_schema';
import {
  isManualTrigger,
  LegacyWorkflowInputSchema,
} from './schema/triggers/manual_trigger_schema';
import { CONNECTOR_ID_MAX_LENGTH, IF_CONDITION_MAX_LENGTH } from '../common/constants';
import {
  HITL_EXTERNAL_CHANNELS_DESCRIPTION,
  HITL_EXTERNAL_FORM_LINK_CONTEXT_KEY,
  HITL_EXTERNAL_QUERY_LINK_CONTEXT_KEY,
  MAX_HITL_ACTION_LABEL_LENGTH,
  MAX_HITL_EXTERNAL_LINK_LENGTH,
  MAX_HITL_MESSAGE_LENGTH,
  MAX_HITL_SLACK_CHANNEL_LENGTH,
} from '../common/hitl';

export const DurationSchema = z.string().regex(/^\d+(ms|[smhdw])$/, 'Invalid duration format');

export const ByteSizeSchema = z
  .string()
  .regex(/^\d+(\.\d+)?\s*(b|kb|mb|gb)$/i, 'Invalid byte size format (e.g., "10mb", "1gb")');

/* -- Settings -- */
export const RetryPolicySchema = z.object({
  'max-attempts': z.number().int().min(1).optional(),
  'timeout-seconds': z.number().int().min(1).optional(),
});

export const RetryDelayStrategySchema = z.enum(['fixed', 'exponential']);
export type RetryDelayStrategy = z.infer<typeof RetryDelayStrategySchema>;

export const WorkflowRetrySchema = z.object({
  'max-attempts': z.number().min(1),
  condition: z.string().optional(), // e.g., "${{error.type == 'NetworkError'}}" (default: always retry)
  delay: z
    .string()
    .regex(/^\d+(ms|[smhdw])$/, 'Invalid duration format')
    .optional(), // e.g., '5s', '1m', '2h' (default: no delay)
  /** Delay strategy: fixed (same delay each retry) or exponential backoff. Default: fixed. */
  strategy: RetryDelayStrategySchema.optional(),
  /** Multiplier for exponential backoff (e.g. 2 => 1s, 2s, 4s). Default: 2. Ignored when strategy is fixed. */
  multiplier: z.number().min(1).optional(),
  /** Cap for exponential backoff (e.g. "5m"). Ignored when strategy is fixed. */
  'max-delay': DurationSchema.optional(),
  /** Add jitter to delay to avoid thundering herd. Default: false. */
  jitter: z.boolean().optional(),
});
export type WorkflowRetry = z.infer<typeof WorkflowRetrySchema>;

const IfConditionSchema = z
  .string()
  .max(IF_CONDITION_MAX_LENGTH)
  .describe(
    'KQL condition that controls whether this step runs, e.g. "steps.prev.output.status : \'success\'"'
  );

// Base step schema, with recursive steps property
export const BaseStepSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  'max-step-size': ByteSizeSchema.optional(),
  if: IfConditionSchema.optional(),
});
export type BaseStep = z.infer<typeof BaseStepSchema>;

export const WorkflowOnFailureSchema = z.object({
  retry: WorkflowRetrySchema.optional(),
  fallback: z.array(BaseStepSchema).min(1).optional(),
  continue: z.union([z.boolean(), z.string()]).optional(),
});

export type WorkflowOnFailure = z.infer<typeof WorkflowOnFailureSchema>;

export function getOnFailureStepSchema(stepSchema: z.ZodType, loose: boolean = false) {
  const schema = WorkflowOnFailureSchema.extend({
    fallback: z.array(stepSchema).optional(),
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial();
  }

  return schema;
}

export const CollisionStrategySchema = z
  .enum(['cancel-in-progress', 'drop', 'queue'])
  .describe(
    'How to handle collisions when max concurrent runs is exceeded: `drop`, `cancel-in-progress` or `queue`.'
  );
export type CollisionStrategy = z.infer<typeof CollisionStrategySchema>;

export const DEFAULT_CONCURRENCY_QUEUE_SIZE = 100;
export const DEFAULT_CONCURRENCY_QUEUE_TTL = '24h';

export const ConcurrencySettingsSchema = z.object({
  key: z
    .string()
    .max(512)
    .optional()
    .describe(
      'Liquid template that groups executions into a concurrency bucket (e.g. `{{ event.host.name }}`).'
    ),
  strategy: CollisionStrategySchema.optional(),
  max: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum concurrent runs allowed per concurrency group.'),
  'queue-size': z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Only applies when strategy is `queue`. Maximum backlog size before new runs are skipped (default: `100`).'
    ),
  'queue-ttl': DurationSchema.optional().describe(
    'Only applies when strategy is `queue`. Max time a run may stay queued before it is skipped (default: `24h`).'
  ),
});
export type ConcurrencySettings = z.infer<typeof ConcurrencySettingsSchema>;

export const LIQUID_PARSE_LIMIT_MAX = 600_000;
export const LIQUID_RENDER_LIMIT_MAX = 2_000;
export const LIQUID_MEMORY_LIMIT_MAX = 60_000_000;

export const LiquidSettingsSchema = z.object({
  parseLimit: z
    .number()
    .int()
    .min(1)
    .max(LIQUID_PARSE_LIMIT_MAX)
    .optional()
    .describe('Liquid parse character limit. Defaults to 150000; maximum is 600000.'),
  renderLimit: z
    .number()
    .int()
    .min(1)
    .max(LIQUID_RENDER_LIMIT_MAX)
    .optional()
    .describe('Liquid render time limit in milliseconds. Defaults to 1000; maximum is 2000.'),
  memoryLimit: z
    .number()
    .int()
    .min(1)
    .max(LIQUID_MEMORY_LIMIT_MAX)
    .optional()
    .describe(
      'Liquid memory operation limit for array and string operations. Defaults to 15000000; maximum is 60000000.'
    ),
});
export type LiquidSettings = z.infer<typeof LiquidSettingsSchema>;

export const WorkflowSettingsSchema = z.object({
  'on-failure': WorkflowOnFailureSchema.optional(),
  timezone: z.string().optional(), // Should follow IANA TZ format
  timeout: DurationSchema.optional(), // e.g., '5s', '1m', '2h'
  concurrency: ConcurrencySettingsSchema.optional(),
  'max-step-size': ByteSizeSchema.optional(), // e.g., '10mb', '15MB', '1gb'
  liquid: LiquidSettingsSchema.optional(),
});
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;

export function getWorkflowSettingsSchema(stepSchema: z.ZodType, loose: boolean = false) {
  const schema = WorkflowSettingsSchema.extend({
    'on-failure': getOnFailureStepSchema(stepSchema, loose).optional(),
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial();
  }

  return schema;
}

/* --- Steps --- */
export const TimeoutPropSchema = z.object({
  timeout: DurationSchema.optional(),
});
export type TimeoutProp = z.infer<typeof TimeoutPropSchema>;

export const MaxStepSizePropSchema = z.object({
  'max-step-size': ByteSizeSchema.optional(),
});
export type MaxStepSizeProp = z.infer<typeof MaxStepSizePropSchema>;

export const MaxIterationsObjectSchema = z.object({
  limit: z.number().int().positive(),
  'on-limit': z.enum(['continue', 'fail']),
});

export const MaxIterationsSchema = z.union([
  z.number().int().positive(),
  MaxIterationsObjectSchema,
]);
export type MaxIterations = z.infer<typeof MaxIterationsSchema>;

export const DEFAULT_LOOP_MAX_ITERATIONS = 2000;

export const LoopStepPropsSchema = z.object({
  'max-iterations': MaxIterationsSchema.optional(),
  'iteration-timeout': DurationSchema.optional(),
  'iteration-on-failure': WorkflowOnFailureSchema.optional(),
});
export type LoopStepProps = z.infer<typeof LoopStepPropsSchema>;

const StepWithForEachSchema = z.object({
  foreach: z.union([z.string(), z.array(z.unknown())]).optional(),
});
export type StepWithForeach = z.infer<typeof StepWithForEachSchema>;

export type StepWithOnFailure = z.infer<typeof StepWithOnFailureSchema>;

export const StepWithIfConditionSchema = z.object({
  if: IfConditionSchema.optional(),
});
export type StepWithIfCondition = z.infer<typeof StepWithIfConditionSchema>;

export const StepWithOnFailureSchema = z.object({
  'on-failure': WorkflowOnFailureSchema.optional(),
});

export const BaseConnectorStepSchema = BaseStepSchema.extend({
  type: z.string().min(1),
  with: z.record(z.string(), z.any()).optional(),
})
  .merge(StepWithForEachSchema)
  .merge(TimeoutPropSchema)
  .merge(StepWithOnFailureSchema);
export type ConnectorStep = z.infer<typeof BaseConnectorStepSchema>;

export const BuiltInStepProperties = [
  'name',
  'type',
  'with',
  'if',
  'foreach',
  'timeout',
  'max-step-size',
  'on-failure',
  'max-iterations',
  'iteration-timeout',
  'iteration-on-failure',
];
export type BuiltInStepProperty = (typeof BuiltInStepProperties)[number];

export const WaitStepInputSchema = z.object({
  duration: DurationSchema.describe(
    'Duration to wait, e.g. "5s", "1m", "2h". Format: number + unit (ms/s/m/h/d/w)'
  ),
});
export const WaitStepSchema = BaseStepSchema.extend({
  type: z.literal('wait').describe('Pause execution for a specified duration'),
  with: WaitStepInputSchema,
});
export type WaitStep = z.infer<typeof WaitStepSchema>;

export const WaitForApprovalSlackChannelSchema = z.object({
  'connector-id': z
    .string()
    .min(1)
    .max(CONNECTOR_ID_MAX_LENGTH)
    .describe('Slack webhook connector saved object id or name (posts to the webhook channel)'),
  message: z
    .string()
    .max(MAX_HITL_MESSAGE_LENGTH)
    .optional()
    .describe(
      'Optional notification template. Use {{context.hitl.externalFormLink}} for the external input form link.'
    ),
});

export const WaitForApprovalSlackApiChannelSchema = z.object({
  'connector-id': z
    .string()
    .min(1)
    .max(CONNECTOR_ID_MAX_LENGTH)
    .describe('Slack API connector saved object id or name'),
  channels: z
    .array(
      z
        .string()
        .min(1)
        .max(MAX_HITL_SLACK_CHANNEL_LENGTH)
        .describe('Slack channel ID (e.g. C0123456789) or channel name (e.g. #alerts)')
    )
    .min(1)
    .describe(
      'Slack channels to notify. Each entry may be a channel ID (e.g. C0123456789) or a channel name (e.g. #alerts). Must be allowed on the Slack API connector when an allowlist is configured.'
    ),
  message: z
    .string()
    .max(MAX_HITL_MESSAGE_LENGTH)
    .optional()
    .describe(
      'Optional notification template. Use {{context.hitl.externalFormLink}} for the external input form link.'
    ),
});

export const WaitForApprovalChannelsSchema = z
  .object({
    slack: WaitForApprovalSlackChannelSchema.optional().describe(
      'Notify via a Slack incoming-webhook connector (posts to the webhook configured channel)'
    ),
    slack_api: WaitForApprovalSlackApiChannelSchema.optional().describe(
      'Notify via a Slack API connector. Set connector-id and one or more channel IDs and/or #channel names.'
    ),
  })
  .optional()
  .describe(HITL_EXTERNAL_CHANNELS_DESCRIPTION);

export const HitlExternalChannelsSchema = WaitForApprovalChannelsSchema;

export const WaitForInputStepInputSchema = z
  .object({
    message: z
      .string()
      .max(MAX_HITL_MESSAGE_LENGTH)
      .optional()
      .describe('Message displayed to the user when waiting for input'),
    schema: JsonModelSchema.optional().describe(
      'JSON Schema describing the expected input payload. Used for validation, autocomplete, and default values in the resume UI'
    ),
    channels: HitlExternalChannelsSchema,
  })
  .optional();
export const WaitForInputStepSchema = BaseStepSchema.extend({
  type: z.literal('waitForInput').describe('Pause execution until external input is provided'),
  with: WaitForInputStepInputSchema,
}).merge(TimeoutPropSchema);
export type WaitForInputStep = z.infer<typeof WaitForInputStepSchema>;

export const WaitForApprovalStepInputSchema = z
  .object({
    message: z
      .string()
      .max(MAX_HITL_MESSAGE_LENGTH)
      .optional()
      .describe('Message displayed to approvers'),
    approveLabel: z
      .string()
      .max(MAX_HITL_ACTION_LABEL_LENGTH)
      .optional()
      .describe('Label for the approve action (default: Approve)'),
    rejectLabel: z
      .string()
      .max(MAX_HITL_ACTION_LABEL_LENGTH)
      .optional()
      .describe('Label for the reject action (default: Decline)'),
    channels: WaitForApprovalChannelsSchema,
  })
  .optional();

export const WaitForApprovalStepSchema = BaseStepSchema.extend({
  type: z
    .literal('waitForApproval')
    .describe('Pause execution until approval or rejection is received'),
  with: WaitForApprovalStepInputSchema,
}).merge(TimeoutPropSchema);
export type WaitForApprovalStep = z.infer<typeof WaitForApprovalStepSchema>;

export const DataSetStepInputSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'Key-value pairs where keys are variable names and values are the data to store. Values support Liquid expressions. Access via {{ variables.key_name }}'
  );
export const DataSetStepSchema = BaseStepSchema.extend({
  type: z.literal('data.set').describe('Set variables in the workflow context'),
  with: DataSetStepInputSchema,
});
export type DataSetStep = z.infer<typeof DataSetStepSchema>;

// Fetcher configuration for HTTP request customization (shared across formats)
export const FetcherConfigSchema = z
  .object({
    skip_ssl_verification: z
      .boolean()
      .optional()
      .describe('Skip SSL/TLS certificate verification for the request'),
    follow_redirects: z
      .boolean()
      .optional()
      .describe('Whether to follow HTTP redirects. Defaults to true'),
    max_redirects: z.number().optional().describe('Maximum number of redirects to follow'),
    keep_alive: z.boolean().optional().describe('Enable HTTP keep-alive for connection reuse'),
    max_content_length: z
      .number()
      .positive()
      .finite()
      .optional()
      .describe('Maximum response body size in bytes. Aborts the request mid-stream if exceeded.'),
  })
  .meta({ $id: 'fetcher', description: 'Fetcher configuration for HTTP request customization' })
  .optional();

// Single source of truth for the kibana.request HTTP method enum (mirrors the `http` step's
// valid values). Reused by the connector schema (editor + validation) and the runtime guard so
// the editor and runtime can never accept/reject different methods.
export const KibanaHttpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const KibanaHttpMethodSchema = z.enum(KibanaHttpMethods);

export const ElasticsearchStepInputSchema = z.union([
  // Raw API format - like Dev Console
  z.object({
    request: z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']).optional().default('GET'),
      path: z.string().min(1),
      body: z.any().optional(),
    }),
  }),
  // Sugar syntax for common operations
  z
    .object({
      index: z.string().optional(),
      id: z.string().optional(),
      query: z.record(z.string(), z.any()).optional(),
      body: z.record(z.string(), z.any()).optional(),
      size: z.number().optional(),
      from: z.number().optional(),
      sort: z.array(z.any()).optional(),
      _source: z.union([z.boolean(), z.array(z.string()), z.string()]).optional(),
      aggs: z.record(z.string(), z.any()).optional(),
      aggregations: z.record(z.string(), z.any()).optional(),
    })
    .and(z.record(z.string(), z.any())), // Allow additional properties for flexibility
]);
// Generic Elasticsearch step schema for backend validation
export const ElasticsearchStepSchema = BaseStepSchema.extend({
  type: z.string().refine((val) => val.startsWith('elasticsearch.'), {
    message: 'Elasticsearch step type must start with "elasticsearch."',
  }),
  with: ElasticsearchStepInputSchema,
});
export type ElasticsearchStep = z.infer<typeof ElasticsearchStepSchema>;

// Kibana step meta options that control routing and debugging (not forwarded as HTTP params)
export const KibanaStepMetaSchema = {
  use_server_info: z
    .boolean()
    .optional()
    .describe('Use the server info URL (internal host:port) instead of the public URL'),
  use_localhost: z
    .boolean()
    .optional()
    .describe('Use localhost:5601 instead of the configured URL'),
  debug: z
    .boolean()
    .optional()
    .describe('Include the resolved full URL in the step output for debugging'),
};

// Generic Kibana step schema for backend validation
export const KibanaStepInputSchema = z.union([
  // Raw API format - direct HTTP API calls
  z.object({
    request: z.object({
      method: KibanaHttpMethodSchema.optional().default('GET'),
      path: z.string().min(1),
      body: z.any().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    fetcher: FetcherConfigSchema,
    ...KibanaStepMetaSchema,
  }),
  // Sugar syntax for common Kibana operations
  z
    .object({
      // Cases API
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      assignees: z.array(z.string()).optional(),
      owner: z.string().optional(),
      connector: z.record(z.string(), z.any()).optional(),
      settings: z.record(z.string(), z.any()).optional(),
      // Generic parameters
      id: z.string().optional(),
      case_id: z.string().optional(),
      space_id: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
      status: z.string().optional(),
      fetcher: FetcherConfigSchema,
      ...KibanaStepMetaSchema,
    })
    .and(z.record(z.string(), z.any())), // Allow additional properties for flexibility
]);
export const KibanaStepSchema = BaseStepSchema.extend({
  type: z.string().refine((val) => val.startsWith('kibana.'), {
    message: 'Kibana step type must start with "kibana."',
  }),
  with: KibanaStepInputSchema,
});
export type KibanaStep = z.infer<typeof KibanaStepSchema>;

export const ForEachStepConfigSchema = z.object({
  foreach: z
    .union([z.string(), z.array(z.unknown())])
    .describe(
      'Liquid expression evaluating to an array, e.g. "{{ steps.search.output.hits.hits | json }}"'
    ),
  steps: z.array(BaseStepSchema).min(1).describe('Steps to execute for each item'),
});

export const ForEachStepSchema = BaseStepSchema.extend({
  type: z
    .literal('foreach')
    .describe(
      'Loop over a list. Access current item via {{ foreach.item }}, index via {{ foreach.index }}, total via {{ foreach.total }}'
    ),
  ...ForEachStepConfigSchema.shape,
  ...LoopStepPropsSchema.shape,
  ...TimeoutPropSchema.shape,
});

export type ForEachStep = z.infer<typeof ForEachStepSchema>;

const getLoopStepSchemaOverrides = (stepSchema: z.ZodType, loose: boolean) => ({
  'on-failure': getOnFailureStepSchema(stepSchema, loose).optional(),
  'iteration-on-failure': getOnFailureStepSchema(stepSchema, loose).optional(),
});

export const getForEachStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  const schema = ForEachStepSchema.extend({
    steps: z.array(stepSchema).min(1),
    ...getLoopStepSchemaOverrides(stepSchema, loose),
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial().required({ type: true });
  }

  return schema;
};

export const WhileStepConfigSchema = z.object({
  condition: z
    .string()
    .describe(
      'Condition expression evaluated after each iteration, e.g. "${{ steps.inner_http.output.status_code != 200 }}". First iteration always runs.'
    ),
  steps: z
    .array(BaseStepSchema)
    .min(1)
    .describe('Steps to execute in each iteration of the while loop'),
});

export const WhileStepSchema = BaseStepSchema.extend({
  type: z
    .literal('while')
    .describe(
      'Repeat steps while condition is true (do-while semantics — first iteration always runs). Access iteration index via {{ while.iteration }}'
    ),
  ...WhileStepConfigSchema.shape,
  ...LoopStepPropsSchema.shape,
  ...TimeoutPropSchema.shape,
});

export type WhileStep = z.infer<typeof WhileStepSchema>;

export const getWhileStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  const schema = WhileStepSchema.extend({
    steps: z.array(stepSchema).min(1),
    ...getLoopStepSchemaOverrides(stepSchema, loose),
  });

  if (loose) {
    return schema.partial().required({ type: true });
  }

  return schema;
};

export const SwitchCaseSchema = z.object({
  match: z.union([z.string(), z.number(), z.boolean()]),
  steps: z.array(BaseStepSchema).min(1).describe('Steps to execute when this case matches'),
});
export type SwitchCase = z.infer<typeof SwitchCaseSchema>;

export const SwitchStepConfigSchema = z.object({
  expression: z
    .string()
    .describe(
      'Liquid expression evaluated and compared to each case match, e.g. "{{ steps.check.output.status }}"'
    ),
  cases: z
    .array(SwitchCaseSchema)
    .min(1)
    .describe('Ordered list of match-to-steps mappings. First matching case is executed'),
  default: z.array(BaseStepSchema).optional().describe('Steps to execute when no case matches'),
});

export const SwitchStepSchema = BaseStepSchema.extend({
  type: z
    .literal('switch')
    .describe(
      'Multi-way branching. Evaluates expression and runs the steps of the first case whose match equals the expression'
    ),
  ...SwitchStepConfigSchema.shape,
  ...TimeoutPropSchema.shape,
});
export type SwitchStep = z.infer<typeof SwitchStepSchema>;

export const getSwitchStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  const schema = SwitchStepSchema.extend({
    cases: z.array(
      SwitchCaseSchema.extend({
        steps: z.array(stepSchema).min(1),
      })
    ),
    default: z.array(stepSchema).optional(),
  });

  if (loose) {
    return schema.partial().required({ type: true });
  }

  return schema;
};

export const IfStepConfigSchema = z.object({
  condition: IfConditionSchema,
  // This step already gates on `condition`; a step-level `if` would be a second,
  // invisible gate. Reject it instead of stripping it, so the author sees why.
  if: z
    .never({ error: 'The `if` step gates on `condition`; a step-level `if` is not supported here' })
    .optional(),
  steps: z.array(BaseStepSchema).min(1).describe('Steps to execute when the condition is true'),
  else: z.array(BaseStepSchema).optional().describe('Steps to execute when the condition is false'),
});
export const IfStepSchema = BaseStepSchema.extend({
  type: z
    .literal('if')
    .describe(
      'Conditional execution. Runs steps when condition is true, with optional else block for the false branch'
    ),
  ...IfStepConfigSchema.shape,
});
export type IfStep = z.infer<typeof IfStepSchema>;

export const getIfStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  const schema = IfStepSchema.extend({
    steps: z.array(stepSchema).min(1),
    else: z.array(stepSchema).optional(),
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial().required({ type: true });
  }

  return schema;
};

// Default for the number of branches that may run at once.
export const DEFAULT_PARALLEL_CONCURRENCY = 5;
// Hard ceiling on the requested concurrency, regardless of what an author sets.
// Guards against an author pinning a worker with an unrealistic lane count.
export const DEFAULT_PARALLEL_MAX_CONCURRENCY = 20;
// Default cap on the total number of fan-out items for a dynamic parallel step.
export const DEFAULT_PARALLEL_MAX_FAN_OUT = 100;

// Upper bound on a static branch name. Generous for a human-readable identifier
// while keeping the value bounded so validation can't be fed an unbounded string.
export const PARALLEL_BRANCH_NAME_MAX_LENGTH = 256;
// Upper bound on the dynamic `foreach` expression. A Liquid template can be
// moderately long but should never be unbounded.
export const PARALLEL_FOREACH_EXPRESSION_MAX_LENGTH = 2000;

// `concurrency` accepts either a bare number (shorthand for `{ max: N }`) or an
// object so authors can also control whether parked/polling lanes hold a slot.
export const ParallelConcurrencyObjectSchema = z.object({
  max: z
    .number()
    .int()
    .positive()
    .max(
      DEFAULT_PARALLEL_MAX_CONCURRENCY,
      `Parallel concurrency "max" cannot exceed ${DEFAULT_PARALLEL_MAX_CONCURRENCY}.`
    )
    .optional()
    .describe(
      'Maximum number of branches that run at once. Defaults to a conservative finite cap.'
    ),
  'count-waiting': z
    .boolean()
    .optional()
    .describe(
      'When true (default), a branch that is waiting/polling still occupies a concurrency slot. ' +
        'When false, waiting branches free their slot so more branches can start.'
    ),
});
export type ParallelConcurrencyObject = z.infer<typeof ParallelConcurrencyObjectSchema>;

export const ParallelConcurrencySchema = z
  .union([
    z
      .number()
      .int()
      .positive()
      .max(
        DEFAULT_PARALLEL_MAX_CONCURRENCY,
        `Parallel concurrency cannot exceed ${DEFAULT_PARALLEL_MAX_CONCURRENCY}.`
      ),
    ParallelConcurrencyObjectSchema,
  ])
  .describe('Concurrency control: a number (max lanes) or { max, count-waiting }.');

export const ParallelModeSchema = z
  .enum(['fail-fast', 'settled'])
  .describe(
    'fail-fast (default): stop scheduling new branches when one fails, let in-flight branches finish, then fail. ' +
      'settled: let every branch reach a terminal state; the step succeeds and reports per-branch results.'
  );
export type ParallelMode = z.infer<typeof ParallelModeSchema>;

// A single named branch in a static parallel step. Each branch has its own
// (heterogeneous) body — unlike dynamic fan-out, branches run different steps.
export const ParallelBranchSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(PARALLEL_BRANCH_NAME_MAX_LENGTH)
    .describe(
      'Branch identifier, used as the result `key` for this branch in the aggregate output.'
    ),
  steps: z
    .array(BaseStepSchema)
    .min(1)
    .describe('Branch body. v1 supports a straight-line sequence of steps per branch.'),
});

// Shared so the base config schema and the connector-aware `getParallelStepSchema`
// variant surface the same validation message for a degenerate single-branch step.
const PARALLEL_STATIC_MIN_BRANCHES_MESSAGE =
  'A static `parallel` step must declare at least two branches; a single-branch parallel is ' +
  'degenerate (use a plain step sequence instead).';

// The `parallel` step has two mutually exclusive modes:
// - Dynamic fan-out (`foreach` + `steps`): run the SAME branch body once per
//   runtime list item, concurrently.
// - Static branches (`branches`): run a FIXED set of named, heterogeneous
//   branch bodies concurrently (scatter-gather). The set is known at author
//   time, so each branch compiles to its own real subgraph.
export const ParallelStepConfigSchema = z.object({
  foreach: z
    .union([z.string().max(PARALLEL_FOREACH_EXPRESSION_MAX_LENGTH), z.array(z.unknown())])
    .optional()
    .describe(
      'Dynamic fan-out: a Liquid expression evaluating to an array (or a literal array). The ' +
        '`steps` body runs once per item, concurrently. Mutually exclusive with `branches`. ' +
        'Inside a branch, access the item via {{ foreach.item }} / {{ foreach.index }}.'
    ),
  steps: z
    .array(BaseStepSchema)
    .min(1)
    .optional()
    .describe('Dynamic fan-out branch body executed once per item. Used with `foreach`.'),
  branches: z
    .array(ParallelBranchSchema)
    .min(2, { message: PARALLEL_STATIC_MIN_BRANCHES_MESSAGE })
    .optional()
    .describe(
      'Static scatter-gather: a fixed set of named branches, each with its own body, run ' +
        'concurrently. Mutually exclusive with `foreach`/`steps`.'
    ),
  concurrency: ParallelConcurrencySchema.optional(),
  mode: ParallelModeSchema.optional(),
  'branch-timeout': DurationSchema.optional().describe(
    'Maximum duration a single branch may run before it is failed with a timeout. ' +
      'Independent of the step-level `timeout`, which bounds the whole parallel step.'
  ),
});
// Object form (extendable). The exported `ParallelStepSchema` applies the
// mode-exclusivity refinement on top; keep this base for `.extend()` callers.
export const ParallelStepObjectSchema = BaseStepSchema.extend({
  type: z
    .literal('parallel')
    .describe(
      'Run branches concurrently and continue when all reach a terminal state. Either dynamic ' +
        'fan-out (`foreach` + `steps`) or a fixed set of named `branches`. Results are collected ' +
        'per branch with aggregate counts.'
    ),
  ...ParallelStepConfigSchema.shape,
  ...TimeoutPropSchema.shape,
  ...StepWithOnFailureSchema.shape,
});

// Exactly one mode. Dynamic requires `steps`; static must not use top-level `steps`.
// Accepts `unknown` so it can be used as a refinement on any parallel-step schema
// variant (whose inferred output differs per call site); narrows internally.
const parallelModeRefinement = (value: unknown): boolean => {
  const step = (value ?? {}) as { foreach?: unknown; branches?: unknown; steps?: unknown };
  const hasForeach = step.foreach !== undefined;
  const hasBranches = step.branches !== undefined;
  if (hasForeach === hasBranches) return false;
  if (hasForeach) return Array.isArray(step.steps) && step.steps.length > 0;
  return step.steps === undefined;
};
export const PARALLEL_MODE_REFINEMENT_MESSAGE =
  'A "parallel" step must use either dynamic fan-out (`foreach` + `steps`) or static ' +
  '`branches`, but not both. With `foreach`, provide `steps`; with `branches`, omit `steps`.';

// Static `branches[].name` doubles as the result `key` in the aggregate output,
// so duplicate names would make name-keyed correlation ambiguous (two results
// sharing a `key`). Require names to be unique within a single parallel step.
const parallelBranchNamesUniqueRefinement = (value: unknown): boolean => {
  const step = (value ?? {}) as { branches?: Array<{ name?: unknown }> };
  if (!Array.isArray(step.branches)) return true;
  const names = step.branches
    .map((branch) => branch?.name)
    .filter((name): name is string => typeof name === 'string');
  return new Set(names).size === names.length;
};
export const PARALLEL_BRANCH_NAMES_UNIQUE_MESSAGE =
  'Static `parallel` branch names must be unique within a step; each `name` is used as the ' +
  'result `key` in the aggregate output.';

// Single source of truth for applying the parallel-step refinements. The base
// `ParallelStepObjectSchema` is kept extendable (a `ZodEffects` from `.refine()`
// cannot be `.extend()`ed), so callers extend the base first and then route it
// through here to attach the refinements with consistent predicates + messages.
const applyParallelModeRefinement = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine(parallelModeRefinement, { message: PARALLEL_MODE_REFINEMENT_MESSAGE })
    .refine(parallelBranchNamesUniqueRefinement, { message: PARALLEL_BRANCH_NAMES_UNIQUE_MESSAGE });

export const ParallelStepSchema = applyParallelModeRefinement(ParallelStepObjectSchema);
export type ParallelStep = z.infer<typeof ParallelStepObjectSchema>;

export const getParallelStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  // Populate both the dynamic `steps` body and each static branch's `steps` with
  // the resolved per-step schema so connector steps validate inside branches too.
  const schema = ParallelStepObjectSchema.extend({
    'on-failure': getOnFailureStepSchema(stepSchema, loose).optional(),
    steps: z.array(stepSchema).min(1).optional(),
    branches: z
      .array(ParallelBranchSchema.extend({ steps: z.array(stepSchema).min(1) }))
      .min(2, { message: PARALLEL_STATIC_MIN_BRANCHES_MESSAGE })
      .optional(),
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial().required({ type: true });
  }

  return applyParallelModeRefinement(schema);
};

export const MergeStepConfigSchema = z.object({
  sources: z
    .array(z.string())
    .describe('References to branch or step names whose results to merge'),
  steps: z.array(BaseStepSchema).describe('Steps to execute after merging'),
});
export const MergeStepSchema = BaseStepSchema.extend({
  type: z
    .literal('merge')
    .describe('Merge results from parallel branches and continue with subsequent steps'),
  ...MergeStepConfigSchema.shape,
});
export type MergeStep = z.infer<typeof MergeStepSchema>;

export const getMergeStepSchema = (stepSchema: z.ZodType, loose: boolean = false) => {
  const schema = MergeStepSchema.extend({
    steps: z.array(stepSchema), // steps to run after merge
  });

  if (loose) {
    // make all fields optional, but require type to be present for discriminated union
    return schema.partial().required({ type: true });
  }

  return schema;
};

export const LoopBreakStepSchema = BaseStepSchema.extend({
  type: z
    .literal('loop.break')
    .describe('Exit the enclosing loop immediately. Valid only inside a foreach or while body'),
});
export type LoopBreakStep = z.infer<typeof LoopBreakStepSchema>;

export const LoopContinueStepSchema = BaseStepSchema.extend({
  type: z
    .literal('loop.continue')
    .describe(
      'Skip remaining steps in the current iteration and advance to the next one. Valid only inside a foreach or while body'
    ),
});
export type LoopContinueStep = z.infer<typeof LoopContinueStepSchema>;

export const ConsoleStepInputSchema = z.object({
  message: z.unknown().optional(),
});

// Base schema shared by both workflow.execute and workflow.executeAsync
export const WorkflowExecuteStepInputSchema = z.object({
  'workflow-id': z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

const WorkflowExecuteBaseSchema = BaseStepSchema.extend({
  with: WorkflowExecuteStepInputSchema,
});

export const WorkflowExecuteStepSchema = WorkflowExecuteBaseSchema.extend({
  type: z.literal('workflow.execute'),
});
export type WorkflowExecuteStep = z.infer<typeof WorkflowExecuteStepSchema>;

export const WorkflowExecuteAsyncStepSchema = WorkflowExecuteBaseSchema.extend({
  type: z.literal('workflow.executeAsync'),
});
export type WorkflowExecuteAsyncStep = z.infer<typeof WorkflowExecuteAsyncStepSchema>;

export const WorkflowExecuteAsyncStepOutputSchema = z.object({
  workflowId: z.string(),
  executionId: z.string(),
  awaited: z.boolean(),
  status: z.string(),
  startedAt: z.string().optional(),
});

export const WorkflowOutputStepSchema = BaseStepSchema.extend({
  type: z.literal('workflow.output'),
  status: z.enum(['completed', 'cancelled', 'failed']).optional().default('completed'),
  with: z.record(z.string(), z.any()),
});
export type WorkflowOutputStep = z.infer<typeof WorkflowOutputStepSchema>;

export const WorkflowFailStepSchema = BaseStepSchema.extend({
  type: z.literal('workflow.fail'),
  with: z
    .object({
      message: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});
export type WorkflowFailStep = z.infer<typeof WorkflowFailStepSchema>;

/* --- Outputs --- */
// Outputs use the same format as inputs (name, type, required, etc.); default is ignored at runtime for outputs.
export const WorkflowOutputSchema = LegacyWorkflowInputSchema;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;

/* --- Consts --- */
export const WorkflowConstsSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.any()),
    z.object({}),
    z.array(z.any()),
  ])
);

const StepSchema = z.lazy(() =>
  z.union([
    ForEachStepSchema,
    WhileStepSchema,
    IfStepSchema,
    SwitchStepSchema,
    WaitStepSchema,
    WaitForInputStepSchema,
    WaitForApprovalStepSchema,
    DataSetStepSchema,
    ElasticsearchStepSchema,
    KibanaStepSchema,
    ParallelStepSchema,
    MergeStepSchema,
    WorkflowExecuteStepSchema,
    WorkflowExecuteAsyncStepSchema,
    WorkflowOutputStepSchema,
    WorkflowFailStepSchema,
    LoopBreakStepSchema,
    LoopContinueStepSchema,
    BaseConnectorStepSchema,
  ])
);
export type Step = z.infer<typeof StepSchema>;

export const LoopStepTypes = [
  ForEachStepSchema.shape.type.value,
  WhileStepSchema.shape.type.value,
] as const;
export type LoopStepType = (typeof LoopStepTypes)[number];

export const BuiltInStepTypes = [
  ...LoopStepTypes,
  IfStepSchema.shape.type.value,
  SwitchStepSchema.shape.type.value,
  ParallelStepObjectSchema.shape.type.value,
  MergeStepSchema.shape.type.value,
  DataSetStepSchema.shape.type.value,
  WaitStepSchema.shape.type.value,
  WaitForInputStepSchema.shape.type.value,
  WaitForApprovalStepSchema.shape.type.value,
  WorkflowExecuteStepSchema.shape.type.value,
  WorkflowExecuteAsyncStepSchema.shape.type.value,
  WorkflowOutputStepSchema.shape.type.value,
  WorkflowFailStepSchema.shape.type.value,
  LoopBreakStepSchema.shape.type.value,
  LoopContinueStepSchema.shape.type.value,
];
export type BuiltInStepType = (typeof BuiltInStepTypes)[number];

/* --- Workflow --- */
// Base schema without transform - can be extended (used in generate_yaml_schema_from_connectors.ts)
const WorkflowSchemaBase = z.object({
  version: z.literal('1').optional().default('1').describe('The version of the workflow schema'),
  name: z.string().min(1),
  description: z.string().optional(),
  settings: WorkflowSettingsSchema.optional(),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
  outputs: z.union([JsonModelSchema, z.array(WorkflowOutputSchema)]).optional(),
  consts: WorkflowConstsSchema.optional(),
  steps: z.array(StepSchema).min(1),
});

/** Normalize inputs or outputs from either JSON Schema or legacy array format to JsonModelSchema. */
function normalizeFieldsToJsonSchema(value: unknown): z.infer<typeof JsonModelSchema> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value) && 'properties' in value) {
    return value as z.infer<typeof JsonModelSchema>;
  }
  if (Array.isArray(value)) {
    return convertLegacyFieldsToJsonSchema(value);
  }
  return undefined;
}

export const WorkflowSchema = WorkflowSchemaBase.extend({
  triggers: z.array(TriggerSchema).min(1),
}).transform((data) => {
  const normalizedOutputs = normalizeFieldsToJsonSchema(data.outputs);

  const mappedTriggers = (data.triggers ?? []).map((trigger) => {
    if (!isManualTrigger(trigger) || !trigger.inputs) {
      return trigger;
    }

    return {
      ...trigger,
      inputs: normalizeFieldsToJsonSchema(trigger.inputs),
    };
  });

  const { outputs: __, ...rest } = data;
  return {
    ...rest,
    ...(normalizedOutputs !== undefined && { outputs: normalizedOutputs }),
    triggers: mappedTriggers,
  };
});

// Export base schema for extension (used in generate_yaml_schema_from_connectors.ts)
export { WorkflowSchemaBase };

export type WorkflowYaml = z.infer<typeof WorkflowSchema>;

// Schema is required for autocomplete because WorkflowGraph and WorkflowDefinition use it to build the autocomplete context.
// The schema captures all possible fields and passes them through for consumption by WorkflowGraph.
// We build this from the base object schema (before the pipe) to avoid issues with .partial() on piped schemas
// Base schema without transform - can be extended
const WorkflowSchemaForAutocompleteBase = z
  .object({
    version: z.literal('1').optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    settings: WorkflowSettingsSchema.optional(),
    enabled: z.boolean().default(true).optional(),
    tags: z.array(z.string()).optional(),
    triggers: z
      .array(z.object({ type: z.string().catch('') }).passthrough())
      .catch([])
      .default([]),
    outputs: z
      .union([
        JsonModelSchema,
        z.array(
          z
            .object({
              name: z.string().catch(''),
              type: z.string().catch(''),
            })
            .passthrough()
        ),
      ])
      .optional()
      .catch(undefined),
    consts: WorkflowConstsSchema.optional(),
    steps: z
      .array(
        z
          .object({
            type: z.string().catch(''),
            name: z.string().catch(''),
          })
          .passthrough()
      )
      .catch([])
      .default([]),
  })
  .passthrough();

// Final schema with transform - ensure version default is applied
export const WorkflowSchemaForAutocomplete = WorkflowSchemaForAutocompleteBase.transform(
  (data) => ({
    ...data,
    version: data.version ?? '1',
  })
);

// Export base schema for extension (used in generate_yaml_schema_from_connectors.ts)
export { WorkflowSchemaForAutocompleteBase };

// Canonical shape for normalized LLM token usage. The `WorkflowTokenUsage` type
// in `types/v1.ts` is derived from this schema, so there is a single source of
// truth shared by runtime validation (workflow context) and the TS types.
export const WorkflowTokenUsageSchema = z.object({
  inputTokens: z.number().describe('Total input (prompt) tokens consumed.'),
  outputTokens: z.number().describe('Total output (completion) tokens produced.'),
  cachedTokens: z
    .number()
    .optional()
    .describe('Cached input tokens reused. This is a subset of inputTokens.'),
  totalTokens: z.number().describe('Sum of input and output tokens.'),
});

// Token usage attributed to a single step, adding the step id and its resolved
// connector to the aggregate token shape.
export const WorkflowStepTokenUsageSchema = WorkflowTokenUsageSchema.extend({
  stepId: z.string().max(512).describe('Id of the step that produced this usage.'),
  connectorId: z
    .string()
    .max(CONNECTOR_ID_MAX_LENGTH)
    .optional()
    .describe('Id of the LLM connector the step resolved to, when reported by the model.'),
});

export const WorkflowExecutionContextSchema = z.object({
  id: z.string(),
  isTestRun: z.boolean(),
  startedAt: z.date(),
  url: z.string(),
  executedBy: z.string().optional(),
  triggeredBy: z.string().optional(),
  usage: WorkflowTokenUsageSchema.optional(),
});
export type WorkflowExecutionContext = z.infer<typeof WorkflowExecutionContextSchema>;

export const WorkflowDataContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  spaceId: z.string(),
  version: z
    .number()
    .optional()
    .describe('Workflow document version captured when the execution was created.'),
});
export type WorkflowDataContext = z.infer<typeof WorkflowDataContextSchema>;

/**
 * Timestamp injected by the platform for event-driven (custom) trigger events only.
 */
export const EventTimestampSchema = z.object({
  timestamp: z.string().describe('Time when the event was received (ISO 8601).'),
});

// Recursive type for workflow inputs that supports nested objects from JSON Schema
const WorkflowInputValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
    z.array(z.boolean()),
    z.record(z.string(), WorkflowInputValueSchema),
  ])
);

export const WorkflowHitlTemplateContextSchema = z.object({
  [HITL_EXTERNAL_FORM_LINK_CONTEXT_KEY]: z
    .string()
    .max(MAX_HITL_EXTERNAL_LINK_LENGTH)
    .optional()
    .describe('External waitForInput form URL, available while the step is waiting'),
  [HITL_EXTERNAL_QUERY_LINK_CONTEXT_KEY]: z
    .string()
    .max(MAX_HITL_EXTERNAL_LINK_LENGTH)
    .optional()
    .describe('External GET resume URL with token set. Append `&<field>=<value>` per with.schema.'),
});

export const WorkflowTemplatePersistedContextSchema = z.object({
  hitl: WorkflowHitlTemplateContextSchema.optional(),
});

export const WorkflowContextSchema = z.object({
  /**
   * Persisted execution-context values exposed to templates as `context.*`
   * (for example `context.hitl.externalFormLink` during external waitForInput).
   */
  context: WorkflowTemplatePersistedContextSchema.optional(),
  /**
   * Alias for the inputs defined on the manual trigger (`triggers[type=manual].inputs`) or
   * workflow call trigger (`triggers[type=workflow_call].inputs`). Populated from the trigger's
   * event.input values at execution time.
   */
  inputs: z.record(z.string(), z.unknown()).optional(),
  event: AlertEventSchema.optional(),
  execution: WorkflowExecutionContextSchema,
  workflow: WorkflowDataContextSchema,
  kibanaUrl: z.string(),
  output: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.union([z.array(z.string()), z.array(z.number()), z.array(z.boolean())]),
      ])
    )
    .optional(),
  consts: z.record(z.string(), z.any()).optional(),
  now: z.date().optional(),
  parent: z
    .object({
      workflowId: z.string(),
      executionId: z.string(),
      depth: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;

export const DynamicWorkflowContextSchema = WorkflowContextSchema.extend({
  // overriding record with object to avoid type mismatch when
  // extending with actual inputs, outputs and consts of different types
  inputs: z.object({}),
  output: z.object({}),
  consts: z.object({}),
  // overriding event with base event schema (spaceId only) so it can be
  // dynamically extended with trigger-specific properties (e.g., alerts, rule)
  event: BaseEventSchema.optional(),
});
export type DynamicWorkflowContext = z.infer<typeof DynamicWorkflowContextSchema>;

export const StepDataSchema = z.object({
  output: z.any().optional(),
  error: z.any().optional(),
});
export type StepData = z.infer<typeof StepDataSchema>;

const ForEachContextItemSchema = z.unknown();
export const ForEachContextSchema = z.object({
  items: z.array(ForEachContextItemSchema),
  index: z.number().int(),
  item: ForEachContextItemSchema,
  total: z.number().int(),
});
export type ForEachContext = z.infer<typeof ForEachContextSchema>;

export const BaseSerializedErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type SerializedError = z.infer<typeof BaseSerializedErrorSchema>;

export const WhileContextSchema = z.object({
  iteration: z.number().int(),
});
export type WhileContext = z.infer<typeof WhileContextSchema>;

export const StepContextSchema = WorkflowContextSchema.extend({
  steps: z.record(z.string(), StepDataSchema),
  foreach: ForEachContextSchema.optional(),
  while: WhileContextSchema.optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  error: BaseSerializedErrorSchema.optional(),
});
export type StepContext = z.infer<typeof StepContextSchema>;

export const DynamicStepContextSchema = DynamicWorkflowContextSchema.extend({
  // overriding record with object to avoid type mismatch when
  // extending with actual step ids and different output types
  steps: z.object({}),
});
export type DynamicStepContext = z.infer<typeof DynamicStepContextSchema>;
