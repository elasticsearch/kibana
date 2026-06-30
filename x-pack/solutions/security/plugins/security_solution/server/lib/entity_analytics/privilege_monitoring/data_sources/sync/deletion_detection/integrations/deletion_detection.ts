/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';

import type { estypes } from 'elasticsearch-8.x';

type ErrorCause = estypes.ErrorCause;
import type { MonitoringEntitySource } from '../../../../../../../../common/api/entity_analytics';
import type { PrivilegeMonitoringDataClient } from '../../../../engine/data_client';
import { createSyncMarkersService } from '../../sync_markers';
import { findStaleUsersFactory } from '../stale_users';
import { createBulkUtilsService } from '../../../bulk';
import { getErrorFromBulkResponse } from '../../utils';
import { buildFindUsersSearchBodyWithTimeStamps, getAllUserNamesInAggregation } from '../queries';
import { DEFAULT_COMPOSITE_PAGE_SIZE } from '../constants';
import { timeStampsAreValid } from './utils';

export const createDeletionDetectionService = (
  dataClient: PrivilegeMonitoringDataClient,
  soClient: SavedObjectsClientContract
) => {
  const esClient = dataClient.deps.clusterClient.asCurrentUser;

  const syncMarkerService = createSyncMarkersService(dataClient, soClient);
  const bulkUtilsService = createBulkUtilsService(dataClient);

  const findStaleUsers = findStaleUsersFactory(dataClient);

  const deletionDetection = async (source: MonitoringEntitySource) => {
    const doFullSync = await syncMarkerService.detectNewFullSync(source);
    const failures: ErrorCause[] = [];
    if (!doFullSync) {
      dataClient.log(
        'debug',
        `No new full sync for source ${source.id}; skipping deletion detection.`
      );
      return;
    }

    const [completedEventTimeStamp, startedEventTimeStamp] = await Promise.all([
      syncMarkerService.findLastEventMarkerInIndex(source, 'completed'),
      syncMarkerService.findLastEventMarkerInIndex(source, 'started'),
    ]);
    dataClient.log(`debug`, `Full Sync for source ${source.id}, starting deletion detection.`);
    if (
      (await timeStampsAreValid({
        completedEventTimeStamp,
        startedEventTimeStamp,
        source,
        dataClient,
      })) &&
      completedEventTimeStamp !== undefined &&
      startedEventTimeStamp !== undefined
    ) {
      // Proceed with deletion detection
      dataClient.log('debug', `Full sync detected for ${source.id}. Running deletion detection...`);
      // get all users in the integrations docs between the two timestamps
      const allIntegrationsUserNames = await getAllUserNamesInAggregation({
        dataClient,
        indexPattern: source.indexPattern,
        buildQuery: ({ afterKey, pageSize }) =>
          buildFindUsersSearchBodyWithTimeStamps({
            timeGte: startedEventTimeStamp,
            timeLt: completedEventTimeStamp,
            afterKey,
            pageSize,
          }),
        pageSize: DEFAULT_COMPOSITE_PAGE_SIZE,
      });
      // get all users in the privileged index for this source that are not in integrations docs
      const staleUsers = await findStaleUsers(
        source.id,
        allIntegrationsUserNames,
        'entity_analytics_integration'
      );

      if (staleUsers.length === 0) {
        dataClient.log('debug', `No stale users to soft delete for source ${source.id}`);
        return;
      }
      const ops = bulkUtilsService.bulkSoftDeleteOperations(
        staleUsers,
        dataClient.index,
        'entity_analytics_integration'
      );
      try {
        // soft delete the users
        const resp = await esClient.bulk({ body: ops, refresh: 'wait_for' });
        failures.push(...getErrorFromBulkResponse(resp));
      } catch (error) {
        dataClient.log('error', `Error executing bulk operations: ${error}`);
      }
      if (failures.length > 0) {
        dataClient.log(
          'error',
          `${failures.length} errors soft deleting users with bulk operations.
          The first error is: ${JSON.stringify(failures[0])}`
        );
      }
    }
  };

  return { deletionDetection };
};
