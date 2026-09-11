/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { AuditLogger } from '@kbn/core-security-server';
import type {
  AiIndexHttpItem,
  DescribeAiIndexResponse,
  QueryAiIndicesRequest,
  QueryAiIndicesResponse,
} from '../../common/http_api/ai_indices';
import { AiIndexAuditAction, aiIndexAuditEvent } from '../audit/audit_events';
import { describeAiIndex } from './describe';
import { resolveAiIndexVisibility, type AiIndexVisibility } from './list_visible';
import { queryAiIndices } from './query';
import type { AiIndexService } from './service';

/** `empty` is listed so a freshly registered index still appears. */
const LISTED_VISIBILITIES: ReadonlySet<AiIndexVisibility> = new Set(['visible', 'empty']);

/** Caller-scoped AI-index reads. One instance per request; shared by HTTP routes and agent tools. */
export interface AiIndexDataReadServiceApi {
  query(request: QueryAiIndicesRequest): Promise<QueryAiIndicesResponse>;
  /** Throws `AiIndexNotFoundError` for an unknown id. */
  describe(id: string): Promise<DescribeAiIndexResponse>;
  /**
   * The AI Indices the caller can use in this space: those that are empty, or hold at least one
   * document the caller can see here. Left out when the caller cannot read the backing index,
   * when every document belongs to another space, or when the check itself failed. `ids` limits
   * which registry entries are checked.
   */
  listVisible(ids?: string[]): Promise<AiIndexHttpItem[]>;
}

export class AiIndexDataReadService implements AiIndexDataReadServiceApi {
  constructor(
    private readonly deps: {
      esClient: ElasticsearchClient;
      spaceId: string;
      auditLogger: AuditLogger;
      aiIndexService: Pick<AiIndexService, 'get' | 'list'>;
      logger: Logger;
    }
  ) {}

  async query(request: QueryAiIndicesRequest): Promise<QueryAiIndicesResponse> {
    const { esClient, spaceId, auditLogger } = this.deps;
    try {
      const response = await queryAiIndices({ esClient, spaceId, ...request });
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.QUERY }));
      return response;
    } catch (error) {
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.QUERY, error }));
      throw error;
    }
  }

  async describe(id: string): Promise<DescribeAiIndexResponse> {
    const { esClient, spaceId, auditLogger, aiIndexService } = this.deps;
    try {
      const aiIndex = await aiIndexService.get(id);
      const response = await describeAiIndex({ esClient, aiIndex, spaceId });
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.DESCRIBE, id }));
      return { response };
    } catch (error) {
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.DESCRIBE, id, error }));
      throw error;
    }
  }

  async listVisible(ids?: string[]): Promise<AiIndexHttpItem[]> {
    const { esClient, spaceId, auditLogger, aiIndexService, logger } = this.deps;
    try {
      const registry = await aiIndexService.list();
      const requested = ids && new Set(ids);
      const aiIndices = requested ? registry.filter(({ id }) => requested.has(id)) : registry;
      const results = await resolveAiIndexVisibility({ esClient, aiIndices, spaceId, logger });
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.LIST }));
      return results
        .filter(({ visibility }) => LISTED_VISIBILITIES.has(visibility))
        .map(({ aiIndex }) => aiIndex);
    } catch (error) {
      auditLogger.log(aiIndexAuditEvent({ action: AiIndexAuditAction.LIST, error }));
      throw error;
    }
  }
}
