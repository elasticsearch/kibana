/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  ElasticsearchClient,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS } from '@kbn/management-settings-ids';
import { DataStreamClient } from '@kbn/data-streams';
import type { StreamsPluginStartDependencies } from '../../../types';
import {
  knowledgeIndicatorsDataStream,
  type StoredKnowledgeIndicator,
  type knowledgeIndicatorsMappings,
} from './data_stream';
import {
  KnowledgeIndicatorClient,
  type KnowledgeIndicatorDataStreamClient,
} from './knowledge_indicator_client';
import {
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  type SignificantEventsTuningConfig,
} from '../../../../common/significant_events_tuning_config';
import type { SignificantEventsAlertingContext } from '../../significant_events/alerting/significant_events_alerting_context';

export class KnowledgeIndicatorService {
  constructor(
    private readonly coreSetup: CoreSetup<StreamsPluginStartDependencies>,
    private readonly logger: Logger
  ) {}

  async getClient({
    esClient,
    soClient,
    context,
    config = DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  }: {
    esClient: ElasticsearchClient;
    soClient: SavedObjectsClientContract;
    context: SignificantEventsAlertingContext;
    config?: Pick<
      SignificantEventsTuningConfig,
      'semantic_min_score' | 'rrf_rank_constant' | 'feature_ttl_days'
    >;
  }): Promise<KnowledgeIndicatorClient> {
    const [coreStart] = await this.coreSetup.getStartServices();
    const uiSettings = coreStart.uiSettings.asScopedToClient(soClient);
    const isSignificantEventsEnabled = await uiSettings
      .get(OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS)
      .then((v) => v ?? false);

    const dataStreamClient: KnowledgeIndicatorDataStreamClient = DataStreamClient.fromDefinition<
      typeof knowledgeIndicatorsMappings,
      StoredKnowledgeIndicator & Record<string, unknown>
    >({
      dataStream: knowledgeIndicatorsDataStream,
      elasticsearchClient: esClient,
    });

    return new KnowledgeIndicatorClient(
      {
        dataStreamClient,
        esClient,
        soClient,
        logger: this.logger.get('knowledge_indicators'),
      },
      isSignificantEventsEnabled,
      context,
      config
    );
  }
}
