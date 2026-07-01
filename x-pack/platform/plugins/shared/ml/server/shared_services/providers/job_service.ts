/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import type { GetGuards } from '../shared_services';
import { jobServiceProvider } from '../../models/job_service';
import type { ServerlessInfo } from '../../types';

type OrigJobServiceProvider = ReturnType<typeof jobServiceProvider>;

export interface JobServiceProvider {
  jobServiceProvider(
    request: KibanaRequest,
    savedObjectsClient: SavedObjectsClientContract
  ): {
    jobsSummary: OrigJobServiceProvider['jobsSummary'];
    forceStartDatafeeds: OrigJobServiceProvider['forceStartDatafeeds'];
    stopDatafeeds: OrigJobServiceProvider['stopDatafeeds'];
  };
}

export function getJobServiceProvider(
  getGuards: GetGuards,
  serverless: ServerlessInfo
): JobServiceProvider {
  return {
    jobServiceProvider(request: KibanaRequest, savedObjectsClient: SavedObjectsClientContract) {
      const guards = getGuards(request, savedObjectsClient);
      return {
        jobsSummary: async (...args) => {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canGetJobs'])
            .ok(({ scopedClient, mlClient }) => {
              const { jobsSummary } = jobServiceProvider(scopedClient, mlClient, serverless);
              return jobsSummary(...args);
            });
        },
        forceStartDatafeeds: async (...args) => {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canStartStopDatafeed'])
            .ok(({ scopedClient, mlClient }) => {
              const { forceStartDatafeeds } = jobServiceProvider(
                scopedClient,
                mlClient,
                serverless
              );
              return forceStartDatafeeds(...args);
            });
        },
        stopDatafeeds: async (...args) => {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canStartStopDatafeed'])
            .ok(({ scopedClient, mlClient }) => {
              const { stopDatafeeds } = jobServiceProvider(scopedClient, mlClient, serverless);
              return stopDatafeeds(...args);
            });
        },
      };
    },
  };
}
