/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import { HostPolicyResponseActionStatus } from '../../../../../../common/endpoint/types';
import {
  LATEST_POLICY_RESPONSE_AGENT_TERMS_SIZE,
  searchLatestPolicyResponses,
  type LatestPolicyResponseAction,
} from '../../../../../endpoint/services/policy_response/latest_policy_response_aggregation';

const TROUBLESHOOTING_SOURCE_FIELDS = [
  '_id',
  'agent.id',
  'host.os.name',
  'Endpoint.policy.applied.actions',
] as const;

export interface PolicyResponseFailureEvent {
  _id: string[];
  'agent.id': string[];
  'host.os.name': string[];
  'actions.name': string[];
  'actions.message': string[];
  'actions.status': string[];
}

export interface RefetchPolicyResponseOptions {
  endpointIds: string[];
  size?: number;
  ccsEnabled?: boolean;
}

const isFailureOrWarning = (action: LatestPolicyResponseAction): boolean =>
  action.status === HostPolicyResponseActionStatus.failure ||
  action.status === HostPolicyResponseActionStatus.warning;

const UNKNOWN_OS_NAME = 'unknown';

export async function getPolicyResponseFailureEvents(
  esClient: ElasticsearchClient,
  { endpointIds, size, ccsEnabled }: RefetchPolicyResponseOptions
): Promise<PolicyResponseFailureEvent[]> {
  const { hits } = await searchLatestPolicyResponses(esClient, {
    agentIds: endpointIds,
    termsSize: size ?? LATEST_POLICY_RESPONSE_AGENT_TERMS_SIZE,
    ccsEnabled: ccsEnabled ?? false,
    sourceFields: TROUBLESHOOTING_SOURCE_FIELDS,
    excludeInitialPolicy: true,
  });

  return hits.flatMap((latestHit) => {
    const failedActions = (latestHit._source?.Endpoint?.policy?.applied?.actions ?? []).filter(
      isFailureOrWarning
    );

    if (failedActions.length === 0) {
      return [];
    }

    return [
      {
        _id: [latestHit._id],
        'agent.id': [latestHit._source?.agent?.id ?? ''],
        'host.os.name': [latestHit._source?.host?.os?.name ?? UNKNOWN_OS_NAME],
        'actions.name': failedActions.map((action) => action.name),
        'actions.message': failedActions.map((action) => action.message),
        'actions.status': failedActions.map((action) => action.status),
      },
    ];
  });
}
