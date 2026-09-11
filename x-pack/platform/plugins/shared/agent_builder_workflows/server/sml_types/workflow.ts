/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlTypeDefinition } from '@kbn/agent-builder-sml-plugin/server';
import { getSmlOriginId, kibanaPermissions } from '@kbn/agent-builder-sml-plugin/server';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import { WORKFLOW_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { WORKFLOW_INDEX_NAME } from '@kbn/workflows';
import type { WorkflowProperties } from '@kbn/workflows-management-plugin/server/storage/workflow_storage';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

const indexPattern = `${WORKFLOW_INDEX_NAME}-*`;

const buildSearchContent = (source: WorkflowProperties): string => {
  const parts: Array<string | undefined> = [
    source.name,
    source.description,
    source.tags?.length ? `tags: ${source.tags.join(', ')}` : undefined,
    source.enabled !== undefined ? `enabled: ${source.enabled}` : undefined,
    source.triggerTypes?.length ? `triggers: ${source.triggerTypes.join(', ')}` : undefined,
  ];
  return parts.filter(Boolean).join('\n');
};

export const createWorkflowSmlType = (api: WorkflowsManagementApi): SmlTypeDefinition => ({
  id: WORKFLOW_KI_TYPE,
  fetchFrequency: () => '30m',

  async *list(context) {
    const pageSize = 1000;
    let searchAfter: SortResults | undefined;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await context.esClient.search<WorkflowProperties>({
          index: indexPattern,
          size: pageSize,
          _source: ['spaceId', 'updated_at'],
          query: {
            bool: {
              must_not: [{ exists: { field: 'deleted_at' } }],
            },
          },
          sort: [{ updated_at: { order: 'desc' } }, '_shard_doc'],
          ...(searchAfter ? { search_after: searchAfter } : {}),
          ignore_unavailable: true,
        });

        const hits = response.hits.hits;
        if (hits.length > 0) {
          yield hits
            .filter(
              (hit): hit is typeof hit & { _id: string; _source: WorkflowProperties } =>
                Boolean(hit._id) && Boolean(hit._source)
            )
            .map((hit) => ({
              id: hit._id,
              updatedAt: hit._source.updated_at ?? new Date().toISOString(),
              spaces: [hit._source.spaceId],
            }));
        }

        hasMore = hits.length >= pageSize;
        if (hasMore && hits.length > 0) {
          const lastHit = hits[hits.length - 1];
          searchAfter = lastHit.sort;
        }
      } catch (error) {
        context.logger.warn(`SML workflow: failed to list workflows: ${(error as Error).message}`);
        return;
      }
    }
  },

  getSmlEntry: async (originId, context) => {
    try {
      const response = await context.esClient.search<WorkflowProperties>({
        index: indexPattern,
        query: {
          bool: {
            must: [{ ids: { values: [originId] } }],
            must_not: [{ exists: { field: 'deleted_at' } }],
          },
        },
        _source: ['name', 'description', 'tags', 'enabled', 'triggerTypes'],
        size: 1,
        ignore_unavailable: true,
      });

      const hit = response.hits.hits[0];
      if (!hit?._source) return undefined;

      const source = hit._source;
      const title = source.name ?? originId;

      return {
        type: WORKFLOW_KI_TYPE,
        title,
        content: buildSearchContent(source),
      };
    } catch (error) {
      context.logger.warn(
        `SML workflow: failed to get data for '${originId}': ${(error as Error).message}`
      );
      return undefined;
    }
  },

  /**
   * Workflow chunks are gated by the dedicated `ai_index:workflow/read` action.
   * The Workflows Management feature grants it by declaring `aiIndex: { read: [WORKFLOW_KI_TYPE] }`
   * (see `workflows_management/server/features.ts`), so the `kiType` here must stay in step
   * with that declaration.
   */
  getPermissions: () => kibanaPermissions({ kiType: WORKFLOW_KI_TYPE }),

  toAttachment: async (item, context) => {
    const workflow = await api.getWorkflow(getSmlOriginId(item), context.spaceId);
    if (!workflow) return undefined;

    return {
      type: WORKFLOW_YAML_ATTACHMENT_TYPE,
      data: {
        yaml: workflow.yaml,
        workflowId: workflow.id,
        name: workflow.name,
      },
    };
  },
});
