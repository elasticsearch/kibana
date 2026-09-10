/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ACTION_POLICY_MANAGEMENT_SKILL_ID, RULE_KIND_LABELS } from '@kbn/alerting-v2-constants';
import {
  createRuleDataBaseSchema,
  createActionPolicyDataSchema,
  alertEventSeveritySchema,
  alertEpisodeStatusSchema,
  ruleKindSchema,
  recoveryStrategySchema,
  recoveryStrategy,
  noDataStrategySchema,
  groupingModeSchema,
  throttleStrategySchema,
  MATCHER_CONTEXT_FIELDS,
  PER_EPISODE_STRATEGIES,
  AGGREGATE_STRATEGIES,
  STRATEGIES_REQUIRING_INTERVAL,
} from '@kbn/alerting-v2-schemas';
import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  builtinWorkflowInputDefinitions,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '@kbn/workflows';
import {
  ruleOperationSchema,
  setStateTransitionOperationSchema,
} from '../tools/manage_rule/operations';
import { actionPolicyOperationSchema } from '../tools/manage_action_policy/operations';

type JsonSchemaNode = Record<string, unknown>;

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  constraints: string;
}

export interface DescribedEnumValue {
  value: string;
  description: string;
}

const LARGE_ENUM_THRESHOLD = 20;

export class SchemaTranslationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SchemaTranslationError';
  }
}

const throwIfNotZodUnion = (schema: z.ZodType, schemaName: string): z.ZodUnion => {
  if (!(schema instanceof z.ZodUnion)) {
    throw new SchemaTranslationError(
      `${schemaName} is not a union of described literals. Use z.union of z.literal(...).describe(...) on each value.`
    );
  }
  return schema;
};

const throwIfMissingDescribes = (missing: string[], subject: string, detail?: string): void => {
  if (missing.length === 0) {
    return;
  }
  const suffix = detail ? ` ${detail}` : '';
  throw new SchemaTranslationError(
    `Missing .describe() on ${subject}: ${missing.join(', ')}.${suffix}`
  );
};

const throwIfMissingOperationDescribes = (
  variants: JsonSchemaNode[] | undefined,
  title: string
): void => {
  const missing = (variants ?? [])
    .filter(
      (variant) =>
        typeof variant.description !== 'string' || variant.description.trim().length === 0
    )
    .map((variant) => {
      const operation = (variant.properties as JsonSchemaNode | undefined)?.operation as
        | JsonSchemaNode
        | undefined;
      const value = operation?.const ?? (operation?.enum as string[] | undefined)?.[0];
      return typeof value === 'string' ? value : '(unnamed variant)';
    });

  throwIfMissingDescribes(
    missing,
    'operation variant(s)',
    `Add a top-level .describe() explaining the user goal to each listed variant (${title}).`
  );
};

/**
 * Replaces large enum arrays with a compact description to keep token counts
 * manageable. Reuses the pattern from the workflows plugin
 * (`build_trigger_definitions_for_agent.ts`).
 */
function compactLargeEnums(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(compactLargeEnums);

  const obj = node as JsonSchemaNode;
  const result: JsonSchemaNode = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'enum' && Array.isArray(value) && value.length > LARGE_ENUM_THRESHOLD) {
      const examples = value.slice(0, 5) as string[];
      result.type = 'string';
      result.description = [
        obj.description ?? '',
        `One of ${value.length} allowed values, e.g.: ${examples.join(', ')}`,
      ]
        .filter(Boolean)
        .join('. ');
    } else {
      result[key] = compactLargeEnums(value);
    }
  }

  return result;
}

const REF_PREFIXES = ['#/definitions/', '#/$defs/'] as const;

/** Keys that carry schema composition rather than the field's own shape. */
const COMPOSITION_KEYS = new Set(['$ref', 'allOf', 'definitions', '$defs', '$schema']);

function resolveRef(ref: string, root: JsonSchemaNode): JsonSchemaNode | undefined {
  if (ref === '#') return root;
  const prefix = REF_PREFIXES.find((candidate) => ref.startsWith(candidate));
  if (!prefix) return undefined;
  const defs = (root.definitions ?? root.$defs) as JsonSchemaNode | undefined;
  const target = defs?.[decodeURIComponent(ref.slice(prefix.length))];
  return target && typeof target === 'object' ? (target as JsonSchemaNode) : undefined;
}

/** Merges a referenced schema with the referencing site's own keys; the referencing site wins. */
function mergeSchemaNodes(base: JsonSchemaNode, override: JsonSchemaNode): JsonSchemaNode {
  const merged: JsonSchemaNode = { ...base, ...override };

  const baseProperties = base.properties as JsonSchemaNode | undefined;
  const overrideProperties = override.properties as JsonSchemaNode | undefined;
  if (baseProperties || overrideProperties) {
    merged.properties = { ...baseProperties, ...overrideProperties };
  }

  const required = [
    ...((base.required as string[]) ?? []),
    ...((override.required as string[]) ?? []),
  ];
  if (required.length > 0) merged.required = [...new Set(required)];

  return merged;
}

/**
 * Expands `$ref` pointers back into the tree. Every schema carrying a
 * `.meta({ id })` is hoisted into `definitions` by `z.toJSONSchema`, and
 * draft-7 — which cannot combine `$ref` with sibling keys — wraps the pointer
 * in a single-member `allOf`. The renderers below read `type`, `enum` and
 * `properties` directly, so unresolved pointers would render as `unknown`.
 * `visiting` tracks the pointers on the current path to stop self-referencing
 * definitions from recursing forever.
 */
function inlineRefs(node: unknown, root: JsonSchemaNode, visiting: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, root, visiting));
  if (node === null || typeof node !== 'object') return node;

  const obj = node as JsonSchemaNode;
  const own: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(obj)) {
    if (COMPOSITION_KEYS.has(key)) continue;
    own[key] = inlineRefs(value, root, visiting);
  }

  const bases: JsonSchemaNode[] = [];
  const { $ref: ref, allOf } = obj;
  if (typeof ref === 'string' && !visiting.has(ref)) {
    const target = resolveRef(ref, root);
    if (target) {
      const nested = new Set(visiting).add(ref);
      bases.push(inlineRefs(target, root, nested) as JsonSchemaNode);
    }
  }
  if (Array.isArray(allOf)) {
    for (const member of allOf) {
      bases.push(inlineRefs(member, root, visiting) as JsonSchemaNode);
    }
  }

  return [...bases, own].reduce(mergeSchemaNodes, {});
}

function zodToJsonSchema(schema: z.ZodType): unknown {
  try {
    const jsonSchema = z.toJSONSchema(schema, {
      target: 'draft-7',
      unrepresentable: 'any',
    }) as JsonSchemaNode;
    return compactLargeEnums(inlineRefs(jsonSchema, jsonSchema, new Set()));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new SchemaTranslationError(
      `Failed to convert Zod schema to JSON Schema: ${message}. Check the Zod schema passed to skill-doc generation.`,
      e
    );
  }
}

/** Builds the parenthetical constraint text for a field-table Description cell. */
function formatFieldConstraintsSummary(prop: JsonSchemaNode): string {
  const parts: string[] = [];
  if (prop.minLength !== undefined) parts.push(`min length: ${prop.minLength}`);
  if (prop.maxLength !== undefined) parts.push(`max length: ${prop.maxLength}`);
  if (prop.minimum !== undefined) parts.push(`min: ${prop.minimum}`);
  if (prop.maximum !== undefined) parts.push(`max: ${prop.maximum}`);
  if (prop.pattern !== undefined) parts.push(`pattern: ${prop.pattern}`);
  if (prop.enum !== undefined && Array.isArray(prop.enum)) {
    parts.push(`enum: ${(prop.enum as string[]).join(' | ')}`);
  }
  if (prop.minItems !== undefined) parts.push(`min items: ${prop.minItems}`);
  if (prop.maxItems !== undefined) parts.push(`max items: ${prop.maxItems}`);
  if (prop.default !== undefined) parts.push(`default: ${JSON.stringify(prop.default)}`);
  return parts.join(', ');
}

/**
 * JSON Schema `type` may be a union array — nullable fields are emitted as
 * `['string', 'null']` rather than as an `anyOf`.
 */
function formatTypeKeyword(type: unknown): string {
  if (Array.isArray(type)) {
    return (type as string[]).join(' | ');
  }
  return (type as string) ?? 'unknown';
}

function resolveType(prop: JsonSchemaNode): string {
  if (prop.const !== undefined) {
    return `"${prop.const}"`;
  }
  if (prop.enum !== undefined && Array.isArray(prop.enum)) {
    return (prop.enum as string[]).map((v) => `"${v}"`).join(' | ');
  }
  if (prop.anyOf !== undefined && Array.isArray(prop.anyOf)) {
    return (prop.anyOf as JsonSchemaNode[]).map(resolveType).join(' | ');
  }
  if (prop.oneOf !== undefined && Array.isArray(prop.oneOf)) {
    const variants = prop.oneOf as JsonSchemaNode[];
    if (variants.every((variant) => variant.const !== undefined)) {
      return variants.map(resolveType).join(' | ');
    }
    return variants
      .map((variant) => {
        const disc = variant.properties as JsonSchemaNode | undefined;
        if (disc) {
          const firstKey = Object.keys(disc)[0];
          const firstProp = disc[firstKey] as JsonSchemaNode | undefined;
          if (firstProp?.const) return `{ ${firstKey}: "${firstProp.const}", ... }`;
        }
        return (variant.type as string) ?? 'variant';
      })
      .join(' | ');
  }
  const types = Array.isArray(prop.type) ? (prop.type as string[]) : [prop.type as string];
  if (types.includes('array')) {
    const items = prop.items as JsonSchemaNode | undefined;
    const itemType = items ? resolveType(items) : 'unknown';
    return [`${itemType}[]`, ...types.filter((t) => t !== 'array')].join(' | ');
  }
  return formatTypeKeyword(prop.type);
}

function jsonSchemaToFieldTable(jsonSchema: unknown): FieldInfo[] {
  if (!jsonSchema || typeof jsonSchema !== 'object') return [];
  const schema = jsonSchema as JsonSchemaNode;
  const properties = schema.properties as JsonSchemaNode | undefined;
  if (!properties) return [];
  const required = new Set((schema.required as string[]) ?? []);

  return Object.entries(properties).map(([name, rawProp]) => {
    const prop = rawProp as JsonSchemaNode;
    return {
      name,
      type: resolveType(prop),
      required: required.has(name),
      description: (prop.description as string) ?? '',
      constraints: formatFieldConstraintsSummary(prop),
    };
  });
}

/**
 * Type unions and enum lists contain `|`, which would otherwise split the cell into extra columns.
 * Backslashes are escaped first so a literal `\` before a pipe cannot consume the escape we add.
 */
function escapeTableCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function formatFieldTable(fields: FieldInfo[]): string {
  if (fields.length === 0) return '';
  const rows = fields.map((f) => {
    const description = escapeTableCell(
      `${f.description}${f.constraints ? ` (${f.constraints})` : ''}`
    );
    return `| \`${f.name}\` | ${escapeTableCell(f.type)} | ${
      f.required ? 'required' : 'optional'
    } | ${description} |`;
  });
  return ['| Field | Type | Required | Description |', '|---|---|---|---|', ...rows].join('\n');
}

function formatVariantSchemas(jsonSchema: unknown): string {
  if (!jsonSchema || typeof jsonSchema !== 'object') return '';
  const schema = jsonSchema as JsonSchemaNode;
  const variants = (schema.oneOf ?? schema.anyOf) as JsonSchemaNode[] | undefined;
  if (!variants) return '';

  const sections: string[] = [];
  for (const variant of variants) {
    const props = variant.properties as JsonSchemaNode | undefined;
    if (!props) continue;

    const discriminatorKey = Object.keys(props).find((k) => {
      const p = props[k] as JsonSchemaNode;
      return p.const !== undefined || (p.enum && (p.enum as string[]).length === 1);
    });
    const discriminatorValue = discriminatorKey
      ? ((props[discriminatorKey] as JsonSchemaNode).const as string) ??
        ((props[discriminatorKey] as JsonSchemaNode).enum as string[])?.[0]
      : undefined;

    const label =
      discriminatorKey && discriminatorValue
        ? `\`${discriminatorKey}: "${discriminatorValue}"\``
        : variant.description ?? 'Variant';

    const fields = jsonSchemaToFieldTable(variant);
    if (fields.length > 0) {
      const description =
        typeof variant.description === 'string' && variant.description.trim().length > 0
          ? `${variant.description}\n\n`
          : '';
      sections.push(`#### ${label}\n\n${description}${formatFieldTable(fields)}`);
    }
  }
  return sections.join('\n\n');
}

const toOperationJsonSchema = (schema: z.ZodType, title: string): JsonSchemaNode => {
  const jsonSchema = zodToJsonSchema(schema) as JsonSchemaNode;
  throwIfMissingOperationDescribes(
    (jsonSchema.oneOf ?? jsonSchema.anyOf) as JsonSchemaNode[] | undefined,
    title
  );
  return jsonSchema;
};

/**
 * Generates markdown for a create/update API Zod schema (top-level field table,
 * plus optional extra sections such as query format variants).
 */
export const generateApiSchemaDoc = ({
  title,
  schema,
  extraSections,
}: {
  title: string;
  schema: z.ZodType;
  extraSections?: (jsonSchema: unknown) => Array<{ heading: string; content: string }> | undefined;
}): string => {
  const jsonSchema = zodToJsonSchema(schema);
  const fieldTable = formatFieldTable(jsonSchemaToFieldTable(jsonSchema));

  const sections = [`# ${title}`, '', '## Top-Level Fields', '', fieldTable];

  for (const extra of extraSections?.(jsonSchema) ?? []) {
    if (extra.content) {
      sections.push('', `## ${extra.heading}`, '', extra.content);
    }
  }

  return sections.join('\n');
};

/**
 * Generates concise markdown documentation from the create-rule Zod schema.
 * Intended for embedding in the skill's `referencedContent`.
 */
export const generateRuleSchemaDoc = (): string =>
  generateApiSchemaDoc({
    title: 'Rule API Schema Reference',
    schema: createRuleDataBaseSchema,
    extraSections: (jsonSchema) => {
      const props = (jsonSchema as JsonSchemaNode).properties as JsonSchemaNode | undefined;
      if (!props?.query) {
        return undefined;
      }
      const queryVariants = formatVariantSchemas(props.query as JsonSchemaNode);
      return queryVariants ? [{ heading: 'Query Formats', content: queryVariants }] : undefined;
    },
  });

/**
 * Generates markdown for a discriminated-union tool operations schema
 * (e.g. `manage_rule` / `manage_action_policy`).
 */
export const generateOperationsDoc = ({
  title,
  schema,
}: {
  title: string;
  schema: z.ZodType;
}): string => {
  const jsonSchema = toOperationJsonSchema(schema, title);
  return [`# ${title}`, '', formatVariantSchemas(jsonSchema)].join('\n');
};

/**
 * Bullet list of each operation's top-level `.describe()`. Use this in a tool
 * description so usage copy stays in sync with the Zod schema instead of a
 * hand-written operations list.
 */
export const generateOperationsUsageList = ({
  title,
  schema,
}: {
  title: string;
  schema: z.ZodType;
}): string => {
  const jsonSchema = toOperationJsonSchema(schema, title);
  const variants = (jsonSchema.oneOf ?? jsonSchema.anyOf) as JsonSchemaNode[];
  return variants.map((variant) => `- ${variant.description}`).join('\n');
};

/**
 * Generates concise markdown documentation for the manage_rule tool operations.
 */
export const generateRuleOperationsDoc = (): string =>
  generateOperationsDoc({
    title: 'Rule Operations Schema Reference',
    schema: ruleOperationSchema,
  });

/** Operation `.describe()` list for the `manage_rule` tool description. */
export const generateRuleOperationsUsageList = (): string =>
  generateOperationsUsageList({
    title: 'Rule Operations Schema Reference',
    schema: ruleOperationSchema,
  });

export const getSeverityValues = (): string[] => alertEventSeveritySchema.options;

/**
 * Reads per-value `.describe()` copy from a Zod union of literals.
 * Throws if a value has no description. Callers catch this during skill
 * registration and log rather than aborting Kibana start.
 */
export const getDescribedEnumValues = (
  schema: z.ZodType,
  schemaName: string
): DescribedEnumValue[] => {
  const union = throwIfNotZodUnion(schema, schemaName);

  const missing: string[] = [];
  const values: DescribedEnumValue[] = [];
  for (const option of union.options) {
    if (!(option instanceof z.ZodLiteral) || typeof option.value !== 'string') {
      missing.push('(non-literal value)');
      continue;
    }
    const description = option.description?.trim() ?? '';
    if (!description) {
      missing.push(option.value);
      continue;
    }
    values.push({ value: option.value, description });
  }

  throwIfMissingDescribes(missing, `${schemaName} value(s)`);
  return values;
};

export const getEpisodeStatusValues = (): string[] =>
  getDescribedEnumValues(alertEpisodeStatusSchema, 'alertEpisodeStatusSchema').map(
    ({ value }) => value
  );

/** Returns the user-facing state transition field names from the operation schema (excludes internal operator fields and `operation`). */
const getStateTransitionFields = (): string[] =>
  Object.keys(setStateTransitionOperationSchema.shape).filter((k) => k !== 'operation');

/**
 * Builds a markdown table from a schema's described literal values.
 */
const generateEnumTable = ({
  header,
  schema,
  schemaName,
}: {
  header: [string, string];
  schema: z.ZodType;
  schemaName: string;
}): string => {
  const rows = getDescribedEnumValues(schema, schemaName).map(
    ({ value, description }) => `| \`${value}\` | ${escapeTableCell(description)} |`
  );
  return [`| ${header[0]} | ${header[1]} |`, '|---|---|', ...rows].join('\n');
};

/**
 * Builds a markdown bullet list from a schema's described literal values.
 */
const generateEnumList = ({
  schema,
  schemaName,
}: {
  schema: z.ZodType;
  schemaName: string;
}): string =>
  getDescribedEnumValues(schema, schemaName)
    .map(({ value, description }) => `- \`${value}\`: ${description}`)
    .join('\n');

/** Formats enum values as an inline comma-separated backtick list. */
export const formatEnumValuesList = (values: readonly string[]): string =>
  values.map((v) => `\`${v}\``).join(', ');

/** Formats a set of strategy values as an inline backtick list. */
const formatStrategySet = (strategies: Set<string>): string =>
  formatEnumValuesList([...strategies]);

/**
 * Generates standalone markdown for throttle / grouping compatibility from
 * `groupingModeSchema`, `PER_EPISODE_STRATEGIES`, `AGGREGATE_STRATEGIES`, and
 * `STRATEGIES_REQUIRING_INTERVAL`.
 */
export const generateThrottleGroupingCompatibilityDoc = (): string => {
  const groupingModesList = generateEnumList({
    schema: groupingModeSchema,
    schemaName: 'groupingModeSchema',
  });

  const perEpisodeOnlyStrategies = [...PER_EPISODE_STRATEGIES].filter(
    (strategy) => !AGGREGATE_STRATEGIES.has(strategy)
  );
  const notPerEpisodeStrategies = [...AGGREGATE_STRATEGIES].filter(
    (strategy) => !PER_EPISODE_STRATEGIES.has(strategy)
  );

  const caveats: string[] = [];
  if (perEpisodeOnlyStrategies.length > 0) {
    caveats.push(
      `- Only valid with \`per_episode\`: ${formatEnumValuesList(perEpisodeOnlyStrategies)}.`
    );
  }
  if (notPerEpisodeStrategies.length > 0) {
    caveats.push(
      `- Not valid with \`per_episode\`: ${formatEnumValuesList(notPerEpisodeStrategies)}.`
    );
  }
  caveats.push(
    `- Require an \`interval\` (e.g. \`"5m"\`, \`"1h"\`): ${formatStrategySet(
      STRATEGIES_REQUIRING_INTERVAL
    )}.`
  );

  return [
    '# Throttle / Grouping Compatibility',
    '',
    groupingModesList,
    '',
    'Caveats:',
    ...caveats,
    '',
    'If you set both in one request, put `set_grouping` before `set_throttle`. The tool',
    'validates compatibility after all operations run.',
    '',
    'Related: [action-policy-grouping-modes](./action-policy-grouping-modes.md), [action-policy-throttle-strategies](./action-policy-throttle-strategies.md).',
  ].join('\n');
};

/** Product-facing label for a rule kind (`Alerts` / `Events`). Throws if a kind has no UI label. */
const getRuleKindProductLabel = (kind: string): string => {
  const label = RULE_KIND_LABELS[kind as keyof typeof RULE_KIND_LABELS];
  if (!label) {
    throw new SchemaTranslationError(
      `Missing product label for rule kind "${kind}". Add it to RULE_KIND_LABELS.`
    );
  }
  return label;
};

/** Generates the Rule Kind section with heading, per-kind subsections, and immutability note. */
export const generateRuleKindDoc = (): string => {
  const kinds = getDescribedEnumValues(ruleKindSchema, 'ruleKindSchema');
  const episodeStatuses = formatEnumValuesList(getEpisodeStatusValues());
  const transitionFields = formatEnumValuesList(getStateTransitionFields());

  const kindSections = kinds.flatMap(({ value, description }, i) => {
    const heading = `### ${getRuleKindProductLabel(value)} (\`kind: ${value}\`)`;
    const lines = [heading, description];
    if (value === 'alert') {
      lines.push(`Episode statuses: ${episodeStatuses}.`);
      lines.push(`State transition fields: ${transitionFields}.`);
    }
    return i > 0 ? ['', ...lines] : lines;
  });

  const alertLabel = getRuleKindProductLabel('alert');
  const signalLabel = getRuleKindProductLabel('signal');

  return [
    `# Rule Kind: ${alertLabel} vs ${signalLabel}`,
    '',
    `Rules declare a \`kind\` of \`alert\` (${alertLabel}) or \`signal\` (${signalLabel}). This is the most important behavioral split in the system.`,
    '',
    ...kindSections,
    '',
    '## Immutability',
    '`kind` is **immutable on persisted rules** — it can only be set at creation time. The update API rejects changes to `kind`. For draft (in-memory) rules, `set_kind` can change it freely.',
  ].join('\n');
};

/**
 * Generates the notifications-overview reference: action policies, plus how to
 * handle notification requests on Events (`kind: signal`) vs Alerts (`kind: alert`) rules.
 */
export const generateNotificationsOverviewDoc = (): string => {
  const alertLabel = getRuleKindProductLabel('alert');
  const signalLabel = getRuleKindProductLabel('signal');

  return [
    '# Notifications via Action Policies',
    '',
    'Notifications are not configured on the rule itself. Alert episodes are matched and dispatched by **action policies** — space-scoped saved objects that send matched episodes to workflow destinations.',
    '',
    `When the user needs notifications (email, Slack, PagerDuty, etc.), load the \`${ACTION_POLICY_MANAGEMENT_SKILL_ID}\` skill. That skill owns action policy CRUD, workflow destination wiring, and the default notification setup flow.`,
    '',
    '## Notifications Require Alert Kind',
    '',
    `Action policies only process ${alertLabel} (\`kind: alert\`). ${signalLabel} (\`kind: signal\`) do not participate in episode lifecycle or notification dispatch. See the [rule-kind reference](./rule-kind.md) and [episode-lifecycle reference](./episode-lifecycle.md).`,
    '',
    'When a user asks for notifications on a rule that is currently `kind: signal` (or when composing a new rule where the user wants notifications):',
    '',
    `1. **Explain the difference**: ${signalLabel} (\`kind: signal\`) rules are observation-only and do not trigger notifications. ${alertLabel} (\`kind: alert\`) track episode lifecycle and can dispatch to action policies.`,
    `2. If the rule is a **draft (in-memory)**: use \`set_kind\` to change it to \`alert\`, then load the \`${ACTION_POLICY_MANAGEMENT_SKILL_ID}\` skill for notification setup.`,
    `3. If the rule is **persisted**: \`kind\` is immutable after creation. Inform the user that the existing ${signalLabel} (\`kind: signal\`) rule cannot be converted. Offer to create a new ${alertLabel} (\`kind: alert\`) rule with the same query and schedule, then set up notifications on the new rule.`,
    `4. After ensuring the rule is \`kind: alert\`, load the \`${ACTION_POLICY_MANAGEMENT_SKILL_ID}\` skill for notification setup.`,
  ].join('\n');
};

/** Generates the State Transition section with heading, field list from schema, and constraints. */
export const generateStateTransitionDoc = (): string => {
  const fields = getStateTransitionFields();
  const jsonSchema = zodToJsonSchema(setStateTransitionOperationSchema) as JsonSchemaNode;
  const properties = (jsonSchema.properties ?? {}) as JsonSchemaNode;

  const bullets = fields.map((f) => {
    const prop = properties[f] as JsonSchemaNode | undefined;
    const description = prop?.description as string | undefined;
    if (!description) {
      throw new SchemaTranslationError(
        `Missing .describe() on set_state_transition field "${f}". Add .describe() to that field on setStateTransitionOperationSchema.`
      );
    }
    return `- \`${f}\` — ${description}`;
  });

  return [
    '## State Transition',
    '',
    'Use `set_state_transition` to delay alert firing until the threshold is breached N times in a row. This reduces noise from transient spikes.',
    '',
    ...bullets,
    '',
    'State transition is only allowed on `kind: alert` rules. Refer to the [rule-operations-schema reference](./references/rule-operations-schema.md) for the full field schema.',
  ].join('\n');
};

/** Generates the Episode Lifecycle section with heading, prose, and status table. */
export const generateEpisodeLifecycleDoc = (): string => {
  const table = generateEnumTable({
    header: ['Status', 'Meaning'],
    schema: alertEpisodeStatusSchema,
    schemaName: 'alertEpisodeStatusSchema',
  });

  return [
    '# Episode Lifecycle',
    '',
    'Episodes are the unit of alert state. Each unique group (by `group_hash`) has its own episode. Each episode has a status that reflects where it is in the lifecycle:',
    '',
    table,
    '',
    'Only `kind: alert` rules produce episodes. `kind: signal` rules write raw signal events with no episode tracking.',
  ].join('\n');
};

/** Generates standalone markdown for alert event severity: valid values and ES|QL patterns. */
export const generateSeverityDoc = (): string => {
  const values = formatEnumValuesList(getSeverityValues());

  return [
    '# Alert Event Severity',
    '',
    'Severity is a per-event property on alert events and episodes, not a rule-level field. It is extracted at execution time from a column named `severity` in the ES|QL breach query output.',
    '',
    `- **Valid values**: ${values} (case-insensitive).`,
    '- If the breach query does not produce a `severity` column, alert events have no severity.',
    '- Different groups can produce different severities in the same rule execution (the value comes from each row).',
    '- Action policies can match on `severity` to route high-severity episodes differently (e.g. PagerDuty for critical, email for low).',
    '',
    '### Setting Severity in ES|QL',
    '',
    'Severity is set by adding a `severity` column to the breach query via `EVAL`:',
    '',
    '- **Literal severity** — all alerts from the rule share the same severity:',
    '  `| EVAL severity = "critical"`',
    '- **Conditional severity** — severity varies per group based on data:',
    '  `| EVAL severity = CASE(cpu > 0.95, "critical", cpu > 0.8, "high", "medium")`',
  ].join('\n');
};

/** Generates standalone markdown for no-data strategy: values, wiring, and kind constraints. */
export const generateNoDataStrategyDoc = (): string => {
  const table = generateEnumTable({
    header: ['Value', 'Behaviour'],
    schema: noDataStrategySchema,
    schemaName: 'noDataStrategySchema',
  });

  return [
    '# No-Data Strategy',
    '',
    '`no_data_strategy` is a **top-level rule field** that controls behaviour when no data is present.',
    '',
    table,
    '',
    "When setting `no_data_strategy` to anything other than `'none'`, add a `no_data` block to the standalone query:",
    "`no_data: { query: 'FROM heartbeat-* | STATS count = COUNT(*) BY host.name | WHERE count >= 1' }`. For composed query format, the `base` query is used as the data query.",
    '',
    'Signal rules cannot set `no_data_strategy` ([rule-kind reference](./rule-kind.md)).',
  ].join('\n');
};

/** Generates standalone markdown for recovery strategy: values, wiring, and kind constraints. */
export const generateRecoveryStrategyDoc = (): string => {
  const list = generateEnumList({
    schema: recoveryStrategySchema,
    schemaName: 'recoveryStrategySchema',
  });

  return [
    '# Recovery Strategy',
    '',
    '`recovery_strategy` is a **top-level rule field** (not inside the query). It controls how episodes transition from active to recovering/inactive (see [episode-lifecycle reference](./episode-lifecycle.md)). Signal rules (`kind: signal`) cannot set `recovery_strategy` ([rule-kind reference](./rule-kind.md)).',
    '',
    list,
    '',
    `When using \`recovery_strategy: '${recoveryStrategy.query}'\`, add a \`set_query\` operation that includes a \`recovery\` block alongside \`breach\`:`,
    "- **Composed**: `recovery: { segment: 'WHERE cpu < 0.5' }`",
    "- **Standalone**: `recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' }`",
  ].join('\n');
};

/**
 * Generates markdown for KQL matcher context fields from `MATCHER_CONTEXT_FIELDS`,
 * enriching enum fields from `alertEpisodeStatusSchema` / `alertEventSeveritySchema`.
 */
export const generateMatcherContextDoc = (): string => {
  const episodeStatuses = formatEnumValuesList(getEpisodeStatusValues());
  const severities = formatEnumValuesList(getSeverityValues());

  const formatMatcherFieldType = (path: string, type: string): string => {
    if (path === 'episode_status') return episodeStatuses;
    if (path === 'severity') return severities;
    if (path === 'data') return '`data.*` object';
    return type;
  };

  const rows = MATCHER_CONTEXT_FIELDS.map((field) => {
    const typeCell = escapeTableCell(formatMatcherFieldType(field.path, field.type));
    return `| \`${field.path}\` | ${typeCell} | ${escapeTableCell(field.description)} |`;
  });

  return [
    '# Matcher Context Fields',
    '',
    "When the dispatcher evaluates a policy's KQL matcher, these fields are available:",
    '',
    '| Field | Type | Description |',
    '|---|---|---|',
    ...rows,
    '',
    'An empty matcher is a catch-all that matches all episodes in the space. To scope a policy to a single rule, use `rule.id: "<ruleId>"`.',
  ].join('\n');
};

/** Generates standalone markdown for action-policy grouping modes. */
export const generateGroupingModesDoc = (): string => {
  const list = generateEnumList({
    schema: groupingModeSchema,
    schemaName: 'groupingModeSchema',
  });

  return [
    '# Grouping Modes',
    '',
    list,
    '',
    'Throttle strategy must be compatible with the grouping mode — see [action-policy-throttle-grouping-compatibility](./action-policy-throttle-grouping-compatibility.md).',
  ].join('\n');
};

/** Generates standalone markdown for action-policy throttle strategies. */
export const generateThrottleStrategiesDoc = (): string => {
  const list = generateEnumList({
    schema: throttleStrategySchema,
    schemaName: 'throttleStrategySchema',
  });

  return [
    '# Throttle Strategies',
    '',
    list,
    '',
    'Compatibility with grouping modes — see [action-policy-throttle-grouping-compatibility](./action-policy-throttle-grouping-compatibility.md).',
  ].join('\n');
};

/** Generates standalone markdown for action-policy workflow destinations. */
export const generateWorkflowDestinationsDoc = (): string =>
  [
    '# Workflows',
    '',
    'A workflow is a **concrete automation defined in YAML** that executes when dispatched by an action policy.',
    '',
    '- Workflow steps can use Kibana **connectors** (email, Slack, PagerDuty, etc.) via the `connector-id` field on each step.',
    '- Action policy destinations reference **workflow IDs**, never connector IDs directly.',
    '- Destination workflows must use **exactly one** `triggers: - type: manual` trigger — never `alert`.',
    '- For deeper connector knowledge (types, `connector-id` usage, discovery tools), load the `workflow-authoring` skill.',
  ].join('\n');

/** Generates standalone markdown for the end-to-end notification dispatch path. */
export const generateDispatchFlowDoc = (): string =>
  [
    '# Dispatch Flow',
    '',
    'The end-to-end notification path:',
    '',
    '1. **Rule** (`kind: alert`) evaluates its ES|QL query and writes alert episodes to `.rule-events`.',
    '2. **Dispatcher** (runs on its own Task Manager schedule) reads episodes from `.rule-events`.',
    '3. Dispatcher loads **enabled action policies** for the relevant space.',
    "4. **Matcher evaluation**: each policy's KQL matcher is tested against each episode's context.",
    "5. **Grouping**: matched episodes are grouped according to the policy's `groupingMode` / `groupBy`.",
    "6. **Throttling**: groups are filtered based on the policy's throttle strategy and notification history.",
    "7. **Dispatch**: eligible groups are sent to the policy's **workflow destinations** via `scheduleWorkflow`.",
    '8. **Workflow execution**: workflow steps run, using connectors to deliver notifications (email, Slack, etc.).',
    '',
    "Signal rules (`kind: signal`) are excluded at step 2 — the dispatcher query only selects `type == 'alert'` events.",
  ].join('\n');

/** Generates standalone markdown for the default single-rule action-policy create path. */
export const generateSingleRuleActionPolicyDoc = (): string =>
  [
    '# Single-rule Action Policies',
    '',
    'Use this path when the user wants notifications for **one specific rule**.',
    '',
    'Action policies only process alert episodes. If the rule is `kind: signal`, do not',
    'proceed: ask the user (or the rule-management skill) to convert or recreate the',
    'rule as `kind: alert` first.',
    '',
    'Create the policy with these operations in order:',
    '',
    '1. `set_metadata`: name = `"Notify on <rule-name>"`, description = `"Default notification for <rule-name>"`',
    '2. `set_destinations`: `[{ type: "workflow", id: "<workflowId>" }]`',
    '   - Use the `workflowId` passed to `generate_workflow`, **not** the workflow `attachmentId`.',
    '3. `set_matcher`: `rule.id: "<ruleId>"`',
    '   - `ruleId` comes from the `manage_rule` tool result. It is pre-assigned when the',
    '     rule attachment is created and becomes the saved-object ID when the user clicks',
    '     "Create rule".',
    '   - It is available even for unsaved/proposed rules — do not ask the user to save',
    '     the rule first.',
    '4. `set_grouping`: `per_episode`',
    '5. `set_throttle`: `{ strategy: "on_status_change" }`',
    '',
    'If the user explicitly requests a cross-rule or shared policy, consult the',
    '[multi-rule action policies reference](./action-policy-multi-rule.md).',
  ].join('\n');

/** Generates standalone markdown for shared / multi-rule action-policy matchers. */
export const generateMultiRuleActionPolicyDoc = (): string =>
  [
    '# Multi-rule Action Policies',
    '',
    'Use this path when the user wants **one policy across several rules**, a space-wide',
    'catch-all, or routing by tag/severity — not a policy tied to a single `rule.id`.',
    '',
    'Create the policy with `set_metadata` (name by intent, not by one rule),',
    '`set_destinations` (same `workflowId` rule as the single-rule path), a matcher from',
    'the options below, then `set_grouping` / `set_throttle`.',
    '',
    'A policy matches **episodes**, not a rule object. Policies are space-scoped and are',
    'not bound to a single rule. The matcher is optional KQL over',
    '[matcher context fields](./action-policy-matchers.md).',
    '',
    '- **Catch-all**: omit `set_matcher` or set matcher to empty/`null`. Confirm with the',
    '  user first — this notifies on every `kind: alert` episode in the space, including',
    '  rules created later.',
    '- **Several specific rules**: `rule.id: "<id1>" or rule.id: "<id2>"`. Collect each',
    '  `ruleId` from `manage_rule` / `sml_search` (pre-assigned IDs work for unsaved drafts).',
    '- **A family of rules**: `rule.tags: "production"` or `rule.name: "CPU*"`. Prefer tags',
    '  when the set will grow.',
    '- **Route by severity across rules**: `severity: "critical"` (or combine with tags).',
    '  Useful for a PagerDuty policy vs an email policy.',
    '- **Reuse destinations**: one workflow can serve many rules. Keep Liquid generic —',
    '  `inputs.payload.rules[ep.rule_id].name`, `ep.episode_status`, and guarded',
    '  `ep.data.*` — because query columns often differ across rules. If two rules need',
    '  different message shapes, use two policies (or two workflows) rather than one',
    '  brittle template. See [workflow-dispatch-payload](./workflow-dispatch-payload.md).',
    '- **Search first**: run `platform.core.sml_search` for existing policies before adding',
    '  another catch-all or overlapping tag matcher.',
    '- **Grouping**: `per_episode` is still a safe default. `all` batches mixed-rule',
    '  episodes into a single notification; only use it when the user wants one combined',
    '  message.',
    '',
    'Name shared policies by intent (`"Notify production alerts"`, `"Page on critical"`),',
    'not by a single rule name.',
    '',
    'For the default one-rule path, see [single-rule action policies](./action-policy-single-rule.md).',
  ].join('\n');

/**
 * Generates concise markdown documentation from the create-action-policy Zod schema.
 */
export const generateActionPolicySchemaDoc = (): string =>
  generateApiSchemaDoc({
    title: 'Action Policy API Schema Reference',
    schema: createActionPolicyDataSchema,
  });

/**
 * Generates concise markdown documentation for the manage_action_policy tool operations.
 */
export const generateActionPolicyOperationsDoc = (): string =>
  generateOperationsDoc({
    title: 'Action Policy Operations Schema Reference',
    schema: actionPolicyOperationSchema,
  });

/**
 * Generates concise markdown documentation for the action-policy → workflow dispatch payload.
 * Sourced from the `alertingV2NotificationGroup` built-in workflow input definition, which
 * mirrors `ActionPolicyWorkflowPayload` / `AlertEpisode` in `server/lib/dispatcher/types.ts`.
 *
 * At workflow render time the dispatcher schedules with `{ payload }`, so Liquid templates
 * access these fields as `{{ inputs.payload.<field> }}`.
 */
export const generateActionPolicyWorkflowPayloadDoc = (): string => {
  const jsonSchema =
    builtinWorkflowInputDefinitions[ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID];
  if (!jsonSchema) {
    throw new SchemaTranslationError(
      `Missing built-in workflow input definition "${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}" required by generateActionPolicyWorkflowPayloadDoc.`
    );
  }

  const topLevelFields = jsonSchemaToFieldTable(jsonSchema);
  const topLevelTable = formatFieldTable(topLevelFields);

  const properties = (jsonSchema as JsonSchemaNode).properties as JsonSchemaNode | undefined;
  const episodesProp = properties?.episodes as JsonSchemaNode | undefined;
  const episodeItems = episodesProp?.items as JsonSchemaNode | undefined;
  const episodeFields = episodeItems ? jsonSchemaToFieldTable(episodeItems) : [];
  const episodeTable = formatFieldTable(episodeFields);

  const sections = [
    '# Action Policy Workflow Dispatch Payload',
    '',
    'Catalog of fields the dispatcher passes as `inputs.payload`. In Liquid:',
    '`{{ inputs.payload.<field> }}`, and inside',
    '`{% for ep in inputs.payload.episodes %}` use `{{ ep.<field> }}`.',
    '',
    'Destination workflows must declare `payload` as a manual-trigger input bound to',
    `\`$ref: '${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}'\`;`,
    'see the example below.',
    '',
    '## Top-Level Fields (`inputs.payload`)',
    '',
    topLevelTable,
  ];

  if (episodeTable) {
    sections.push('', '## Episode Fields (`inputs.payload.episodes[]`)', '', episodeTable);
  }

  sections.push(
    '',
    '### `data`',
    '',
    "`data` is the rule's ES|QL result row (each query row is written as `data: rowDoc`",
    'on the alert event). Columns depend on the rule query, so they are not listed above.',
    '',
    '- Nested dotted names: `ep.data.host.name`, not `ep.data["host.name"]`.',
    '- Discover columns with `| LIMIT 0` if they are unclear.',
    '- Guard empty `data` on recovering/inactive: `| default` or `{% if ep.data %}`.',
    '',
    '## Example',
    '',
    'For `FROM logs-* | STATS error_count = COUNT(*) BY host.name | WHERE error_count >= 5`:',
    '',
    '```yaml',
    "version: '1'",
    'name: "Notify: <rule-name>"',
    'enabled: true',
    'triggers:',
    '  - type: manual',
    '    inputs:',
    '      properties:',
    '        payload:',
    `          $ref: '${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}'`,
    '      required:',
    '        - payload',
    'steps:',
    '  - name: send_email',
    '    type: email',
    '    connector-id: <connector-id>',
    '    with:',
    '      to:',
    '        - <user-provided-email>',
    '      subject: "Alert: {{ inputs.payload.episodes | size }} episode(s)"',
    '      message: >',
    '        {% for ep in inputs.payload.episodes %}',
    '        - Rule: {{ inputs.payload.rules[ep.rule_id].name | default: "unknown" }}',
    '          Host: {{ ep.data.host.name | default: "unknown" }}',
    '          Errors: {{ ep.data.error_count | default: "n/a" }}',
    '          Status: {{ ep.episode_status }}',
    '        {% endfor %}',
    '',
    '        View execution: {{ execution.url }}',
    '```'
  );

  return sections.join('\n');
};
