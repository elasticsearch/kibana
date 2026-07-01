/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { QueryLink, StreamQuery } from '@kbn/significant-events-schema';
import { deriveQueryType, hasSameEsql } from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import type { Streams } from '@kbn/streams-schema';
import { computeRuleId } from '../helpers/compute_rule_id';
import { installQueries, uninstallQueries } from './rule_orchestration';
import { queryFromLink } from './serializers';
import { KI_TYPE_QUERY } from '../fields';
import type { KIBulkOperation } from './types';
import type { IRulesManagementClient } from './rules/rules_management_client';
import type { IndicatorWriter } from './indicator_writer';
import type { IndicatorReader } from './indicator_reader';
import { canQueryBeRuleBacked } from '../../../significant_events/alerting/significant_events_alerting_context';

export class QueryRuleOrchestrator {
  constructor(
    private readonly rulesManagementClient: IRulesManagementClient,
    private readonly logger: Logger,
    private readonly isSignificantEventsEnabled: boolean,
    private readonly writer: IndicatorWriter,
    private readonly reader: IndicatorReader
  ) {}

  async syncQueries(
    definition: Streams.all.Definition,
    queries: StreamQuery[],
    options?: { currentLinks?: QueryLink[] }
  ): Promise<void> {
    const stream = definition.name;
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(
        `Skipping syncQueries for stream "${stream}" because significant events feature is disabled.`
      );
      return;
    }

    const currentLinks =
      options?.currentLinks ?? (await this.reader.getStreamToQueryLinksMap([stream]))[stream];
    const currentByQueryId = new Map(currentLinks.map((link) => [link.query.id, link]));
    const nextIds = new Set(queries.map((q) => q.id));

    const toCreate: QueryLink[] = [];
    const toUpdate: QueryLink[] = [];
    const demotedToStats: QueryLink[] = [];
    const allNext: Array<{ query: StreamQuery; rule_backed: boolean; rule_id: string }> = [];

    for (const query of queries) {
      const current = currentByQueryId.get(query.id);
      const queryType = deriveQueryType(query.esql.query);
      const isStats = queryType === QUERY_TYPE_STATS;
      const ruleId = computeRuleId(stream, query.id, query.esql.query);
      const ruleBacked = canQueryBeRuleBacked(queryType);
      if (!current) {
        const link: QueryLink = {
          stream_name: stream,
          rule_backed: ruleBacked,
          rule_id: ruleId,
          query: { ...query, type: queryType },
        };
        if (ruleBacked) toCreate.push(link);
        allNext.push({ query: link.query, rule_backed: ruleBacked, rule_id: ruleId });
      } else if (!current.rule_backed) {
        // Preserve intentionally unbacked queries; promotion is explicit via promoteQueries.
        allNext.push({
          query: { ...query, type: queryType },
          rule_backed: false,
          rule_id: current.rule_id,
        });
      } else if (isStats && !canQueryBeRuleBacked(queryType)) {
        demotedToStats.push(current);
        allNext.push({ query, rule_backed: false, rule_id: current.rule_id });
      } else if (!hasSameEsql(current.query.esql.query, query.esql.query)) {
        const link: QueryLink = {
          stream_name: stream,
          rule_backed: true,
          rule_id: ruleId,
          query: { ...query, type: queryType },
        };
        toCreate.push(link); // breaking change → recreate
        allNext.push({ query: link.query, rule_backed: true, rule_id: ruleId });
      } else {
        const link: QueryLink = { ...current, query };
        toUpdate.push(link);
        allNext.push({ query, rule_backed: true, rule_id: current.rule_id });
      }
    }

    const toUninstall = currentLinks.filter(
      (link) =>
        (link.rule_backed && !nextIds.has(link.query.id)) ||
        toCreate.some((c) => c.query.id === link.query.id && link.rule_backed) ||
        demotedToStats.some((d) => d.query.id === link.query.id)
    );

    try {
      await installQueries(this.rulesManagementClient, toCreate, toUpdate);
    } catch (installError) {
      this.logger.error(
        `installQueries failed during syncQueries for stream "${stream}". Compensating by uninstalling created rules.`
      );
      await uninstallQueries(this.rulesManagementClient, toCreate).catch((compensateError) => {
        this.logger.error(
          `Failed to compensate after installQueries failure for stream "${stream}": ${
            compensateError instanceof Error ? compensateError.message : String(compensateError)
          }`
        );
      });
      throw installError;
    }

    // Install succeeded — safe to remove stale and replaced rules now.
    // Doing this after install preserves monitoring coverage during ESQL-change
    // transitions: the old rule keeps firing until the new one is ready.
    await uninstallQueries(this.rulesManagementClient, toUninstall);

    // Append revisions for every next query and a tombstone for every
    // current link that's no longer in the input set.
    const operations: KIBulkOperation[] = [];
    for (const next of allNext) {
      operations.push({
        index: {
          query: {
            ...next.query,
            rule_backed: next.rule_backed,
            rule_id: next.rule_id,
          },
        },
      });
    }
    for (const link of currentLinks) {
      if (!nextIds.has(link.query.id)) {
        operations.push({ delete: { type: KI_TYPE_QUERY, id: link.query.id } });
      }
    }

    try {
      await this.writer.bulk(stream, operations);
    } catch (storageError) {
      this.logger.error(
        `Storage append failed after rule install for stream "${stream}". Compensating by uninstalling new rules.`
      );
      await uninstallQueries(this.rulesManagementClient, toCreate).catch((compensateError) => {
        this.logger.error(
          `Failed to compensate after bulk failure for stream "${stream}": ${
            compensateError instanceof Error ? compensateError.message : String(compensateError)
          }`
        );
      });
      throw storageError;
    }
  }

  async upsertQuery(definition: Streams.all.Definition, query: StreamQuery): Promise<void> {
    const stream = definition.name;
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(
        `Skipping upsertQuery for stream "${stream}" because significant events feature is disabled.`
      );
      return;
    }

    const { [stream]: currentLinks } = await this.reader.getStreamToQueryLinksMap([stream]);
    const currentByQueryId = new Map(currentLinks.map((link) => [link.query.id, link]));
    const existing = currentByQueryId.get(query.id);

    const scopedLinks = currentLinks.filter((l) => l.rule_backed || l.query.id === query.id);

    if (!existing) {
      await this.syncQueries(definition, [...scopedLinks.map(queryFromLink), query], {
        currentLinks: scopedLinks,
      });
      return;
    }
    await this.syncQueries(
      definition,
      scopedLinks.map((l) => (l.query.id === query.id ? query : queryFromLink(l))),
      { currentLinks: scopedLinks }
    );
  }

  async deleteQuery(definition: Streams.all.Definition, queryId: string): Promise<void> {
    const stream = definition.name;
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(
        `Skipping deleteQuery for stream "${stream}" because significant events feature is disabled.`
      );
      return;
    }

    const { [stream]: currentLinks } = await this.reader.getStreamToQueryLinksMap([stream]);
    const target = currentLinks.find((link) => link.query.id === queryId);
    if (!target) {
      return;
    }

    if (target.rule_backed) {
      await uninstallQueries(this.rulesManagementClient, [target]);
    }
    await this.writer.bulk(stream, [{ delete: { type: KI_TYPE_QUERY, id: queryId } }]);
  }

  async deleteAllQueries(streamName: string): Promise<void> {
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(
        `Skipping deleteAllQueries for stream "${streamName}" because significant events feature is disabled.`
      );
      return;
    }

    const { [streamName]: currentLinks } = await this.reader.getStreamToQueryLinksMap([streamName]);
    const ruleBacked = currentLinks.filter((link) => link.rule_backed);
    if (ruleBacked.length > 0) {
      await uninstallQueries(this.rulesManagementClient, ruleBacked);
    }
    if (currentLinks.length === 0) {
      return;
    }
    await this.writer.bulk(
      streamName,
      currentLinks.map((link) => ({
        delete: { type: KI_TYPE_QUERY, id: link.query.id },
      }))
    );
  }

  async promoteQueries(
    definition: Streams.all.Definition,
    queryIds: string[]
  ): Promise<{ promoted: number; skipped_stats: number }> {
    const streamName = definition.name;
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(`Skipping promoteQueries because significant events feature is disabled.`);
      return { promoted: 0, skipped_stats: 0 };
    }

    const { [streamName]: links } = await this.reader.getStreamToQueryLinksMap([streamName]);
    const idSet = new Set(queryIds);
    const candidates = links.filter((link) => idSet.has(link.query.id) && !link.rule_backed);

    const skippedStats = candidates.filter((link) => !canQueryBeRuleBacked(link.query.type));
    if (skippedStats.length > 0) {
      this.logger.info(
        `Skipping ${skippedStats.length} STATS queries from promotion for stream "${streamName}" (STATS rule backing is not supported yet).`
      );
    }

    const toPromote = candidates
      .filter((link) => canQueryBeRuleBacked(link.query.type))
      .map((link) => ({
        ...link,
        rule_backed: true,
        rule_id: computeRuleId(streamName, link.query.id, link.query.esql.query),
      }));

    if (toPromote.length === 0) {
      return { promoted: 0, skipped_stats: skippedStats.length };
    }

    await installQueries(this.rulesManagementClient, toPromote, []);

    try {
      await this.writer.bulk(
        streamName,
        toPromote.map((link) => ({
          index: {
            query: {
              ...queryFromLink(link),
              rule_backed: true,
              rule_id: link.rule_id,
            },
          },
        }))
      );
    } catch (storageError) {
      this.logger.error(
        `Storage append failed after installing rules for stream "${streamName}". Compensating by uninstalling.`
      );
      await uninstallQueries(this.rulesManagementClient, toPromote).catch((uninstallError) => {
        this.logger.error(
          `Failed to compensate — orphaned rules may remain for stream "${streamName}": ${
            uninstallError instanceof Error ? uninstallError.message : String(uninstallError)
          }`
        );
      });
      throw storageError;
    }

    return { promoted: toPromote.length, skipped_stats: skippedStats.length };
  }

  async promoteUnbackedQueries({
    queryIds,
    minSeverityScore,
    streamDefinitions,
  }: {
    queryIds?: string[];
    minSeverityScore?: number;
    streamDefinitions: Map<string, Streams.all.Definition>;
  }): Promise<{ promoted: number; skipped_stats: number }> {
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(
        `Skipping promoteUnbackedQueries because significant events feature is disabled.`
      );
      return { promoted: 0, skipped_stats: 0 };
    }

    const candidates = await this.reader.getPromotableUnbackedQueries({ minSeverityScore });

    let toPromote = candidates;
    if (queryIds && queryIds.length > 0) {
      const requestedIds = new Set(queryIds);
      toPromote = candidates.filter((link) => requestedIds.has(link.query.id));
    }

    const byStream = new Map<string, string[]>();
    for (const link of toPromote) {
      const group = byStream.get(link.stream_name) ?? [];
      group.push(link.query.id);
      byStream.set(link.stream_name, group);
    }

    let promoted = 0;
    let skippedStats = 0;
    for (const [streamName, ids] of byStream) {
      const definition = streamDefinitions.get(streamName);
      if (!definition) {
        this.logger.warn(`Skipping promotion for missing stream ${streamName}`);
        continue;
      }
      const result = await this.promoteQueries(definition, ids);
      promoted += result.promoted;
      skippedStats += result.skipped_stats;
    }

    return { promoted, skipped_stats: skippedStats };
  }

  async demoteQueries(
    definition: Streams.all.Definition,
    queryIds: string[]
  ): Promise<{ demoted: number }> {
    const streamName = definition.name;
    if (!this.isSignificantEventsEnabled) {
      this.logger.debug(`Skipping demoteQueries because significant events feature is disabled.`);
      return { demoted: 0 };
    }

    const { [streamName]: links } = await this.reader.getStreamToQueryLinksMap([streamName]);
    const idSet = new Set(queryIds);
    const toDemote = links.filter((link) => link.rule_backed && idSet.has(link.query.id));

    if (toDemote.length === 0) {
      return { demoted: 0 };
    }

    await uninstallQueries(this.rulesManagementClient, toDemote);

    await this.writer.bulk(
      streamName,
      toDemote.map((link) => ({
        index: {
          query: {
            ...queryFromLink(link),
            rule_backed: false,
            rule_id: link.rule_id,
          },
        },
      }))
    );

    return { demoted: toDemote.length };
  }
}
