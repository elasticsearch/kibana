/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { IKibanaResponse } from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { InternalUploadAssetCriticalityV2CsvResponse } from '../../../../../common/api/entity_analytics';
import { CRITICALITY_CSV_MAX_SIZE_BYTES_WITH_TOLERANCE } from '../../../../../common/entity_analytics/asset_criticality';
import type { HapiReadableStream } from '../../../../types';
import {
  ASSET_CRITICALITY_CSV_UPLOAD_V2_URL,
  APP_ID,
  API_VERSIONS,
} from '../../../../../common/constants';
import { createAssetCriticalityProcessedFileEvent } from '../../../telemetry/event_based/events';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { AssetCriticalityAuditActions } from '../audit';
import { AUDIT_CATEGORY, AUDIT_OUTCOME, AUDIT_TYPE } from '../../audit';
import { csvUploadV2 } from '../csv_upload_v2';

export const assetCriticalityCSVUploadV2Route = ({
  getStartServices,
  logger,
  router,
}: EntityAnalyticsRoutesDeps) => {
  router.versioned
    .post({
      access: 'internal',
      path: ASSET_CRITICALITY_CSV_UPLOAD_V2_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
      options: {
        body: {
          output: 'stream',
          accepts: 'multipart/form-data',
          maxBytes: CRITICALITY_CSV_MAX_SIZE_BYTES_WITH_TOLERANCE,
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: schema.object({
              file: schema.stream(),
            }),
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<InternalUploadAssetCriticalityV2CsvResponse>> => {
        const start = new Date();
        const siemResponse = buildSiemResponse(response);
        const [coreStart] = await getStartServices();
        const telemetry = coreStart.analytics;

        try {
          const securitySolution = await context.securitySolution;
          securitySolution.getAuditLogger()?.log({
            message: 'User attempted to assign many asset criticalities via file upload',
            event: {
              action: AssetCriticalityAuditActions.ASSET_CRITICALITY_BULK_UPDATE,
              category: AUDIT_CATEGORY.DATABASE,
              type: AUDIT_TYPE.CREATION,
              outcome: AUDIT_OUTCOME.UNKNOWN,
            },
          });

          const entityStoreClient = securitySolution.getEntityStoreUpdateClient();

          const fileStream = request.body.file as HapiReadableStream;
          logger.debug(`Parsing asset criticality CSV file ${fileStream.hapi.filename}`);

          const result = await csvUploadV2({ entityStoreClient, fileStream, logger });
          const end = new Date();

          const tookMs = end.getTime() - start.getTime();
          const { items, ...stats } = result;
          logger.debug(
            () => `Asset criticality CSV upload completed in ${tookMs}ms ${JSON.stringify(stats)}`
          );

          const [eventType, event] = createAssetCriticalityProcessedFileEvent({
            startTime: start,
            endTime: end,
            result: stats,
          });

          telemetry.reportEvent(eventType, event);

          return response.ok({ body: result });
        } catch (e) {
          logger.error(`Error during asset criticality csv V2 upload: ${e}`);
          try {
            const end = new Date();

            const [eventType, event] = createAssetCriticalityProcessedFileEvent({
              startTime: start,
              endTime: end,
            });

            telemetry.reportEvent(eventType, event);
          } catch (error) {
            logger.error(`Error reporting telemetry event: ${error}`);
          }

          const error = transformError(e);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};
