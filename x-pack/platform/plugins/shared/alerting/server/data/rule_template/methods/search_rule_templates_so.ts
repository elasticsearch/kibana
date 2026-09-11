/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer, Sort } from '@elastic/elasticsearch/lib/api/types';
import type {
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
} from '@kbn/core/server';
import { FIND_DEFAULT_PAGE, FIND_DEFAULT_PER_PAGE } from '@kbn/core-saved-objects-utils-server';
import type { KueryNode } from '@kbn/es-query';
import { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { AlertingV1RawRuleTemplate } from '../../../saved_objects/schemas/raw_rule_template';
import {
  buildAlertingV1RuleTemplateEngineFilter,
  toSavedObjectEsQuery,
} from '../../../rules_client/common/filters';

export interface SearchRuleTemplatesSoParams {
  savedObjectsClient: SavedObjectsClientContract;
  namespaces: string[];
  page?: number;
  perPage?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: KueryNode;
  searchQuery?: QueryDslQueryContainer;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAlertingV1TemplateAttributes = (value: unknown): value is AlertingV1RawRuleTemplate => {
  if (!isRecord(value) || value.engine === 'v2') {
    return false;
  }
  return typeof value.name === 'string' && typeof value.ruleTypeId === 'string';
};

const savedObjectIdFromRawId = (rawId: string | undefined): string | undefined => {
  if (!rawId) {
    return undefined;
  }
  const prefix = `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}:`;
  return rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
};

const getHitTotal = (total: number | { value?: number } | undefined): number => {
  if (typeof total === 'number') {
    return total;
  }
  if (isRecord(total) && typeof total.value === 'number') {
    return total.value;
  }
  return 0;
};

const rawHitToSavedObject = (hit: {
  _id?: string;
  _source?: unknown;
}): SavedObject<AlertingV1RawRuleTemplate> | undefined => {
  const id = savedObjectIdFromRawId(hit._id);
  if (!id || !isRecord(hit._source)) {
    return undefined;
  }
  const attributes = hit._source[RULE_TEMPLATE_SAVED_OBJECT_TYPE];
  if (!isAlertingV1TemplateAttributes(attributes)) {
    return undefined;
  }
  const references = hit._source.references;
  return {
    id,
    type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
    attributes,
    references: Array.isArray(references) ? references : [],
  };
};

/**
 * Lists Fleet / alerting v1 rule templates through Saved Objects `search()`.
 * A typed string becomes a wildcard must clause. An empty box is the same
 * query without that clause.
 */
export const searchRuleTemplatesSo = async (
  params: SearchRuleTemplatesSoParams
): Promise<SavedObjectsFindResponse<AlertingV1RawRuleTemplate>> => {
  const {
    savedObjectsClient,
    namespaces,
    page = FIND_DEFAULT_PAGE,
    perPage = FIND_DEFAULT_PER_PAGE,
    sortField,
    sortOrder,
    filter,
    searchQuery,
  } = params;

  const filterClauses: QueryDslQueryContainer[] = [
    toSavedObjectEsQuery(buildAlertingV1RuleTemplateEngineFilter()),
  ];
  if (filter) {
    filterClauses.push(toSavedObjectEsQuery(filter));
  }

  const sort: Sort | undefined = sortField
    ? [
        {
          [`${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.${sortField}`]: {
            order: sortOrder ?? 'asc',
          },
        },
      ]
    : undefined;

  const result = await savedObjectsClient.search({
    type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
    namespaces,
    from: (page - 1) * perPage,
    size: perPage,
    track_total_hits: true,
    sort,
    query: {
      bool: {
        filter: filterClauses,
        ...(searchQuery ? { must: [searchQuery] } : {}),
      },
    },
  });

  const savedObjects = result.hits.hits.flatMap((hit) => {
    const savedObject = rawHitToSavedObject(hit);
    return savedObject ? [savedObject] : [];
  });

  return {
    page,
    per_page: perPage,
    total: getHitTotal(result.hits.total),
    saved_objects: savedObjects.map((savedObject) => ({ ...savedObject, score: 0 })),
  };
};
