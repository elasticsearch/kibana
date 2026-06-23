/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext } from 'react';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import type { SyntheticsCCSSettings } from '../../../../../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../../../../../common/constants';
import { apiService } from '../../../../../../utils/api_service';
import { SyntheticsRefreshContext } from '../../../../contexts';

export interface CCSSettingsWithSpaces extends SyntheticsCCSSettings {
  // Spaces the settings are currently shared with. Empty when no settings document exists yet
  // (the server will anchor a new document to the current space on first save).
  spaces: string[];
}

export const DEFAULT_CCS_SETTINGS: CCSSettingsWithSpaces = {
  useAllRemoteClusters: false,
  selectedRemoteClusters: [],
  spaces: [],
};

export const fetchCCSSettings = async (): Promise<CCSSettingsWithSpaces> => {
  try {
    const settings = await apiService.get<{
      useAllRemoteClusters?: boolean;
      selectedRemoteClusters?: string[];
      spaces?: string[];
    }>(SYNTHETICS_API_URLS.MULTI_SPACE_SETTINGS);
    return {
      useAllRemoteClusters: settings.useAllRemoteClusters ?? false,
      selectedRemoteClusters: settings.selectedRemoteClusters ?? [],
      spaces: settings.spaces ?? [],
    };
  } catch (e) {
    return DEFAULT_CCS_SETTINGS;
  }
};

export const useGetCCSSettings = () => {
  const { lastRefresh } = useContext(SyntheticsRefreshContext);

  const { data, error, loading } = useFetcher(fetchCCSSettings, [lastRefresh]);

  return {
    data: data ?? DEFAULT_CCS_SETTINGS,
    error,
    loading,
  };
};
