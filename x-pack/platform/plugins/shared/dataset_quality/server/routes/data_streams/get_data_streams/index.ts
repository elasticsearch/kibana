/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import {
  FAILURE_STORE_PRIVILEGE,
  MANAGE_FAILURE_STORE_PRIVILEGE,
} from '../../../../common/constants';
import { streamPartsToIndexPattern } from '../../../../common/utils';
import type { DataStreamType } from '../../../../common/types';
import { dataStreamService, datasetQualityPrivileges } from '../../../services';

export async function getDataStreams(options: {
  esClient: ElasticsearchClient;
  types?: DataStreamType[];
  datasetQuery?: string;
  uncategorisedOnly?: boolean;
  isSecurityEnabled: boolean;
}) {
  const { esClient, types = [], datasetQuery, uncategorisedOnly, isSecurityEnabled } = options;

  const datasetNames = datasetQuery
    ? [datasetQuery]
    : types.map((type) =>
        streamPartsToIndexPattern({
          typePattern: type,
          datasetPattern: '*-*',
        })
      );

  const datasetUserPrivileges = await datasetQualityPrivileges.getDatasetPrivileges(
    esClient,
    datasetNames,
    isSecurityEnabled
  );

  const allDataStreams = await dataStreamService.getMatchingDataStreams(
    esClient,
    datasetNames.join(',')
  );

  const filteredDataStreams = uncategorisedOnly
    ? allDataStreams.filter((stream) => {
        return !stream._meta || !stream._meta.managed_by || stream._meta.managed_by !== 'fleet';
      })
    : allDataStreams;

  const dataStreamsPrivileges = filteredDataStreams.length
    ? await datasetQualityPrivileges.getHasIndexPrivileges(
        esClient,
        filteredDataStreams.map(({ name }) => name),
        ['monitor', FAILURE_STORE_PRIVILEGE, MANAGE_FAILURE_STORE_PRIVILEGE],
        isSecurityEnabled
      )
    : {};

  const mappedDataStreams = filteredDataStreams.map((dataStream) => {
    // @ts-expect-error
    const failureStoreLifecycle = dataStream.failure_store?.lifecycle;
    return {
      name: dataStream.name,
      integration: dataStream._meta?.package?.name,
      // @ts-expect-error
      lastActivity: dataStream.maximum_timestamp,
      userPrivileges: {
        canMonitor: dataStreamsPrivileges[dataStream.name]?.monitor,
        canReadFailureStore: dataStreamsPrivileges[dataStream.name]?.[FAILURE_STORE_PRIVILEGE],
        canManageFailureStore:
          dataStreamsPrivileges[dataStream.name]?.[MANAGE_FAILURE_STORE_PRIVILEGE],
      },
      hasFailureStore: dataStream.failure_store?.enabled,
      customRetentionPeriod: failureStoreLifecycle?.data_retention,
      defaultRetentionPeriod:
        failureStoreLifecycle?.retention_determined_by === 'default_failures_retention'
          ? failureStoreLifecycle?.effective_retention
          : undefined,
    };
  });

  return {
    dataStreams: mappedDataStreams,
    datasetUserPrivileges,
  };
}

export async function getDatasetTypesPrivileges(options: {
  esClient: ElasticsearchClient;
  types: DataStreamType[];
  isSecurityEnabled: boolean;
}) {
  const { esClient, types, isSecurityEnabled } = options;

  const datasetNames = types.map((type) =>
    streamPartsToIndexPattern({
      typePattern: type,
      datasetPattern: '*-*',
    })
  );

  const { datasetsPrivilages } = await datasetQualityPrivileges.getDatasetPrivileges(
    esClient,
    datasetNames,
    isSecurityEnabled
  );

  return {
    datasetsPrivilages,
  };
}
