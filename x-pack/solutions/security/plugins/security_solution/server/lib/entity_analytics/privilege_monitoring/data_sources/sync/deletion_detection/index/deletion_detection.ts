/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { estypes } from 'elasticsearch-8.x';

type ErrorCause = estypes.ErrorCause;
import type { MonitoringEntitySource } from '../../../../../../../../common/api/entity_analytics/monitoring/monitoring_entity_source/monitoring_entity_source.gen';
import type { PrivilegeMonitoringDataClient } from '../../../../engine/data_client';
import { buildFindUsersSearchBody, getAllUserNamesInAggregation } from '../queries';
import { findStaleUsersFactory } from '../stale_users';
import { createBulkUtilsService } from '../../../bulk';
import { getErrorFromBulkResponse } from '../../utils';
import { DEFAULT_COMPOSITE_PAGE_SIZE } from '../constants';

export const createIndexDeletionDetectionService = (
  dataClient: PrivilegeMonitoringDataClient,
  soClient: SavedObjectsClientContract
) => {
  const esClient = dataClient.deps.clusterClient.asCurrentUser;
  const findStaleUsers = findStaleUsersFactory(dataClient);
  const bulkUtilsService = createBulkUtilsService(dataClient);

  const deletionDetection = async (source: MonitoringEntitySource) => {
    const failures: ErrorCause[] = [];
    const allIndexUserNames = await getAllUserNamesInAggregation({
      dataClient,
      indexPattern: source.indexPattern,
      buildQuery: buildFindUsersSearchBody,
      pageSize: DEFAULT_COMPOSITE_PAGE_SIZE,
    });
    const staleUsers = await findStaleUsers(source.id, allIndexUserNames, 'index');

    if (staleUsers.length === 0) {
      dataClient.log('debug', `No stale users to soft delete for source ${source.id}`);
      return;
    }
    const ops = bulkUtilsService.bulkSoftDeleteOperations(staleUsers, dataClient.index, 'index');
    if (ops.length === 0) {
      dataClient.log('debug', `No bulk operations to execute for source ${source.id}`);
      return;
    }
    try {
      // soft delete the stale users, NOT outright delete.
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
  };

  return { deletionDetection };
};
