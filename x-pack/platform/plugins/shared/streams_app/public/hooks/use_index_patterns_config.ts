/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { DEFAULT_INDEX_PATTERNS, parseIndexPatterns } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS } from '@kbn/management-settings-ids';
import { useKibana } from './use_kibana';

/**
 * Hook to get configured index patterns and utilities.
 */
export function useIndexPatternsConfig() {
  const { core } = useKibana();

  const rawValue = core.settings.client.get<string>(
    OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS,
    DEFAULT_INDEX_PATTERNS
  );

  const indexPatterns = useMemo(() => parseIndexPatterns(rawValue), [rawValue]);

  return {
    indexPatterns,
  };
}
