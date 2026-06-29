/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo, useState } from 'react';
import type { HttpSetup, IUiSettingsClient } from '@kbn/core/public';
import {
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED,
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS,
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS,
} from '@kbn/management-settings-ids';
import { DEFAULT_EXTRACTION_INTERVAL_HOURS } from '@kbn/streams-plugin/common';

export interface ContinuousExtractionState {
  enabled: boolean;
  intervalHours: number;
  excludedStreamPatterns: string;
}

const readSettingsFromClient = (globalClient: IUiSettingsClient): ContinuousExtractionState => ({
  enabled: globalClient.get<boolean>(OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED, false),
  intervalHours: globalClient.get<number>(
    OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS,
    DEFAULT_EXTRACTION_INTERVAL_HOURS
  ),
  excludedStreamPatterns: globalClient.get<string>(
    OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS,
    ''
  ),
});

export const useContinuousExtractionSettings = ({
  globalClient,
  http,
}: {
  globalClient: IUiSettingsClient;
  http: HttpSetup;
}) => {
  const [saved, setSaved] = useState<ContinuousExtractionState>(() =>
    readSettingsFromClient(globalClient)
  );
  const [draft, setDraft] = useState<ContinuousExtractionState>(saved);

  const hasChanged = useMemo(
    () =>
      draft.enabled !== saved.enabled ||
      draft.intervalHours !== saved.intervalHours ||
      draft.excludedStreamPatterns !== saved.excludedStreamPatterns,
    [draft, saved]
  );

  const reset = useCallback(() => {
    setDraft(saved);
  }, [saved]);

  const save = useCallback(async () => {
    await http.put('/internal/streams/_significant_events/settings', {
      body: JSON.stringify({ continuousKiExtraction: draft }),
    });

    await Promise.all([
      globalClient.set(OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED, draft.enabled),
      globalClient.set(
        OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS,
        draft.intervalHours
      ),
      globalClient.set(
        OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS,
        draft.excludedStreamPatterns
      ),
    ]);

    setSaved(draft);
  }, [globalClient, http, draft]);

  return useMemo(
    () => ({ saved, draft, setDraft, hasChanged, reset, save }),
    [saved, draft, hasChanged, reset, save]
  );
};
