/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';
import type { Logger } from '@kbn/logging';
import type { SampleDataSet, InstalledStatus } from '@kbn/home-sample-data-types';
import type { SampleDataIngestPluginStart, SampleDataIngestPluginSetup } from './types';
import { InstallationService } from './services/installation';
import {
  createSampleDataSet,
  mapInstallationStatusToInstalledStatus,
} from './services/composition/sample_data_set';
import { isSampleIndex } from './services/utils';
import { MINIMUM_LICENSE_TYPE } from '../common';

export class SampleDataIngestPlugin
  implements Plugin<SampleDataIngestPluginSetup, SampleDataIngestPluginStart>
{
  logger: Logger;

  constructor(context: PluginInitializerContext) {
    this.logger = context.logger.get();
  }
  setup(): SampleDataIngestPluginSetup {
    return {};
  }

  start(coreStart: CoreStart): SampleDataIngestPluginStart {
    const installationService = new InstallationService({ http: coreStart.http });

    /**
     * Returns the InstalledStatus for the sample data set by fetching the current
     * installation status and mapping it to the home plugin's status type.
     */
    const getInstalledStatus = async (): Promise<InstalledStatus> => {
      const statusResponse = await installationService.getInstallationStatus();
      return mapInstallationStatusToInstalledStatus(statusResponse.status);
    };

    /**
     * Returns the Elasticsearch documentation sample data set in the standard SampleDataSet format.
     * Returns null if the status cannot be fetched (e.g., plugin not available).
     */
    const getSampleDataSet = async (): Promise<SampleDataSet | null> => {
      try {
        const statusResponse = await installationService.getInstallationStatus();
        return createSampleDataSet(
          statusResponse,
          coreStart.http,
          () => installationService.install(),
          () => installationService.uninstall(),
          getInstalledStatus
        );
      } catch {
        return null;
      }
    };

    return {
      getStatus: () => installationService.getInstallationStatus(),
      install: () => installationService.install(),
      getSampleDataSet,
      isSampleIndex,
      minimumLicenseType: MINIMUM_LICENSE_TYPE,
    };
  }
}
