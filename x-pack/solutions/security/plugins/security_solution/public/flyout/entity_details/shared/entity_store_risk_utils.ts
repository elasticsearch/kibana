/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityType } from '../../../../common/entity_analytics/types';
import type { RiskScoreState } from '../../../entity_analytics/api/hooks/use_risk_score';
import type { EntityRiskScore, RiskStats } from '../../../../common/search_strategy';
import type { EntityStoreRecord } from './hooks/use_entity_from_store';

export function getRiskFromEntityRecord(record: EntityStoreRecord): {
  calculated_level?: string;
  calculated_score?: number;
  calculated_score_norm?: number;
} | null {
  return getRiskFromRecord(record);
}

function getRiskFromRecord(record: EntityStoreRecord): {
  calculated_level?: string;
  calculated_score?: number;
  calculated_score_norm?: number;
} | null {
  const entityRisk = record.entity?.risk;
  if (entityRisk) {
    return {
      calculated_level: entityRisk.calculated_level,
      calculated_score: entityRisk.calculated_score,
      calculated_score_norm: entityRisk.calculated_score_norm,
    };
  }
  if ('host' in record && record.host) {
    const hostRisk = record.host.risk;
    if (hostRisk) {
      return {
        calculated_level: hostRisk.calculated_level,
        calculated_score: hostRisk.calculated_score,
        calculated_score_norm: hostRisk.calculated_score_norm,
      };
    }
  }
  if ('user' in record && record.user) {
    const userRisk = record.user.risk;
    if (userRisk) {
      return {
        calculated_level: userRisk.calculated_level,
        calculated_score: userRisk.calculated_score,
        calculated_score_norm: userRisk.calculated_score_norm,
      };
    }
  }
  if ('service' in record && record.service) {
    const serviceRisk = record.service.risk;
    if (serviceRisk) {
      return {
        calculated_level: serviceRisk.calculated_level,
        calculated_score: serviceRisk.calculated_score,
        calculated_score_norm: serviceRisk.calculated_score_norm,
      };
    }
  }
  return null;
}

function getEntityNameFromRecord(record: EntityStoreRecord, entityType: EntityType): string {
  if (entityType === 'host' && 'host' in record) return record.host?.name ?? '';
  if (entityType === 'user' && 'user' in record) return record.user?.name ?? '';
  if (entityType === 'service' && 'service' in record) return record.service?.name ?? '';
  return '';
}

/**
 * Extract asset criticality level from an entity store record (host/user/service).
 * Used to populate Risk Summary asset criticality row when entity store is the data source.
 */
function getAssetCriticalityFromEntityRecord(record: EntityStoreRecord): string | undefined {
  if ('asset' in record && record.asset?.criticality) {
    return record.asset.criticality;
  }
  return undefined;
}

/**
 * Build a minimal RiskStats from entity store risk fields (for flyout display).
 * When asset criticality is present on the record, adds modifiers and category_2_score
 * so FlyoutRiskSummaryComponent shows a non-zero value for the Asset Criticality row.
 */
function buildMinimalRiskStats(
  risk: {
    calculated_level?: string;
    calculated_score?: number;
    calculated_score_norm?: number;
  } | null,
  timestamp: string,
  idField: string,
  idValue: string,
  assetCriticalityLevel?: string
): RiskStats {
  const modifiers =
    assetCriticalityLevel != null
      ? [
          {
            type: 'asset_criticality',
            contribution: 1,
            metadata: { criticality_level: assetCriticalityLevel },
          },
        ]
      : undefined;

  return {
    '@timestamp': timestamp,
    id_field: idField,
    id_value: idValue,
    calculated_level: (risk?.calculated_level ?? 'Unknown') as RiskStats['calculated_level'],
    calculated_score: risk?.calculated_score ?? 0,
    calculated_score_norm: risk?.calculated_score_norm ?? 0,
    category_1_score: 0,
    category_1_count: 0,
    category_2_score: assetCriticalityLevel != null ? 1 : undefined,
    inputs: [],
    notes: [],
    rule_risks: [],
    multipliers: [],
    ...(modifiers && { modifiers }),
  };
}

/**
 * Build RiskScoreState for the flyout from an entity store record.
 * When inspect is provided (e.g. from entity store API response), the Risk Summary inspect button will be enabled.
 */
export function buildRiskScoreStateFromEntityRecord<T extends EntityType>(
  entityType: T,
  record: EntityStoreRecord,
  options: {
    refetch: () => void;
    isLoading: boolean;
    error: unknown;
    /** Entity store API inspect so the Risk Summary Table inspect button is clickable. */
    inspect?: { dsl: string[]; response: string[] };
  }
): RiskScoreState<T> {
  const timestamp = record['@timestamp'] ?? new Date().toISOString();
  const name = getEntityNameFromRecord(record, entityType);
  const riskFromRecord = getRiskFromRecord(record);
  const assetCriticalityLevel = getAssetCriticalityFromEntityRecord(record);
  const idField =
    entityType === 'host' ? 'host.name' : entityType === 'user' ? 'user.name' : 'service.name';
  const riskStats = buildMinimalRiskStats(
    riskFromRecord,
    timestamp,
    idField,
    name,
    assetCriticalityLevel
  );

  const dataItem = {
    '@timestamp': timestamp,
    [entityType]: { name, risk: riskStats },
  } as unknown as EntityRiskScore<T>;

  const inspect =
    options.inspect?.dsl?.length && options.inspect?.response?.length
      ? options.inspect
      : { dsl: [] as string[], response: [] as string[] };

  return {
    data: [dataItem] as RiskScoreState<T>['data'],
    inspect,
    isInspected: false,
    refetch: options.refetch,
    totalCount: 1,
    isAuthorized: true,
    hasEngineBeenInstalled: true,
    loading: options.isLoading,
    error: options.error,
  };
}
