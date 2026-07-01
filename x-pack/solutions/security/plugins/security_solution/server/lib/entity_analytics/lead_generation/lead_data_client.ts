/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';

import {
  getLeadsIndexName,
  type LeadGenerationMode,
} from '../../../../common/entity_analytics/lead_generation/constants';
import type {
  Lead,
  LeadStatus,
  LeadStaleness,
} from '../../../../common/entity_analytics/lead_generation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadDataClientDeps {
  readonly esClient: ElasticsearchClient;
  readonly logger: Logger;
  readonly spaceId: string;
}

export interface CreateLeadsParams {
  readonly leads: readonly Lead[];
  readonly executionId: string;
  readonly sourceType: LeadGenerationMode;
}

export interface FindLeadsParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sortField?: 'priority' | 'timestamp';
  readonly sortOrder?: 'asc' | 'desc';
  readonly status?: LeadStatus;
}

export interface FindLeadsResult {
  readonly leads: Lead[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
}

export interface LeadDataClient {
  createLeads(params: CreateLeadsParams): Promise<void>;
  findLeads(params: FindLeadsParams): Promise<FindLeadsResult>;
  updateLead(id: string, updates: Partial<Pick<Lead, 'status'>>): Promise<boolean>;
  dismissLead(id: string): Promise<boolean>;
  bulkUpdateLeads(ids: readonly string[], updates: { status: LeadStatus }): Promise<number>;
  getStatus(options?: { isEnabled?: boolean }): Promise<{
    isEnabled: boolean;
    indexExists: boolean;
    totalLeads: number;
    lastRun: string | null;
  }>;
  deleteAllLeads(): Promise<void>;
}

// ---------------------------------------------------------------------------
// ES error classification helpers
// ---------------------------------------------------------------------------

const getEsErrorType = (e: unknown): string | undefined =>
  (e as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body?.error?.type;

const isEsSecurityException = (e: unknown): boolean => getEsErrorType(e) === 'security_exception';

const isEsIndexNotFoundException = (e: unknown): boolean =>
  getEsErrorType(e) === 'index_not_found_exception';

// ---------------------------------------------------------------------------
// Staleness computation (timestamp-based, computed at read time)
// ---------------------------------------------------------------------------

const STALENESS_THRESHOLDS = {
  fresh: 24 * 60 * 60 * 1000,
  stale: 72 * 60 * 60 * 1000,
};

const computeStaleness = (timestamp: string): LeadStaleness => {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (ageMs <= STALENESS_THRESHOLDS.fresh) return 'fresh';
  if (ageMs <= STALENESS_THRESHOLDS.stale) return 'stale';
  return 'expired';
};

// ---------------------------------------------------------------------------
// camelCase ↔ snake_case transform layer
//
// Index mappings (source of truth) use snake_case. API and in-memory types
// use camelCase. This transform bridges the two.
// ---------------------------------------------------------------------------

interface EsObservationDoc {
  entity_id: string;
  module_id: string;
  type: string;
  score: number;
  severity: string;
  confidence: number;
  description: string;
  metadata: Record<string, unknown>;
}

interface EsLeadDoc {
  id: string;
  title: string;
  byline: string;
  description: string;
  entities: Array<{ type: string; name: string }>;
  tags: string[];
  priority: number;
  chat_recommendations: string[];
  timestamp: string;
  staleness: string;
  status: string;
  observations: EsObservationDoc[];
  execution_uuid: string;
  source_type: string;
}

const leadToEsDoc = (
  lead: Lead,
  executionId: string,
  sourceType: LeadGenerationMode
): EsLeadDoc => ({
  id: lead.id,
  title: lead.title,
  byline: lead.byline,
  description: lead.description,
  entities: lead.entities.map(({ type, name }) => ({ type, name })),
  tags: lead.tags,
  priority: lead.priority,
  chat_recommendations: lead.chatRecommendations,
  timestamp: lead.timestamp,
  staleness: lead.staleness,
  status: lead.status ?? 'active',
  observations: lead.observations.map((obs) => ({
    entity_id: obs.entityId,
    module_id: obs.moduleId,
    type: obs.type,
    score: obs.score,
    severity: obs.severity,
    confidence: obs.confidence,
    description: obs.description,
    metadata: obs.metadata,
  })),
  execution_uuid: executionId,
  source_type: sourceType,
});

const esDocToLead = (doc: Record<string, unknown>): Lead => {
  const observations = (doc.observations as EsObservationDoc[] | undefined) ?? [];
  const timestamp = (doc.timestamp as string) ?? new Date().toISOString();

  return {
    id: doc.id as string,
    title: doc.title as string,
    byline: (doc.byline as string) ?? '',
    description: (doc.description as string) ?? '',
    entities: (doc.entities as Array<{ type: string; name: string }>) ?? [],
    tags: (doc.tags as string[]) ?? [],
    priority: (doc.priority as number) ?? 1,
    chatRecommendations: (doc.chat_recommendations as string[]) ?? [],
    timestamp,
    staleness: computeStaleness(timestamp),
    status: (doc.status as LeadStatus) ?? 'active',
    observations: observations.map((obs) => ({
      entityId: obs.entity_id,
      moduleId: obs.module_id,
      type: obs.type,
      score: obs.score,
      severity: obs.severity as Lead['observations'][number]['severity'],
      confidence: obs.confidence,
      description: obs.description,
      metadata: obs.metadata ?? {},
    })),
    executionUuid: (doc.execution_uuid as string) ?? '',
    sourceType: (doc.source_type as Lead['sourceType']) ?? 'adhoc',
  };
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createLeadDataClient = ({
  esClient,
  logger,
  spaceId,
}: LeadDataClientDeps): LeadDataClient => {
  const adhocIndex = getLeadsIndexName(spaceId, 'adhoc');
  const scheduledIndex = getLeadsIndexName(spaceId, 'scheduled');
  const allIndices = `${adhocIndex},${scheduledIndex}`;

  // -----------------------------------------------------------------------
  // createLeads — bulk index + gap-free stale cleanup
  // -----------------------------------------------------------------------
  const createLeads = async ({
    leads,
    executionId,
    sourceType,
  }: CreateLeadsParams): Promise<void> => {
    const indexName = getLeadsIndexName(spaceId, sourceType);

    try {
      if (leads.length > 0) {
        const bulkBody = leads.flatMap((lead) => [
          { index: { _index: indexName, _id: lead.id } },
          leadToEsDoc(lead, executionId, sourceType),
        ]);
        const bulkResp = await esClient.bulk({ body: bulkBody });

        if (bulkResp.errors) {
          const failedItems = bulkResp.items.filter((item) => item.index?.error);
          const failedIds = failedItems.map((item) => item.index?._id);
          logger.error(
            `[LeadGeneration] Bulk indexing had ${failedItems.length}/${leads.length} failures ` +
              `(executionId=${executionId}, index=${indexName}): ${JSON.stringify(failedIds)}`
          );
          return;
        }

        logger.debug(`[LeadGeneration] Persisted ${leads.length} leads to "${indexName}"`);
      }

      await esClient.deleteByQuery({
        index: indexName,
        query: {
          bool: { must_not: [{ term: { execution_uuid: executionId } }] },
        },
        refresh: true,
        conflicts: 'proceed',
        slices: 'auto',
        ignore_unavailable: true,
      });
    } catch (e) {
      if (isEsSecurityException(e)) {
        throw e;
      }
      logger.warn(`[LeadGeneration] Failed to persist leads to "${indexName}": ${e}`);
    }
  };

  // -----------------------------------------------------------------------
  // findLeads — paginated search across both indices
  // -----------------------------------------------------------------------
  const findLeads = async ({
    page = 1,
    perPage = 20,
    sortField = 'priority',
    sortOrder = 'desc',
    status,
  }: FindLeadsParams): Promise<FindLeadsResult> => {
    const from = (page - 1) * perPage;
    const filters: estypes.QueryDslQueryContainer[] = [];
    if (status) {
      filters.push({ term: { status } });
    }
    const query: estypes.QueryDslQueryContainer =
      filters.length > 0 ? { bool: { filter: filters } } : { match_all: {} };

    try {
      const resp = await esClient.search({
        index: allIndices,
        size: perPage,
        from,
        track_total_hits: true,
        sort: [
          { [sortField]: { order: sortOrder as estypes.SortOrder } },
          { timestamp: { order: 'desc' as estypes.SortOrder } },
        ],
        query,
        ignore_unavailable: true,
      });

      const total =
        typeof resp.hits.total === 'number' ? resp.hits.total : resp.hits.total?.value ?? 0;

      const leads = resp.hits.hits
        .map((hit) => hit._source)
        .filter((doc): doc is Record<string, unknown> => doc != null)
        .map(esDocToLead);

      return { leads, total, page, perPage };
    } catch (e) {
      if (isEsSecurityException(e)) {
        throw e;
      }
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (isEsIndexNotFoundException(e)) {
        logger.debug(`[LeadGeneration] Leads indices not available yet: ${errorMessage}`);
      } else {
        logger.error(`[LeadGeneration] Unable to find leads due to error: ${errorMessage}`);
      }
      return { leads: [], total: 0, page, perPage };
    }
  };

  // -----------------------------------------------------------------------
  // updateLead — partial update by doc id
  // -----------------------------------------------------------------------
  const updateLead = async (
    id: string,
    updates: Partial<Pick<Lead, 'status'>>
  ): Promise<boolean> => {
    if (updates.status === undefined) {
      return false;
    }
    try {
      const resp = await esClient.updateByQuery({
        index: allIndices,
        query: { ids: { values: [id] } },
        script: {
          source: `ctx._source['status'] = params.status`,
          lang: 'painless',
          params: { status: updates.status },
        },
        refresh: true,
        conflicts: 'proceed',
        ignore_unavailable: true,
      });
      return (resp.updated ?? 0) > 0;
    } catch (e) {
      logger.error(`[LeadGeneration] Error updating lead ${id}: ${e}`);
      throw e;
    }
  };

  // -----------------------------------------------------------------------
  // dismissLead — set status to 'dismissed'
  // -----------------------------------------------------------------------
  const dismissLead = async (id: string): Promise<boolean> => {
    return updateLead(id, { status: 'dismissed' });
  };

  // -----------------------------------------------------------------------
  // bulkUpdateLeads — bulk status change via updateByQuery
  // -----------------------------------------------------------------------
  const bulkUpdateLeads = async (
    ids: readonly string[],
    updates: { status: LeadStatus }
  ): Promise<number> => {
    if (ids.length === 0) return 0;

    const resp = await esClient.updateByQuery({
      index: allIndices,
      query: { ids: { values: [...ids] } },
      script: {
        source: `ctx._source['status'] = params.status`,
        lang: 'painless',
        params: { status: updates.status },
      },
      refresh: true,
      conflicts: 'proceed',
      slices: 'auto',
      ignore_unavailable: true,
    });
    return resp.updated ?? 0;
  };

  // -----------------------------------------------------------------------
  // getStatus — engine status (cheap count query)
  // -----------------------------------------------------------------------
  const getStatus = async (options?: {
    isEnabled?: boolean;
  }): Promise<{
    isEnabled: boolean;
    indexExists: boolean;
    totalLeads: number;
    lastRun: string | null;
  }> => {
    let indexExists = false;
    let totalLeads = 0;
    let lastRun: string | null = null;

    try {
      const resp = await esClient.search({
        index: allIndices,
        size: 1,
        sort: [{ timestamp: { order: 'desc' } }],
        _source: ['timestamp'],
        track_total_hits: true,
        request_cache: true,
        ignore_unavailable: true,
      });

      indexExists = true;
      totalLeads =
        typeof resp.hits.total === 'number' ? resp.hits.total : resp.hits.total?.value ?? 0;

      const latestHit = resp.hits.hits[0];
      if (latestHit?._source) {
        lastRun = (latestHit._source as Record<string, unknown>).timestamp as string;
      }
    } catch (e) {
      if (isEsSecurityException(e)) {
        throw e;
      }
      logger.debug(`[LeadGeneration] Status check — indices not available: ${e}`);
    }

    return { isEnabled: options?.isEnabled ?? false, indexExists, totalLeads, lastRun };
  };

  // -----------------------------------------------------------------------
  // deleteAllLeads — used by disable route for cleanup
  // -----------------------------------------------------------------------
  const deleteAllLeads = async (): Promise<void> => {
    try {
      await esClient.deleteByQuery({
        index: allIndices,
        query: { match_all: {} },
        refresh: true,
        conflicts: 'proceed',
        slices: 'auto',
        ignore_unavailable: true,
      });
      logger.info(`[LeadGeneration] Deleted all leads from space "${spaceId}"`);
    } catch (e) {
      if (isEsSecurityException(e)) {
        throw e;
      }
      logger.warn(`[LeadGeneration] Failed to delete all leads: ${e}`);
    }
  };

  return {
    createLeads,
    findLeads,
    updateLead,
    dismissLead,
    bulkUpdateLeads,
    getStatus,
    deleteAllLeads,
  };
};
