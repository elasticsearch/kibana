/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { globalSetupHook } from '@kbn/scout';
import { getSynthtraceClient } from '@kbn/scout-synthtrace';
import {
  createMetricsTestIndexIfNeeded,
  DIMENSIONS_WIPE_CONFIG,
} from '../fixtures/metrics_experience';
import {
  TRACES,
  richTrace,
  traceCorrelatedLogs,
  minimalTraceCorrelatedLogs,
  deepTrace,
} from '../fixtures/traces_experience';

globalSetupHook(
  'Setup Discover tests data',
  async ({ esClient, esArchiver, apiServices, config, log, kbnUrl }) => {
    // Logstash data for flyout stability tests
    log.debug(
      '[setup:logstash] loading logstash_functional ES data (only if it does not exist)...'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
    );
    log.debug('[setup:logstash] logstash_functional ES data ready');

    // Date nanos data for surrounding_docs/context app tests.
    log.debug('[setup:date_nanos] loading date_nanos ES data (only if it does not exist)...');
    await esArchiver.loadIfNeeded('src/platform/test/functional/fixtures/es_archiver/date_nanos');
    log.debug('[setup:date_nanos] date_nanos ES data ready');

    log.debug(
      '[setup:date_nanos_custom] loading date_nanos_custom ES data (only if it does not exist)...'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/date_nanos_custom'
    );
    log.debug('[setup:date_nanos_custom] date_nanos_custom ES data ready');

    // Unmapped fields test data
    log.debug(
      '[setup:unmapped_fields] loading unmapped_fields ES data (only if it does not exist)...'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/unmapped_fields'
    );
    log.debug('[setup:unmapped_fields] unmapped_fields ES data ready');

    // Index pattern without timefield test data
    log.debug(
      '[setup:index_pattern_without_timefield] loading index_pattern_without_timefield ES data (only if it does not exist)...'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
    );
    log.debug(
      '[setup:index_pattern_without_timefield] index_pattern_without_timefield ES data ready'
    );

    // Sample flights data for Discover tabs ES|QL time-field tests.
    log.debug(
      '[setup:kibana_sample_data_flights] loading kibana_sample_data_flights ES data (only if it does not exist)...'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
    );
    log.debug('[setup:kibana_sample_data_flights] kibana_sample_data_flights ES data ready');

    // Metrics Experience setup
    log.debug('[setup:metrics] creating metrics test index (only if it does not exist)...');
    const created = await createMetricsTestIndexIfNeeded(esClient);
    log.debug(
      created
        ? '[setup:metrics] metrics test index created successfully'
        : '[setup:metrics] metrics test index already exists, skipping'
    );

    // Companion index for stream-switch coverage
    log.debug(
      '[setup:metrics] creating companion metrics test index (only if it does not exist)...'
    );
    const createdOther = await createMetricsTestIndexIfNeeded(esClient, DIMENSIONS_WIPE_CONFIG);
    log.debug(
      createdOther
        ? '[setup:metrics] companion metrics test index created successfully'
        : '[setup:metrics] companion metrics test index already exists, skipping'
    );

    // Traces Experience setup (not supported in serverless security or search - no Fleet/APM privileges)
    const hasFleetSupport = !config.serverless || config.projectType === 'oblt';
    if (hasFleetSupport) {
      if (!config.isCloud) {
        await apiServices.fleet.internal.setup();
        log.debug('[setup:traces] Fleet infrastructure setup completed');
        await apiServices.fleet.agent.setup();
        log.debug('[setup:traces] Fleet agents setup completed');
      }

      const { apmEsClient } = await getSynthtraceClient('apmEsClient', {
        esClient,
        kbnUrl: kbnUrl.get(),
        log,
        config,
      });

      const { logsEsClient } = await getSynthtraceClient('logsEsClient', {
        esClient,
        log,
        config,
      });

      const timeRange = {
        from: new Date(TRACES.DEFAULT_START_TIME).getTime(),
        to: new Date(TRACES.DEFAULT_END_TIME).getTime(),
      };

      const { apmData, correlationIds } = richTrace(timeRange);

      await apmEsClient.index(apmData);
      log.debug('[setup:traces] Rich APM trace data indexed');

      await apmEsClient.index(deepTrace(timeRange));
      log.debug('[setup:traces] Deep trace data indexed');

      const logData = traceCorrelatedLogs({
        ...timeRange,
        traceId: correlationIds.richTraceId,
        transactionId: correlationIds.transactionId,
        dbSpanId: correlationIds.dbSpanId,
        processOrderSpanId: correlationIds.processOrderSpanId,
      });

      await logsEsClient.index(logData);
      log.debug('[setup:traces] Correlated log data indexed');

      const minimalLogData = minimalTraceCorrelatedLogs({
        ...timeRange,
        traceId: correlationIds.minimalTraceId,
        transactionId: correlationIds.minimalTransactionId,
      });

      await logsEsClient.index(minimalLogData);
      log.debug('[setup:traces] Minimal trace log data indexed');
    }
  }
);
