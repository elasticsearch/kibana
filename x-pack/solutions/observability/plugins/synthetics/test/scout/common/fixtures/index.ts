/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiServicesFixture } from '@kbn/scout-oblt';
import { apiTest as baseApiTest } from '@kbn/scout-oblt';
import {
  createSyntheticsPrivateLocationApi,
  type SyntheticsPrivateLocationApi,
} from '../services/synthetics_private_location_api_service';

export type SyntheticsApiServicesFixture = ApiServicesFixture & {
  syntheticsPrivateLocations: SyntheticsPrivateLocationApi;
};

/**
 * Scout `apiTest` for synthetics API specs.
 *
 * Extends `apiServices` with `syntheticsPrivateLocations`, a worker-scoped
 * helper that manages the synthetics Fleet package install and private-location
 * saved objects. Use in `beforeAll`/`afterAll` for environment prep only —
 * keep the HTTP call *under test* on `apiClient` with scoped credentials from
 * `requestAuth` / `samlAuth`.
 */
export const apiTest = baseApiTest.extend<{}, { apiServices: SyntheticsApiServicesFixture }>({
  apiServices: [
    async ({ apiServices, kbnClient }, use) => {
      const syntheticsPrivateLocations = createSyntheticsPrivateLocationApi(
        kbnClient,
        apiServices.fleet
      );
      const extended: SyntheticsApiServicesFixture = {
        ...apiServices,
        syntheticsPrivateLocations,
      };
      await use(extended);
    },
    { scope: 'worker' },
  ],
});

export {
  KIBANA_HEADERS,
  PUBLIC_API_HEADERS,
  PUBLIC_API_VERSION,
  INTERNAL_API_VERSION,
  SYNTHETICS_API_URLS,
  SYNTHETICS_MONITOR_SO_TYPES,
  SYNTHETICS_ALERTS_INDEX,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
} from './constants';
export type { SyntheticsAlertDoc } from './constants';
