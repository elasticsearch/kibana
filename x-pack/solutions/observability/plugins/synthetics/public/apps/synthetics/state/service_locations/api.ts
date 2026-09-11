/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import type {
  ServiceLocations,
  ServiceLocationsApiResponse,
  ThrottlingOptions,
} from '../../../../../common/runtime_types';
import { ServiceLocationsApiResponseCodec } from '../../../../../common/runtime_types/zod/locations';
import { apiService } from '../../../../utils/api_service';

export const fetchServiceLocations = async (): Promise<{
  throttling: ThrottlingOptions | undefined;
  locations: ServiceLocations;
}> => {
  const { throttling, locations } = await apiService.get<ServiceLocationsApiResponse>(
    SYNTHETICS_API_URLS.SERVICE_LOCATIONS,
    undefined,
    ServiceLocationsApiResponseCodec
  );
  return { throttling, locations };
};
