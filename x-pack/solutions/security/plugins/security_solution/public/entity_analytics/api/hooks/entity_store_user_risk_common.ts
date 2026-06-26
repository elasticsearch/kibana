/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserEntity, ListEntitiesResponse } from '@kbn/entity-store/common';
import { EntityType } from '../../../../common/entity_analytics/types';
import type {
  RiskScoreSortField,
  RiskSeverity,
  RiskStats,
  UserRiskScore,
} from '../../../../common/search_strategy';
import { RiskScoreFields } from '../../../../common/search_strategy';
import type { ESQuery } from '../../../../common/typed_json';
import { createFilter } from '../../../common/containers/helpers';

export const ENTITY_STORE_USER_RISK_LIST_QUERY_KEY = 'ENTITY_STORE_USER_RISK_LIST';
export const ENTITY_STORE_USER_RISK_KPI_QUERY_KEY = 'ENTITY_STORE_USER_RISK_KPI';

export const isUserEntityRecord = (
  record: ListEntitiesResponse['records'][number]
): record is UserEntity => 'user' in record && record.user != null;

/**
 * Kibana / risk-score filters use `user.risk.*` (risk index field names). Entity Store v2 latest
 * indices map scores on `entity.risk.*` (see BASE_ENTITY_INDEX_MAPPING in entity_store
 * component_templates). Rewrite query keys so bool / match_phrase clauses target mapped fields.
 */
const rewriteEntityStoreUserRiskFieldPaths = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(rewriteEntityStoreUserRiskFieldPaths);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    const mappedKey =
      key === 'user.risk.calculated_level'
        ? 'entity.risk.calculated_level'
        : key === 'user.risk.calculated_score_norm'
        ? 'entity.risk.calculated_score_norm'
        : key === 'user.risk.calculated_score'
        ? 'entity.risk.calculated_score'
        : key === 'user.risk.@timestamp'
        ? '@timestamp'
        : key;
    out[mappedKey] = rewriteEntityStoreUserRiskFieldPaths(val);
  }
  return out;
};

const parseFilterClauses = (filterQuery?: ESQuery | string): object[] => {
  const filtered = createFilter(filterQuery);
  if (filtered == null || filtered === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(filtered) as object;
    return [rewriteEntityStoreUserRiskFieldPaths(parsed) as object];
  } catch {
    return [];
  }
};

const hasEntityRiskClause = {
  exists: { field: 'entity.risk.calculated_score_norm' },
};

const entityLifecycleTimeRangeClause = (startDate: string, endDate: string) => ({
  range: {
    'entity.lifecycle.last_seen': {
      gte: startDate,
      lte: endDate,
      format: 'strict_date_optional_time',
    },
  },
});

/**
 * Builds a bool filter for Entity Store v2: Kibana filterQuery (JSON), optional time range on
 * `entity.lifecycle.last_seen`, and users that have a materialized risk score.
 */
export const buildUserRiskEntityStoreFilterQuery = ({
  filterQuery,
  startDate,
  endDate,
}: {
  filterQuery?: ESQuery | string;
  startDate?: string;
  endDate?: string;
}): string => {
  const filterClauses: object[] = [...parseFilterClauses(filterQuery), hasEntityRiskClause];
  if (startDate != null && startDate !== '' && endDate != null && endDate !== '') {
    filterClauses.push(entityLifecycleTimeRangeClause(startDate, endDate));
  }

  return JSON.stringify({
    bool: {
      filter: filterClauses,
    },
  });
};

export const riskScoreSortFieldToUserEntityStoreField = (field: RiskScoreFields): string => {
  switch (field) {
    case RiskScoreFields.userName:
      return 'user.name';
    case RiskScoreFields.timestamp:
      return '@timestamp';
    case RiskScoreFields.userRiskScore:
      return 'entity.risk.calculated_score_norm';
    case RiskScoreFields.userRisk:
      return 'entity.risk.calculated_level';
    default:
      return 'entity.risk.calculated_score_norm';
  }
};

export const mapUserEntityRecordToUserRiskScore = (record: UserEntity): UserRiskScore | null => {
  const userName = record.user?.name;
  if (userName == null || userName === '') {
    return null;
  }

  const risk = record.user?.risk ?? record.entity?.risk;
  if (risk == null) {
    return null;
  }

  const riskStats: RiskStats = {
    ...(risk as object),
    rule_risks: [],
    multipliers: [],
  } as unknown as RiskStats;

  const timestamp =
    ('@timestamp' in risk && typeof risk['@timestamp'] === 'string' ? risk['@timestamp'] : null) ??
    record['@timestamp'] ??
    record.entity?.lifecycle?.last_seen ??
    '';

  return {
    '@timestamp': timestamp,
    user: {
      name: userName,
      risk: riskStats,
    },
  };
};

export const entityStoreUserRiskSortToApiParams = (
  sort: RiskScoreSortField | undefined
): { sortField: string; sortOrder: 'asc' | 'desc' } => ({
  sortField: riskScoreSortFieldToUserEntityStoreField(sort?.field ?? RiskScoreFields.userRiskScore),
  sortOrder: sort?.direction === 'asc' ? 'asc' : 'desc',
});

export const isUserRiskEntityTarget = (riskEntity: EntityType | EntityType[]): boolean =>
  riskEntity === EntityType.user ||
  (Array.isArray(riskEntity) && riskEntity.length === 1 && riskEntity[0] === EntityType.user);

export const severityFromUserRecord = (record: UserEntity): RiskSeverity | undefined =>
  (record.user?.risk?.calculated_level ?? record.entity?.risk?.calculated_level) as
    | RiskSeverity
    | undefined;
