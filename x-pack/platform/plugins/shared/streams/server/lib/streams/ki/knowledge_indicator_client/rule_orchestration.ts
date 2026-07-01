/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryLink } from '@kbn/significant-events-schema';
import pLimit from 'p-limit';
import {
  STREAMS_RULE_CONSUMER,
  STREAMS_ESQL_RULE_TYPE_ID,
  type CreateRuleBody,
  type IRulesManagementClient,
  type UpdateRuleBody,
} from './rules/rules_management_client';
import { TIMESTAMP } from '../fields';

const RULE_INSTALL_CONCURRENCY = 10;
const RULE_TAG = 'streams';
const RULE_SCHEDULE_INTERVAL = '1m';

export function toCreateRuleBody(queryLink: QueryLink): CreateRuleBody {
  const { query } = queryLink;
  return {
    name: query.title,
    consumer: STREAMS_RULE_CONSUMER,
    alertTypeId: STREAMS_ESQL_RULE_TYPE_ID,
    actions: [] as never[],
    params: {
      timestampField: TIMESTAMP,
      query: query.esql.query,
    },
    enabled: true,
    tags: [RULE_TAG, queryLink.stream_name],
    schedule: {
      interval: RULE_SCHEDULE_INTERVAL,
    },
  };
}

export function toUpdateRuleBody(queryLink: QueryLink): UpdateRuleBody {
  const { query } = queryLink;
  return {
    name: query.title,
    actions: [] as never[],
    params: {
      timestampField: TIMESTAMP,
      query: query.esql.query,
    },
    tags: [RULE_TAG, queryLink.stream_name],
    schedule: {
      interval: RULE_SCHEDULE_INTERVAL,
    },
  };
}

export async function installQueries(
  client: IRulesManagementClient,
  queriesToCreate: QueryLink[],
  queriesToUpdate: QueryLink[]
) {
  const limiter = pLimit(RULE_INSTALL_CONCURRENCY);

  await Promise.all([
    ...queriesToCreate.map((queryLink) =>
      limiter(() => client.createRule(queryLink.rule_id, toCreateRuleBody(queryLink)))
    ),
    ...queriesToUpdate.map((queryLink) =>
      limiter(() => client.updateRule(queryLink.rule_id, toUpdateRuleBody(queryLink)))
    ),
  ]);
}

export async function uninstallQueries(
  client: IRulesManagementClient,
  queries: QueryLink[]
): Promise<void> {
  if (queries.length === 0) {
    return;
  }

  const ruleIds = queries.map((q) => q.rule_id);
  if (ruleIds.length === 0) {
    return;
  }

  await client.bulkDeleteRules(ruleIds);
}
