/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { crudRoutes } from './streams/crud/route';
import { enablementRoutes } from './streams/enablement/route';
import { managementRoutes } from './streams/management/route';
import { internalSchemaRoutes } from './internal/streams/schema/route';
import { internalProcessingRoutes } from './internal/streams/processing/route';
import { ingestRoutes } from './streams/ingest/route';
import { internalLifecycleRoutes } from './internal/streams/lifecycle/route';
import { queryStreamRoutes } from './streams/query/route';
import { contentRoutes } from './content/route';
import { internalCrudRoutes } from './internal/streams/crud/route';
import { internalManagementRoutes } from './internal/streams/management/route';
import { internalPromptsRoutes } from './internal/sig_events/prompts/route';
import { internalSignificantEventsRoutes } from './internal/sig_events/significant_events/route';
import { significantEventsRoutes } from './sig_events/streams/significant_events/route';
import { queryRoutes } from './sig_events/queries/route';
import { failureStoreRoutes } from './internal/streams/failure_store/route';
import { internalIngestRoutes } from './internal/streams/ingest/route';
import { connectorRoutes } from './internal/connectors/route';
import { docCountsRoutes } from './streams/doc_counts/route';
import { storageStatsRoutes } from './streams/storage_stats/route';
import { attachmentRoutes } from './attachments/route';
import { internalAttachmentRoutes } from './internal/attachments/route';
import { internalDescriptionGenerationRoutes } from './internal/sig_events/description_generation/route';
import { featureRoutes as internalFeatureRoutes } from './internal/sig_events/features/route';
import { identifyFeaturesRoutes as internalIdentifyFeaturesRoutes } from './internal/sig_events/features/identify_route';
import { internalTasksRoutes } from './internal/streams/tasks/route';
import { internalOnboardingRoutes } from './internal/streams/onboarding/route';
import { internalQueriesRoutes } from './internal/sig_events/queries/route';
import { internalEligibleStreamsRoutes } from './internal/sig_events/extraction/eligible_streams_route';
import { internalSignificantEventsSettingsRoutes } from './internal/sig_events/significant_events_settings/route';
import { timeSeriesRoutes } from './internal/streams/time_series/route';
import { internalMemoryRoutes } from './internal/memory/route';
import { internalSigEventsAvailabilityRoutes } from './internal/sig_events/availability/route';
import { internalSigEventsDetectionsRoutes } from './internal/sig_events/detections/route';
import { internalSigEventsDiscoveriesRoutes } from './internal/sig_events/discoveries/route';
import { internalSigEventsEventsRoutes } from './internal/sig_events/events/route';
import { keepAliveRoutes } from './internal/sig_events/knowledge_indicators/keep_alive_route';

export const streamsRouteRepository = {
  // internal APIs
  ...internalCrudRoutes,
  ...internalManagementRoutes,
  ...internalSchemaRoutes,
  ...internalLifecycleRoutes,
  ...internalProcessingRoutes,
  ...failureStoreRoutes,
  ...timeSeriesRoutes,
  ...internalPromptsRoutes,
  ...internalSignificantEventsRoutes,
  ...internalIngestRoutes,
  ...connectorRoutes,
  ...internalAttachmentRoutes,
  ...internalDescriptionGenerationRoutes,
  ...internalFeatureRoutes,
  ...internalIdentifyFeaturesRoutes,
  ...internalTasksRoutes,
  ...internalOnboardingRoutes,
  ...internalQueriesRoutes,
  ...internalEligibleStreamsRoutes,
  ...internalSignificantEventsSettingsRoutes,
  ...internalMemoryRoutes,
  ...internalSigEventsAvailabilityRoutes,
  ...internalSigEventsDetectionsRoutes,
  ...internalSigEventsDiscoveriesRoutes,
  ...internalSigEventsEventsRoutes,
  ...keepAliveRoutes,
  ...storageStatsRoutes,
  // public APIs
  ...docCountsRoutes,
  ...crudRoutes,
  ...enablementRoutes,
  ...managementRoutes,
  ...ingestRoutes,
  ...queryStreamRoutes,
  ...contentRoutes,
  ...significantEventsRoutes,
  ...queryRoutes,
  ...attachmentRoutes,
};

export type StreamsRouteRepository = typeof streamsRouteRepository;
