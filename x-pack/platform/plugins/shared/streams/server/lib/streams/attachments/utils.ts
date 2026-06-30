/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import objectHash from 'object-hash';
import type {
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsFindOptions,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-api-server';
import type { SanitizedRule } from '@kbn/alerting-types';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import { STREAMS_ESQL_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import type {
  AttachmentLink,
  AttachmentDocument,
  AttachmentType,
  AttachmentData,
  DashboardSOAttributes,
  SloSOAttributes,
} from './types';
import { ATTACHMENT_ID, ATTACHMENT_TYPE, ATTACHMENT_UUID, STREAM_NAMES } from './storage_settings';

export function getAttachmentLinkUuid(attachment: AttachmentLink): string {
  return objectHash({
    [ATTACHMENT_ID]: attachment.id,
    [ATTACHMENT_TYPE]: attachment.type,
  });
}

export const getAttachmentDocument = (attachment: {
  id: string;
  type: AttachmentType;
  streamNames: string[];
  uuid: string;
}): AttachmentDocument => {
  return {
    [ATTACHMENT_ID]: attachment.id,
    [ATTACHMENT_TYPE]: attachment.type,
    [ATTACHMENT_UUID]: attachment.uuid,
    [STREAM_NAMES]: attachment.streamNames,
  };
};

const processDashboardResults = (
  savedObjects: Array<SavedObject<DashboardSOAttributes>>
): AttachmentData[] => {
  return savedObjects
    .filter((savedObject) => !isSavedObjectErrorResult(savedObject))
    .map((savedObject) => ({
      id: savedObject.id,
      redirectId: savedObject.id,
      type: 'dashboard',
      title: savedObject.attributes.title,
      tags: savedObject.references.filter((ref) => ref.type === 'tag').map((ref) => ref.id),
      description: savedObject.attributes.description,
      createdAt: savedObject.created_at,
      updatedAt: savedObject.updated_at,
    }));
};

const processSloResults = (savedObjects: Array<SavedObject<SloSOAttributes>>): AttachmentData[] => {
  return savedObjects
    .filter((savedObject) => !isSavedObjectErrorResult(savedObject))
    .map((savedObject) => ({
      id: savedObject.id,
      redirectId: savedObject.attributes.id,
      type: 'slo',
      title: savedObject.attributes.name,
      tags: savedObject.references.filter((ref) => ref.type === 'tag').map((ref) => ref.id),
      description: savedObject.attributes.description,
      createdAt: savedObject.created_at,
      updatedAt: savedObject.updated_at,
    }));
};

export const processRuleResults = (rules: SanitizedRule[]): AttachmentData[] => {
  return rules.map((rule) => ({
    id: rule.id,
    redirectId: rule.id,
    type: 'rule',
    title: rule.name,
    tags: [],
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));
};

/**
 * Map of saved object types for each attachment type when querying across all spaces.
 * TypeScript will enforce that all attachment types have corresponding saved object types.
 */
export const attachmentTypeToSavedObjectTypeMap: Record<AttachmentType, string> = {
  dashboard: 'dashboard',
  slo: 'slo',
  rule: 'alert',
};

/**
 * Builds a KQL filter to exclude specific saved object IDs from search results.
 * The filter uses the format: NOT ({soType}.id:"{soType}:{id1}" OR {soType}.id:"{soType}:{id2}" ...)
 *
 * @param soType - The saved object type (e.g., 'dashboard', 'alert')
 * @param excludeIds - Array of IDs to exclude
 * @returns KQL filter string or undefined if no IDs to exclude
 */
const buildExcludeIdsFilter = (soType: string, excludeIds?: string[]): string | undefined => {
  if (!excludeIds || excludeIds.length === 0) {
    return undefined;
  }
  return `NOT (${excludeIds.map((id) => `${soType}.id:"${soType}:${id}"`).join(' OR ')})`;
};

/**
 * Fetches saved objects by IDs for dashboards and SLOs only.
 * Rules use the rule client instead.
 */
export const getSoByIds = async ({
  soClient,
  attachmentType,
  ids,
}: {
  soClient: SavedObjectsClientContract;
  attachmentType: Extract<AttachmentType, 'dashboard' | 'slo'>;
  ids: string[];
}): Promise<AttachmentData[]> => {
  if (attachmentType === 'dashboard') {
    const result = await soClient.bulkGet<DashboardSOAttributes>(
      ids.map((id) => ({ id, type: attachmentTypeToSavedObjectTypeMap[attachmentType] }))
    );
    return processDashboardResults(result.saved_objects);
  } else if (attachmentType === 'slo') {
    const result = await soClient.bulkGet<SloSOAttributes>(
      ids.map((id) => ({ id, type: attachmentTypeToSavedObjectTypeMap[attachmentType] }))
    );
    return processSloResults(result.saved_objects);
  } else {
    throw new Error(`Unsupported attachment type: ${attachmentType}`);
  }
};

/**
 * Fetches rules by IDs using the rules client.
 */
export const getRulesByIds = async ({
  rulesClient,
  ids,
}: {
  rulesClient: RulesClient;
  ids: string[];
}): Promise<AttachmentData[]> => {
  try {
    const { rules } = await rulesClient.bulkGetRules({ ids });
    return processRuleResults(rules);
  } catch (error) {
    if (error instanceof Error && error.message === 'No rules found for bulk get') {
      return [];
    }
    throw error;
  }
};

// Different saved object types use different field names for their title
const searchFieldsByType: Record<Extract<AttachmentType, 'dashboard' | 'slo'>, string[]> = {
  dashboard: ['title'],
  slo: ['name'],
};

/**
 * Searches for suggested saved objects for dashboards and SLOs only.
 * Rules use the rule client instead.
 */
export const getSuggestedSo = async ({
  soClient,
  attachmentType,
  query,
  tags,
  limit,
  excludeIds,
}: {
  soClient: SavedObjectsClientContract;
  attachmentType: Extract<AttachmentType, 'dashboard' | 'slo'>;
  query: string;
  tags?: string[];
  limit: number;
  excludeIds?: string[];
}): Promise<AttachmentData[]> => {
  const soType = attachmentTypeToSavedObjectTypeMap[attachmentType];

  const searchOptions: SavedObjectsFindOptions = {
    type: soType,
    search: query ? `${query}*` : undefined,
    searchFields: searchFieldsByType[attachmentType],
    ...(tags
      ? {
          hasReferenceOperator: 'OR' as const,
          hasReference: tags.map((tag) => ({ type: 'tag', id: tag })),
        }
      : {}),
  };

  if (attachmentType === 'dashboard') {
    const result = await soClient.find<DashboardSOAttributes>({
      ...searchOptions,
      perPage: limit,
      filter: buildExcludeIdsFilter(soType, excludeIds),
    });
    return processDashboardResults(result.saved_objects);
  }

  // SLOs have an 'id' attribute that shadows the SO _id, preventing KQL filter exclusion.
  // We need to paginate and filter in memory instead.
  if (!excludeIds || excludeIds.length === 0) {
    const result = await soClient.find<SloSOAttributes>({ ...searchOptions, perPage: limit });
    return processSloResults(result.saved_objects);
  }

  const MAX_PAGES = 10;
  const PAGE_SIZE = 100;
  const excludeIdsSet = new Set(excludeIds);
  const results: Array<SavedObject<SloSOAttributes>> = [];
  let page = 1;
  let hasMore = true;

  while (results.length < limit && hasMore && page <= MAX_PAGES) {
    const result = await soClient.find<SloSOAttributes>({
      ...searchOptions,
      page,
      perPage: PAGE_SIZE,
    });

    const filteredItems = result.saved_objects.filter((item) => !excludeIdsSet.has(item.id));
    results.push(...filteredItems);

    const fetchedSoFar = page * PAGE_SIZE;
    hasMore = fetchedSoFar < result.total;
    page++;
  }

  return processSloResults(results.slice(0, limit));
};

/**
 * Searches for suggested rules.
 */
export const getSuggestedRules = async ({
  rulesClient,
  query,
  tags,
  limit,
  excludeIds,
}: {
  rulesClient: RulesClient;
  query: string;
  tags?: string[];
  limit: number;
  excludeIds?: string[];
}): Promise<AttachmentData[]> => {
  const soType = attachmentTypeToSavedObjectTypeMap.rule;

  const tagsFilter =
    tags && tags.length > 0
      ? tags.map((tag) => `${soType}.attributes.tags:"${tag}"`).join(' OR ')
      : undefined;

  // Exclude streams ESQL rules from the results (significant events)
  const excludeStreamsEsqlRulesFilter = `NOT ${soType}.attributes.alertTypeId:"${STREAMS_ESQL_RULE_TYPE_ID}"`;

  // Combine filters with AND
  const filters = [
    tagsFilter,
    buildExcludeIdsFilter(soType, excludeIds),
    excludeStreamsEsqlRulesFilter,
  ].filter(Boolean);
  const combinedFilter = filters.length > 0 ? `(${filters.join(') AND (')})` : undefined;

  const { data } = await rulesClient.find({
    options: {
      search: query ? `${query}*` : undefined,
      perPage: limit,
      ...(combinedFilter ? { filter: combinedFilter } : {}),
    },
  });

  return processRuleResults(data);
};
