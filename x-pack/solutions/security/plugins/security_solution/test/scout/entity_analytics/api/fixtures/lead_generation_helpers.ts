/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Client } from '@elastic/elasticsearch';
import { getLeadsIndexName } from '../../../../../common/entity_analytics/lead_generation/constants';

export const DEFAULT_SPACE_ID = 'default';

/**
 * ES document shape (snake_case) as stored by the lead data client.
 * Mirrors the `EsLeadDoc` interface in `lead_data_client.ts`.
 */
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
  observations: Array<{
    entity_id: string;
    module_id: string;
    type: string;
    score: number;
    severity: string;
    confidence: number;
    description: string;
    metadata: Record<string, unknown>;
  }>;
  execution_uuid: string;
  source_type: string;
}

export interface SeedLeadOptions {
  readonly spaceId?: string;
  readonly status?: 'active' | 'dismissed' | 'expired';
  readonly priority?: number;
  readonly timestamp?: string;
  readonly sourceType?: 'adhoc' | 'scheduled';
}

/**
 * Seeds a minimal but fully valid lead document directly into the ES adhoc leads index,
 * bypassing the `POST /generate` route and its LLM dependency entirely.
 *
 * Returns the document's `id` so callers can reference it in API calls.
 */
export const seedLead = async (
  esClient: Client,
  options: SeedLeadOptions = {}
): Promise<{ id: string; executionUuid: string }> => {
  const {
    spaceId = DEFAULT_SPACE_ID,
    status = 'active',
    priority = 5,
    timestamp = new Date().toISOString(),
    sourceType = 'adhoc',
  } = options;

  const id = uuidv4();
  const executionUuid = uuidv4();

  const doc: EsLeadDoc = {
    id,
    title: 'Test Lead: High Risk User Activity',
    byline: 'User john.doe shows multiple high-severity signals',
    description:
      'Risk score escalated significantly over the past 24 hours with concurrent high-severity alerts.',
    entities: [{ type: 'user', name: 'john.doe' }],
    tags: ['risk_escalation', 'high_severity_alerts'],
    priority,
    chat_recommendations: [
      'What recent authentication events occurred for this user?',
      'Are there related alerts for this entity?',
    ],
    timestamp,
    staleness: 'fresh',
    status,
    observations: [
      {
        entity_id: 'user:john.doe',
        module_id: 'risk_analysis',
        type: 'high_risk_score',
        score: 85,
        severity: 'high',
        confidence: 0.9,
        description: 'Risk score norm 85 (>= 70 threshold)',
        metadata: {},
      },
    ],
    execution_uuid: executionUuid,
    source_type: sourceType,
  };

  const index = getLeadsIndexName(spaceId, sourceType);
  await esClient.index({ index, id, document: doc, refresh: 'wait_for' });

  return { id, executionUuid };
};

/**
 * Removes all documents from the adhoc and scheduled leads indices for a given space.
 * Safe to call even when the index does not yet exist.
 */
export const cleanupLeadsIndex = async (
  esClient: Client,
  spaceId: string = DEFAULT_SPACE_ID
): Promise<void> => {
  const adhocIndex = getLeadsIndexName(spaceId, 'adhoc');
  const scheduledIndex = getLeadsIndexName(spaceId, 'scheduled');

  await Promise.all(
    [adhocIndex, scheduledIndex].map((index) =>
      esClient
        .deleteByQuery({
          index,
          query: { match_all: {} },
          refresh: true,
          conflicts: 'proceed',
          ignore_unavailable: true,
        })
        .catch(() => {
          // Index may not exist — ignore
        })
    )
  );
};
