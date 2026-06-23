/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression, toKqlExpression } from '@kbn/es-query';

import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { ALERTING_V2_ERROR_CODES } from '../errors/error_codes';

/**
 * Mapping from clean API-facing field names to their saved-object KQL paths.
 *
 * Clients send filters using these clean names (e.g. `kind: signal`).
 * This mapping lets us translate them into the saved-object-specific
 * KQL format (e.g. `alerting_rule.attributes.kind: signal`) that the
 * saved objects client expects.
 *
 * `id` is special — it lives on the root saved object, not under `.attributes`.
 */
const FIELD_MAP: Record<string, string> = {
  id: `${RULE_SAVED_OBJECT_TYPE}.id`,
  kind: `${RULE_SAVED_OBJECT_TYPE}.attributes.kind`,
  enabled: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled`,
  'metadata.name': `${RULE_SAVED_OBJECT_TYPE}.attributes.metadata.name`,
  'metadata.description': `${RULE_SAVED_OBJECT_TYPE}.attributes.metadata.description`,
  'metadata.tags': `${RULE_SAVED_OBJECT_TYPE}.attributes.metadata.tags`,
};

export const ALLOWED_FILTER_FIELDS = Object.keys(FIELD_MAP);

const toSavedObjectIdFilterValue = (ruleId: string): string => {
  const prefix = `${RULE_SAVED_OBJECT_TYPE}:`;
  if (ruleId === '*' || ruleId.includes('*')) {
    return ruleId;
  }
  return ruleId.startsWith(prefix) ? ruleId : `${prefix}${ruleId}`;
};

/**
 * Validates the field argument of a field-referencing KQL function and
 * rewrites it from the clean API name to the saved-object path.
 */
const rewriteFieldArg = (node: KueryNode): KueryNode => {
  const fieldArg = node.arguments[0];
  if (fieldArg?.type === 'literal' && typeof fieldArg.value === 'string') {
    const apiFieldName = fieldArg.value;
    const soField = FIELD_MAP[apiFieldName];
    if (!soField) {
      throw Boom.badRequest(
        `Invalid filter field "${apiFieldName}". Allowed fields: ${ALLOWED_FILTER_FIELDS.join(
          ', '
        )}`,
        {
          code: ALERTING_V2_ERROR_CODES.INVALID_FILTER_FIELD,
          details: { field: apiFieldName, allowed_fields: ALLOWED_FILTER_FIELDS },
        }
      );
    }

    const rewrittenArgs: KueryNode[] = [
      { ...fieldArg, value: soField },
      ...node.arguments.slice(1),
    ];

    if (apiFieldName === 'id' && node.function === 'is') {
      const valueArg = rewrittenArgs[1];
      if (valueArg?.type === 'literal' && typeof valueArg.value === 'string') {
        rewrittenArgs[1] = {
          ...valueArg,
          value: toSavedObjectIdFilterValue(valueArg.value),
        };
      }
    }

    return {
      ...node,
      arguments: rewrittenArgs,
    };
  }
  return node;
};

/**
 * Recursively walks a KueryNode AST, rewriting API field names to their
 * saved-object paths and validating that only allowed fields are used.
 *
 * Uses an exhaustive switch over all KQL function types (mirroring the
 * pattern in `@kbn/es-query`'s own `getKqlFieldNames`). If a new function
 * type is added to KQL, this will throw immediately rather than silently
 * passing unvalidated fields through.
 *
 * @throws Boom badRequest (400) if a field name is not in the FIELD_MAP.
 * @throws Boom badRequest (400) if an unknown KQL function type is encountered.
 */
const rewriteNode = (node: KueryNode): KueryNode => {
  if (node.type !== 'function') {
    return node;
  }

  switch (node.function) {
    // Compound: recurse into all child expressions
    case 'and':
    case 'or':
      return { ...node, arguments: node.arguments.map(rewriteNode) };

    // Negation: single child expression
    case 'not':
      return { ...node, arguments: [rewriteNode(node.arguments[0])] };

    // Nested: first arg is the nested path (not a filterable field),
    // second arg is the sub-expression to recurse into
    case 'nested':
      return { ...node, arguments: [node.arguments[0], rewriteNode(node.arguments[1])] };

    // Field-referencing: first arg is the field name — validate and rewrite
    case 'is':
    case 'range':
    case 'exists':
      return rewriteFieldArg(node);

    default:
      throw Boom.badRequest(`Unsupported KQL function "${node.function}" in filter`, {
        code: ALERTING_V2_ERROR_CODES.UNSUPPORTED_FILTER_FUNCTION,
        details: { function: node.function },
      });
  }
};

/**
 * Translates a clean API filter string into a saved-object KQL filter
 * by parsing the filter into an AST, walking it to validate and rewrite
 * field names, and serializing back to a KQL string.
 *
 * @example
 * buildRuleSoFilter('kind: signal')
 * // → 'alerting_rule.attributes.kind: signal'
 *
 * @example
 * buildRuleSoFilter('NOT (id: "abc" or id: "def")')
 * // → 'NOT (alerting_rule.id: "alerting_rule:abc" OR alerting_rule.id: "alerting_rule:def")'
 *
 * @example
 * buildRuleSoFilter('enabled: true AND kind: alert')
 * // → '(alerting_rule.attributes.enabled: true AND alerting_rule.attributes.kind: alert)'
 *
 * Returns an empty string unchanged (used for "match all").
 *
 * @throws Boom badRequest (400) if the filter contains a field name not in
 *   the allowed set or uses an unsupported KQL function.
 */
export const buildRuleSoFilter = (apiFilter: string): string => {
  if (!apiFilter) {
    return apiFilter;
  }

  const ast = fromKueryExpression(apiFilter);
  const rewrittenAst = rewriteNode(ast);
  return toKqlExpression(rewrittenAst);
};
