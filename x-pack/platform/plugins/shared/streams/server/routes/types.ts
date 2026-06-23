/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { InferenceClient } from '@kbn/inference-common';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { DefaultRouteHandlerResources } from '@kbn/server-route-repository';
import type { IUiSettingsClient } from '@kbn/core/server';
import type { IFieldsMetadataClient } from '@kbn/fields-metadata-plugin/server/services/fields_metadata/types';
import type { RulesClientCreateOptions } from '@kbn/alerting-plugin/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import type { ContentClient } from '../lib/content/content_client';
import type { AttachmentClient } from '../lib/streams/attachments/attachment_client';
import type { StreamsClient } from '../lib/streams/client';
import type { EbtTelemetryClient } from '../lib/telemetry';
import type { StreamsServer } from '../types';
import type { KnowledgeIndicatorClient } from '../lib/streams/ki';
import type { SignificantEventsClients } from '../lib/sig_events/significant_events_clients';
import type { ProcessorSuggestionsService } from '../lib/streams/ingest_pipelines/processor_suggestions_service';
import type { IPatternExtractionService } from '../lib/pattern_extraction/pattern_extraction_service';
import type { TaskClient } from '../lib/tasks/task_client';
import type { StreamsTaskType } from '../lib/tasks/task_definitions';
import type { StreamsSettingsStorageClient } from '../lib/streams/storage/streams_settings_storage_client';
import type { ContinuousKiOnboardingWorkflowService } from '../lib/workflows/continuous_onboarding_workflow';
import type { WorkflowClients } from '../lib/workflows/create_workflow_clients';
import type { SigEventsTuningConfig } from '../../common/sig_events_tuning_config';

export type GetScopedClients = (params: {
  request: KibanaRequest;
  rulesClientOptions?: RulesClientCreateOptions;
}) => Promise<RouteHandlerScopedClients>;

export interface RouteHandlerScopedClients extends SignificantEventsClients {
  scopedClusterClient: IScopedClusterClient;
  soClient: SavedObjectsClientContract;
  attachmentClient: AttachmentClient;
  streamsClient: StreamsClient;
  getKnowledgeIndicatorClient: () => Promise<KnowledgeIndicatorClient>;
  inferenceClient: InferenceClient;
  contentClient: ContentClient;
  getAlertingV2RulesClient: () => Promise<RulesClientApi | undefined>;
  licensing: LicensingPluginStart;
  uiSettingsClient: IUiSettingsClient;
  globalUiSettingsClient: IUiSettingsClient;
  fieldsMetadataClient: IFieldsMetadataClient;
  taskClient: TaskClient<StreamsTaskType>;
  streamsSettingsStorageClient: StreamsSettingsStorageClient;
  isSecurityEnabled: boolean;
  tuningConfig: SigEventsTuningConfig;
}

export interface RouteDependencies {
  server: StreamsServer;
  telemetry: EbtTelemetryClient;
  getScopedClients: GetScopedClients;
  processorSuggestions: ProcessorSuggestionsService;
  patternExtractionService: IPatternExtractionService;
  continuousKiOnboardingWorkflowService?: ContinuousKiOnboardingWorkflowService;
  workflowClients: WorkflowClients;
  getSpaceId: (request: KibanaRequest) => Promise<string>;
}

export type StreamsRouteHandlerResources = RouteDependencies & DefaultRouteHandlerResources;
