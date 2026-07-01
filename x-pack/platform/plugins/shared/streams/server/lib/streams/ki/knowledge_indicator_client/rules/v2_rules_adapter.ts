/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file -- RulesNotInstalledAdapterV2 is the no-plugin stub paired with RulesAdapterV2 */

import { isBoom } from '@hapi/boom';
import type { Logger } from '@kbn/core/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import { stripMetadata, deriveQueryType } from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import { MATCH_LOOKBACK_MINUTES } from '../../../../significant_events/rules/esql/common';
import {
  STREAMS_RULE_CONSUMER,
  STREAMS_ESQL_RULE_TYPE_ID,
  type CreateRuleBody,
  type IRulesManagementClient,
  type UpdateRuleBody,
} from './rules_management_client';

const V2_MATCH_LOOKBACK = `${MATCH_LOOKBACK_MINUTES}m` as const;

/**
 * Wraps alerting_v2 `RulesClientApi` to implement IRulesManagementClient.
 *
 * create/update handle their own 409/404 fallbacks internally so QueryClient does not
 * need to know which framework is in use.
 *
 * Space context: the caller must obtain the client with the intended space
 * (SigEvents uses default space), matching the former HTTP client behavior.
 */
export class RulesAdapterV2 implements IRulesManagementClient {
  constructor(private readonly rulesClient: RulesClientApi) {}

  async createRule(id: string, body: CreateRuleBody): Promise<void> {
    await this.rulesClient
      .createRule({ data: toV2CreateBody(body), options: { id } })
      .catch((error) => {
        if (isBoom(error) && error.output.statusCode === 409) {
          return this.updateRule(id, toUpdateBodyFromCreate(body));
        }
        throw error;
      });
  }

  async updateRule(id: string, body: UpdateRuleBody): Promise<void> {
    await this.rulesClient.updateRule({ id, data: toV2UpdateBody(body) }).catch((error) => {
      if (isBoom(error) && error.output.statusCode === 404) {
        return this.createRuleWithoutFallback(id, toCreateBodyFromUpdate(body));
      }
      throw error;
    });
  }

  async bulkDeleteRules(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { errors } = await this.rulesClient.bulkDeleteRules({ ids });
    const fatal = errors.filter((e) => e.error.statusCode !== 404);
    if (fatal.length > 0) {
      const detail = fatal.map((e) => `${e.id}: ${e.error.message}`).join('; ');
      throw new Error(`V2 bulk delete failed for ${fatal.length} rule(s): ${detail}`);
    }
  }

  /**
   * Create variant used by `updateRule`'s 404 branch. A 409 here means a concurrent
   * writer (re)created the rule between our `updateRule` 404 and this create — that's
   * fine, the rule exists now. Swallowing keeps this terminal and prevents the
   * create→409→update→404→create cycle the method name promises to avoid.
   */
  private async createRuleWithoutFallback(id: string, body: CreateRuleBody): Promise<void> {
    await this.rulesClient
      .createRule({ data: toV2CreateBody(body), options: { id } })
      .catch((error) => {
        if (isBoom(error) && error.output.statusCode === 409) {
          return;
        }
        throw error;
      });
  }
}

/**
 * Used when the alerting v2 plugin is not installed: `DualCleanupRulesAdapter` still needs
 * a secondary client reference shape; v2 cleanup becomes a no-op.
 */
export class RulesNotInstalledAdapterV2 implements IRulesManagementClient {
  constructor(private readonly logger: Logger) {}

  async createRule(): Promise<void> {
    throw new Error('Alerting v2 plugin is not available');
  }

  async updateRule(): Promise<void> {
    throw new Error('Alerting v2 plugin is not available');
  }

  async bulkDeleteRules(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.logger.debug(
      `Skipping v2 rule cleanup for ${ids.length} id(s): alerting v2 plugin is not available.`
    );
  }
}

/**
 * v1 tags arrive as `['streams', '<streamName>']`. v2 uses a single structured tag
 * `sigevents:stream:<streamName>` for operations and future filtering; significant-events
 * reads scope `.rule-events` by `rule.id` from stored query links, not by this tag.
 */
function toV2Tags(v1Tags: string[]): string[] {
  const streamName = v1Tags.find((t) => t !== 'streams');
  return streamName ? [`sigevents:stream:${streamName}`] : v1Tags;
}

/**
 * v2 grouping fields for SigEvents MATCH queries.
 *
 * Each MATCH row corresponds to one source document; using `_id` makes the group hash
 * stable across overlapping evaluation windows (with `lookback: 2m` and `every: 1m`,
 * adjacent runs see the same documents). v1 additionally dedupes re-emissions via
 * executor state; v2 may index the same breached row on each run until recovery.
 * Without an explicit grouping, v2 falls
 * back to a per-row hash that includes the execution UUID, producing a fresh group on
 * every run and a duplicate signal per document per evaluation.
 *
 * The query passed to v2 retains `METADATA _id` (only `_source` is stripped) so that
 * `_id` is present as a column for v2's `buildGroupHash` to read.
 */
const V2_MATCH_GROUPING_FIELDS = ['_id'] as const;

const V2_QUERY_METADATA_TO_STRIP = ['_source'];

function assertMatchQuery(esqlQuery: string): void {
  if (deriveQueryType(esqlQuery) === QUERY_TYPE_STATS) {
    throw new Error(
      'STATS queries cannot be installed as v2 signal rules until rule-on-rule provisioning (#265778).'
    );
  }
}

function toV2BreachQuery(esqlQuery: string): string {
  assertMatchQuery(esqlQuery);
  return stripMetadata(esqlQuery, V2_QUERY_METADATA_TO_STRIP);
}

/**
 * `body.enabled` is intentionally not forwarded: the v2 create schema doesn't accept it
 * and `RulesClient.createRule` hardcodes `enabled: true` server-side. Callers that want a
 * disabled rule must call `disableRule` after creation.
 */
function toV2CreateBody(body: CreateRuleBody) {
  const esqlQuery = body.params.query;
  return {
    kind: 'signal' as const,
    metadata: {
      name: body.name,
      tags: toV2Tags(body.tags),
    },
    time_field: body.params.timestampField,
    schedule: { every: body.schedule.interval, lookback: V2_MATCH_LOOKBACK },
    grouping: { fields: [...V2_MATCH_GROUPING_FIELDS] },
    query: {
      format: 'standalone' as const,
      breach: { query: toV2BreachQuery(esqlQuery) },
    },
  };
}

function toV2UpdateBody(body: UpdateRuleBody) {
  const esqlQuery = body.params.query;
  return {
    metadata: {
      name: body.name,
      tags: toV2Tags(body.tags),
    },
    time_field: body.params.timestampField,
    schedule: { every: body.schedule.interval, lookback: V2_MATCH_LOOKBACK },
    grouping: { fields: [...V2_MATCH_GROUPING_FIELDS] },
    query: {
      format: 'standalone' as const,
      breach: { query: toV2BreachQuery(esqlQuery) },
    },
  };
}

function toUpdateBodyFromCreate(body: CreateRuleBody): UpdateRuleBody {
  return {
    name: body.name,
    actions: [] as never[],
    params: body.params,
    tags: body.tags,
    schedule: body.schedule,
  };
}

/**
 * Reconstructs a CreateRuleBody from an UpdateRuleBody for the update→404→create path.
 * `enabled: true` satisfies the v1-shaped `CreateRuleBody` contract; v2 ignores the field
 * and always creates rules enabled (see `toV2CreateBody`).
 */
function toCreateBodyFromUpdate(body: UpdateRuleBody): CreateRuleBody {
  return {
    name: body.name,
    consumer: STREAMS_RULE_CONSUMER,
    alertTypeId: STREAMS_ESQL_RULE_TYPE_ID,
    actions: [] as never[],
    params: body.params,
    enabled: true,
    tags: body.tags,
    schedule: body.schedule,
  };
}
