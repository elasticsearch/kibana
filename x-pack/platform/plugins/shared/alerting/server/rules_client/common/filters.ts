/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression, nodeBuilder, toElasticsearchQuery } from '@kbn/es-query';
import { RULE_SAVED_OBJECT_TYPE } from '../..';
import { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../saved_objects';

export const NodeBuilderOperators = {
  and: 'and',
  or: 'or',
} as const;

type NodeBuilderOperatorsType = keyof typeof NodeBuilderOperators;

interface FilterField {
  filters?: string | string[];
  field: string;
  operator: NodeBuilderOperatorsType;
  type?: string;
}

export const buildFilter = ({
  filters,
  field,
  operator,
  type,
}: FilterField): KueryNode | undefined => {
  if (filters === undefined) {
    return;
  }

  const filtersAsArray = Array.isArray(filters) ? filters : [filters];

  if (filtersAsArray.length === 0) {
    return;
  }

  return nodeBuilder[operator](
    filtersAsArray.map((filter) => nodeBuilder.is(`${type}.attributes.${field}`, filter))
  );
};

export const buildRuleTypeIdsFilter = (ruleTypeIds?: string[], type = RULE_SAVED_OBJECT_TYPE) => {
  if (!ruleTypeIds || !ruleTypeIds?.length) {
    return;
  }

  // why???
  const field = type === RULE_TEMPLATE_SAVED_OBJECT_TYPE ? 'ruleTypeId' : 'alertTypeId';

  return buildFilter({ filters: ruleTypeIds, field, operator: 'or', type });
};

export const buildConsumersFilter = (consumers?: string[], type = RULE_SAVED_OBJECT_TYPE) => {
  if (!consumers || !consumers?.length) {
    return;
  }

  return buildFilter({ filters: consumers, field: 'consumer', operator: 'or', type });
};

export const buildTagsFilter = (tags?: string[], type = RULE_SAVED_OBJECT_TYPE) => {
  if (!tags || !tags?.length) {
    return;
  }

  return buildFilter({ filters: tags, field: 'tags', operator: 'or', type });
};

/**
 * Trim, and treat wrapping quotes as the user trying to phrase-search.
 * Quotes are not operators in a wildcard query.
 */
export const sanitizeTemplateSearchQuery = (search?: string): string | undefined => {
  let query = search?.trim() ?? '';
  const quote = query[0];
  if (query.length >= 2 && (quote === '"' || quote === "'") && query[query.length - 1] === quote) {
    query = query.slice(1, -1).trim();
  }
  if (!query) {
    return undefined;
  }
  return query;
};

/**
 * Escape wildcard metacharacters that are not user-facing operators.
 * Keep `*`. Escape `\` so it cannot neutralize the next character, and `?`
 * so a typed question mark stays literal.
 */
export const escapeTemplateSearchWildcard = (value: string): string =>
  value.replace(/[\\?]/g, '\\$&');

export const buildTemplateSearchWildcardValue = (search?: string): string | undefined => {
  const query = sanitizeTemplateSearchQuery(search);
  if (!query) {
    return undefined;
  }
  return `*${escapeTemplateSearchWildcard(query)}*`;
};

/**
 * Literal-ish substring on name and tags via ES `wildcard`. Spaces stay
 * spaces. `*` stays a wildcard operator so `CPU threshold` and
 * `CPU*threshold` are different queries.
 */
export const buildTemplateSearchQuery = (search?: string): QueryDslQueryContainer | undefined => {
  const value = buildTemplateSearchWildcardValue(search);
  if (!value) {
    return undefined;
  }

  return {
    bool: {
      should: [
        {
          wildcard: {
            // name.keyword is lowercase-normalized. Do not set case_insensitive.
            [`${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.name.keyword`]: { value },
          },
        },
        {
          wildcard: {
            [`${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.tags`]: {
              value,
              case_insensitive: true,
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
};

const isKueryNode = (value: unknown): value is KueryNode =>
  typeof value === 'object' && value !== null && 'type' in value;

/**
 * `find()` rewrites `type.attributes.field` to `type.field` before querying
 * ES. `search()` does not, so KQL nodes built for find must be rewritten
 * before `toElasticsearchQuery`.
 */
export const stripAttributesFromKueryFields = (node: KueryNode): KueryNode => {
  const next: KueryNode = { type: node.type };
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type') {
      continue;
    }
    if (key === 'value' && typeof value === 'string') {
      next[key] = value.replace('.attributes.', '.');
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        isKueryNode(item) ? stripAttributesFromKueryFields(item) : item
      );
      continue;
    }
    if (isKueryNode(value)) {
      next[key] = stripAttributesFromKueryFields(value);
      continue;
    }
    next[key] = value;
  }
  return next;
};

export const toSavedObjectEsQuery = (node: KueryNode): QueryDslQueryContainer =>
  toElasticsearchQuery(stripAttributesFromKueryFields(node));

/**
 * Matches Fleet / alerting v1 rule templates: `engine: "v1"` or no `engine` field.
 * Prefer this allowlist over excluding `"v2"` so future engine values stay out of v1 APIs.
 */
export const buildAlertingV1RuleTemplateEngineFilter = (
  type = RULE_TEMPLATE_SAVED_OBJECT_TYPE
): KueryNode => {
  const field = `${type}.attributes.engine`;
  return fromKueryExpression(`${field}: v1 or not ${field}: *`);
};

/**
 * Combines Kuery nodes and accepts an array with a mixture of undefined and KueryNodes. This will filter out the undefined
 * filters and return a KueryNode with the filters combined using the specified operator which defaults to and if not defined.
 */
export function combineFilters(
  nodes: Array<KueryNode | undefined | null>,
  operator: NodeBuilderOperatorsType = NodeBuilderOperators.and
): KueryNode | undefined {
  const filters = nodes.filter(Boolean) as KueryNode[];

  if (filters.length <= 0) {
    return;
  }

  return nodeBuilder[operator](filters);
}

export const combineFilterWithAuthorizationFilter = (
  filter?: KueryNode,
  authorizationFilter?: KueryNode
) => {
  if (!filter && !authorizationFilter) {
    return;
  }

  const kueries = [
    ...(filter !== undefined ? [filter] : []),
    ...(authorizationFilter !== undefined ? [authorizationFilter] : []),
  ];
  return nodeBuilder.and(kueries);
};
