/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY,
  OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS,
  OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_CANVAS,
} from '@kbn/management-settings-ids';
import { STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE } from '@kbn/streams-plugin/common';
import type { STREAMS_UI_PRIVILEGES } from '@kbn/streams-plugin/public';
import useObservable from 'react-use/lib/useObservable';
import { useKibana } from './use_kibana';

export type StreamsPrivileges = ReturnType<typeof useStreamsPrivileges>;
export type StreamsFeatures = StreamsPrivileges['features'];

export function useStreamsPrivileges() {
  const {
    core: {
      pricing,
      application: {
        capabilities: { streams },
      },
      uiSettings,
    },
    dependencies: {
      start: { licensing },
    },
  } = useKibana();

  const license = useObservable(licensing.license$);

  const queryStreamsEnabled = uiSettings.get(OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS, false);

  const significantEventsEnabled = uiSettings.get<boolean>(
    OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
    false // Default to false if the setting is not defined or not available
  );
  const significantEventsDiscoveryEnabled = uiSettings.get<boolean>(
    OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY,
    false
  );

  const significantEventsAvailableForTier = pricing.isFeatureAvailable(
    STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE.id
  );

  const contentPacksEnabled = uiSettings.get(OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS, false);

  const wiredStreamViewsEnabled = uiSettings.get(
    OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS,
    false
  );

  const draftStreamsEnabled = uiSettings.get(OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS, false);
  const canvasEnabled = uiSettings.get(OBSERVABILITY_STREAMS_ENABLE_CANVAS, false);

  return {
    ui: streams as {
      [STREAMS_UI_PRIVILEGES.manage]: boolean;
      [STREAMS_UI_PRIVILEGES.show]: boolean;
    },
    features: {
      ui: {
        enabled: true,
      },
      significantEvents: license && {
        enabled: significantEventsEnabled,
        available: license.hasAtLeast('enterprise') && significantEventsAvailableForTier,
      },
      significantEventsDiscovery: license && {
        enabled: significantEventsDiscoveryEnabled,
        available: license.hasAtLeast('enterprise') && significantEventsAvailableForTier,
      },
      queryStreams: {
        enabled: queryStreamsEnabled,
      },
      contentPacks: {
        enabled: contentPacksEnabled,
      },
      wiredStreamViews: {
        enabled: wiredStreamViewsEnabled,
      },
      draftStreams: {
        enabled: draftStreamsEnabled,
      },
      canvas: {
        enabled: canvasEnabled,
      },
    },
    isLoading: !license,
  };
}
