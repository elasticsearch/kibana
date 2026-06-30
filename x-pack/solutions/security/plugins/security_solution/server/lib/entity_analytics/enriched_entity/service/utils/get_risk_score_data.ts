/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Entity } from '@kbn/entity-store/common';
import { createGetRiskScores } from '../../../risk_score/get_risk_score';
import type { EntityRiskScoreRecord } from '../../../../../../common/api/entity_analytics/common';
import type { EntityType } from '../../../../../../common/entity_analytics/types';
import { ESSENTIAL_ALERT_FIELDS } from '../../../../../../common/constants';

interface GetRiskScoreDataOptions {
  entities: Entity[];
  esClient: ElasticsearchClient;
  getAlerts?: boolean;
  logger: Logger;
  spaceId: string;
}

export interface RiskScoreWithAlerts {
  riskScore: EntityRiskScoreRecord | undefined;
  alertDocuments: Array<Record<string, unknown>>;
}

export const getRiskScoreData = async ({
  entities,
  esClient,
  getAlerts = true,
  logger,
  spaceId,
}: GetRiskScoreDataOptions): Promise<RiskScoreWithAlerts[]> => {
  if (entities.length === 0) {
    return [];
  }

  const getRiskScore = createGetRiskScores({ logger, esClient, spaceId });

  try {
    const results = await Promise.all(
      entities.map(({ entity }) => {
        const entityIdentifier = entity?.id;
        const entityType = entity?.EngineMetadata?.Type;
        if (!entityIdentifier || !entityType) {
          return Promise.resolve([] as EntityRiskScoreRecord[]);
        }
        return getRiskScore({
          entityType: entityType as EntityType,
          entityIdentifier,
          pagination: { querySize: 1, cursorStart: 0 },
        });
      })
    );

    const riskScores = results.map((result) => result[0]);

    if (!getAlerts) {
      return riskScores.map((riskScore) => ({ riskScore, alertDocuments: [] }));
    }

    const allInputs = riskScores.flatMap((riskScore) => riskScore?.inputs ?? []);

    if (allInputs.length === 0) {
      return riskScores.map((riskScore) => ({ riskScore, alertDocuments: [] }));
    }

    const mgetResponse = await esClient.mget({
      _source_includes: ESSENTIAL_ALERT_FIELDS,
      docs: allInputs.map(({ id, index }) => ({ _id: id, _index: index })),
    });

    const alertByKey = new Map<string, Record<string, unknown>>();
    for (const doc of mgetResponse.docs) {
      if ('found' in doc && doc.found && doc._source) {
        alertByKey.set(`${doc._index}:${doc._id}`, doc._source as Record<string, unknown>);
      }
    }

    return riskScores.map((riskScore) => ({
      riskScore,
      alertDocuments: (riskScore?.inputs ?? [])
        .map(({ id, index }) => alertByKey.get(`${index}:${id}`))
        .filter((doc): doc is Record<string, unknown> => doc !== undefined),
    }));
  } catch (err) {
    logger.error(`Error fetching risk scores: ${err}`);
    // return an array of the same length as the input entities, with undefined risk scores and empty alert documents
    return entities.map(() => ({ riskScore: undefined, alertDocuments: [] }));
  }
};
