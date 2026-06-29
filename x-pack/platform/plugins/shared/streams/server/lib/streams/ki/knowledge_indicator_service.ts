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
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
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
import { V1RulesAdapter } from './knowledge_indicator_client/rules/v1_rules_adapter';
import {
  V2RulesAdapter,
  V2RulesNotInstalledAdapter,
} from './knowledge_indicator_client/rules/v2_rules_adapter';
import { DualCleanupRulesAdapter } from './knowledge_indicator_client/rules/dual_cleanup_rules_adapter';
import {
  isSignificantEventsAlertingV2Active,
  logAlertingV2PluginUnavailable,
  readSignificantEventsAlertingV2UiEnabled,
} from '../../significant_events/significant_events_alerting_v2';

export class KnowledgeIndicatorService {
  constructor(
    private readonly coreSetup: CoreSetup<StreamsPluginStartDependencies>,
    private readonly logger: Logger
  ) {}

  async getClient({
    esClient,
    soClient,
    alertingRulesClient,
    alertingV2RulesClient,
    config = DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  }: {
    esClient: ElasticsearchClient;
    soClient: SavedObjectsClientContract;
    alertingRulesClient: RulesClient;
    alertingV2RulesClient?: RulesClientApi;
    config?: Pick<
      SignificantEventsTuningConfig,
      'semantic_min_score' | 'rrf_rank_constant' | 'feature_ttl_days'
    >;
  }): Promise<KnowledgeIndicatorClient> {
    const [core] = await this.coreSetup.getStartServices();

    const uiSettings = core.uiSettings.asScopedToClient(soClient);
    const [isSignificantEventsEnabled, alertingV2UiEnabled] = await Promise.all([
      uiSettings.get(OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS).then((v) => v ?? false),
      readSignificantEventsAlertingV2UiEnabled(uiSettings, this.logger),
    ]);

    if (alertingV2UiEnabled && !alertingV2RulesClient) {
      logAlertingV2PluginUnavailable(this.logger);
    }

    const alertingV2Enabled = isSignificantEventsAlertingV2Active(
      alertingV2UiEnabled,
      alertingV2RulesClient
    );

    const dataStreamClient: KnowledgeIndicatorDataStreamClient = DataStreamClient.fromDefinition<
      typeof knowledgeIndicatorsMappings,
      StoredKnowledgeIndicator & Record<string, unknown>
    >({
      dataStream: knowledgeIndicatorsDataStream,
      elasticsearchClient: esClient,
    });

    const v1Adapter = new V1RulesAdapter(alertingRulesClient);
    const v2Client = alertingV2RulesClient
      ? new V2RulesAdapter(alertingV2RulesClient)
      : new V2RulesNotInstalledAdapter(this.logger);

    const rulesManagementClient = alertingV2Enabled
      ? new DualCleanupRulesAdapter(v2Client, v1Adapter, this.logger)
      : new DualCleanupRulesAdapter(v1Adapter, v2Client, this.logger);

    return new KnowledgeIndicatorClient(
      {
        dataStreamClient,
        esClient,
        rulesManagementClient,
        soClient,
        logger: this.logger.get('knowledge_indicators'),
      },
      isSignificantEventsEnabled,
      config
    );
  }
}
