/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { useMemo } from 'react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { FETCH_STATUS, isPending, useFetcher } from '../../hooks/use_fetcher';
import { useManagedOtlpServiceAvailability } from '../shared/use_managed_otlp_service_availability';
import type { SupportedLogo } from '../shared/logo_icon';
import type { ApiEndpointId } from '../../../common/api_endpoints';
import type { ObservabilityOnboardingAppServices } from '../..';
import { API_ENDPOINTS, type ApiEndpointContext } from './endpoints_config';

export interface ResolvedApiEndpoint {
  id: ApiEndpointId;
  label: string;
  logo?: SupportedLogo;
  euiIconType?: EuiIconType;
  url?: string;
}

export function useApiEndpoints(): {
  endpoints: ResolvedApiEndpoint[];
  isLoading: boolean;
  isError: boolean;
} {
  const isManagedOtlpServiceAvailable = useManagedOtlpServiceAvailability();
  const {
    services: {
      context: { isServerless },
    },
  } = useKibana<ObservabilityOnboardingAppServices>();

  const { data, status } = useFetcher(
    (callApi) => callApi('GET /internal/observability_onboarding/api_endpoints'),
    [],
    { showToastOnError: false }
  );

  const endpoints = useMemo(() => {
    const endpointContext: ApiEndpointContext = {
      elasticsearchUrl: data?.elasticsearchUrl || undefined,
      managedOtlpServiceUrl: data?.managedOtlpServiceUrl || undefined,
      isManagedOtlpServiceAvailable,
      isServerless,
    };

    return API_ENDPOINTS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      logo: definition.logo,
      euiIconType: definition.euiIconType,
      url: definition.getUrl(endpointContext),
    }));
  }, [
    data?.elasticsearchUrl,
    data?.managedOtlpServiceUrl,
    isManagedOtlpServiceAvailable,
    isServerless,
  ]);

  return { endpoints, isLoading: isPending(status), isError: status === FETCH_STATUS.FAILURE };
}
