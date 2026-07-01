/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RegisterEntityMaintainerConfig } from '@kbn/entity-store/server';

import { runRelationshipMaintainer } from '../engine/run_relationship_maintainer';
import type { RelationshipMaintainerTelemetryCollector } from '../types';
import { buildOwnsConfigs } from './configs';

export const ownsMaintainer: RegisterEntityMaintainerConfig = {
  id: 'owns',
  description:
    'Resolves owns (user → host device) relationships from raw_identifiers on entity documents ' +
    '(Okta: user → enrolled device via owns.raw_identifiers.host.id)',
  interval: '1d',
  timeout: '1h',
  initialState: {},
  run: async ({
    esClient,
    logger,
    status,
    crudClient,
    entityMetadataClient,
    abortController,
    telemetry,
  }) => {
    const namespace = status.metadata.namespace;
    const lastProcessedTimestamp =
      typeof status.state.lastProcessedTimestamp === 'string'
        ? status.state.lastProcessedTimestamp
        : undefined;

    if (lastProcessedTimestamp) {
      logger.info(`Starting owns maintainer run (incremental from ${lastProcessedTimestamp})`);
    } else {
      logger.info('Starting owns maintainer run (full scan — first run)');
    }

    const collector: RelationshipMaintainerTelemetryCollector = {
      sources: [],
      relationshipTypeApplied: {},
    };

    const result = await runRelationshipMaintainer({
      esClient,
      logger,
      namespace,
      crudClient,
      entityMetadataClient,
      integrations: buildOwnsConfigs(lastProcessedTimestamp),
      abortController,
      telemetryCollector: collector,
    });

    telemetry.report({
      iterations: result.totalIterations,
      truncated: result.truncated,
      funnel: {
        scanned: result.totalBuckets,
        qualified: result.totalRecords,
        proposed: result.totalRecords,
        applied: result.totalWritten,
        droppedNotInStore: result.totalNotFound,
        failed: result.totalWriteErrors,
        metadataDocsApplied: result.totalMetadataDocsApplied,
        // TODO: investigate whether to extend the telemetry funnel schema with a new field for
        // droppedTargets (result.totalDroppedTargets) or map it to an existing field before wiring.
      },
      sources: collector.sources,
      ...(Object.keys(collector.relationshipTypeApplied).length > 0 && {
        breakdown: Object.entries(collector.relationshipTypeApplied).map(([name, count]) => ({
          name,
          count,
        })),
      }),
    });

    logger.info(
      `Completed run: ${result.totalBuckets} buckets, ${result.totalRecords} records, ${result.totalWritten} entities written, ${result.totalDroppedTargets} targets dropped, ${result.totalMetadataDocsApplied} metadata docs appended`
    );

    // Do not advance the watermark if the run was aborted — the next run should
    // re-process the same window to avoid missing entities.
    if (abortController.signal.aborted) {
      logger.info('Run was aborted; watermark not advanced');
      return status.state;
    }

    const { lastRunTimestamp, ...persistedResult } = result;
    return {
      ...persistedResult,
      lastProcessedTimestamp: lastRunTimestamp,
    };
  },
};
