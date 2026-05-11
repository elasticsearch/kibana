/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  INSTALL_API_PATH,
  STATUS_API_PATH,
  UNINSTALL_API_PATH,
  DatasetSampleType,
  type StatusResponse,
  type InstallingResponse,
  type InstalledResponse,
  InstallationStatus,
} from '../../common';
import type { InternalServices } from '../types';
import { scheduleInstallSampleDataTask } from '../tasks';

export const registerInstallationRoutes = ({
  router,
  getServices,
}: {
  router: IRouter;
  getServices: () => InternalServices;
}) => {
  router.post(
    {
      path: INSTALL_API_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      validate: false,
      options: {
        access: 'internal',
        timeout: { idleSocket: 3 * 60 * 1000 }, // install can take time.
      },
    },
    async (ctx, req, res) => {
      const { sampleDataManager, taskManager, logger } = getServices();
      const sampleType = DatasetSampleType.elasticsearch;
      const core = await ctx.core;
      const esClient = core.elasticsearch.client.asCurrentUser;
      const soClient = core.savedObjects.client;

      try {
        const currentStatus = await sampleDataManager.getSampleDataStatus({
          sampleType,
          esClient,
          soClient,
        });

        if (currentStatus.status === InstallationStatus.Installing) {
          return res.ok<InstallingResponse>({
            body: {
              status: currentStatus.status,
              taskId: currentStatus.taskId || '',
            },
          });
        }

        if (
          currentStatus.status === InstallationStatus.Installed &&
          currentStatus.indexName &&
          currentStatus.dashboardId
        ) {
          return res.ok<InstalledResponse>({
            body: {
              status: currentStatus.status,
              indexName: currentStatus.indexName,
              dashboardId: currentStatus.dashboardId,
            },
          });
        }

        const taskId = await scheduleInstallSampleDataTask({
          taskManager,
          logger,
          sampleType,
        });

        return res.ok<InstallingResponse>({
          body: {
            status: InstallationStatus.Installing,
            taskId,
          },
        });
      } catch (e) {
        logger.error('Failed to schedule sample data installation', e);

        return res.customError({
          statusCode: e?.meta && e.meta?.statusCode ? e.meta?.statusCode : 500,
          body: {
            message: i18n.translate('xpack.sampleDataIngest.server.installSample.errorMessage', {
              defaultMessage: 'Failed to install sample data due to an exception.',
            }),
          },
        });
      }
    }
  );

  router.get(
    {
      path: STATUS_API_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      validate: false,
      options: {
        access: 'internal',
      },
    },
    async (ctx, req, res) => {
      const { sampleDataManager } = getServices();
      const core = await ctx.core;
      const esClient = core.elasticsearch.client.asCurrentUser;
      const soClient = core.savedObjects.client;

      try {
        const statusData = await sampleDataManager.getSampleDataStatus({
          sampleType: DatasetSampleType.elasticsearch,
          esClient,
          soClient,
        });

        return res.ok<StatusResponse>({
          body: {
            status: statusData.status,
            indexName: statusData.indexName,
            dashboardId: statusData.dashboardId,
            taskId: statusData.taskId,
            error: statusData.error,
          },
        });
      } catch (e) {
        return res.customError({
          statusCode: e?.meta && e.meta?.statusCode ? e.meta?.statusCode : 500,
          body: {
            message: i18n.translate('xpack.sampleDataIngest.server.getStatus.errorMessage', {
              defaultMessage: 'Failed to get status due to an exception.',
            }),
          },
        });
      }
    }
  );

  router.delete(
    {
      path: UNINSTALL_API_PATH,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
      validate: false,
      options: {
        access: 'internal',
      },
    },
    async (ctx, req, res) => {
      const { sampleDataManager, logger } = getServices();
      const sampleType = DatasetSampleType.elasticsearch;
      const core = await ctx.core;
      const esClient = core.elasticsearch.client.asCurrentUser;
      const soClient = core.savedObjects.client;

      try {
        await sampleDataManager.removeSampleData({
          sampleType,
          esClient,
          soClient,
        });

        return res.ok({
          body: {
            status: InstallationStatus.Uninstalled,
          },
        });
      } catch (e) {
        logger.error('Failed to uninstall sample data', e);

        return res.customError({
          statusCode: e?.meta && e.meta?.statusCode ? e.meta?.statusCode : 500,
          body: {
            message: i18n.translate('xpack.sampleDataIngest.server.uninstallSample.errorMessage', {
              defaultMessage: 'Failed to uninstall sample data due to an exception.',
            }),
          },
        });
      }
    }
  );
};
