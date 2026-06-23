/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { errors } from '@elastic/elasticsearch';

import type { PackageDataStreamTypes } from '../../../../common/types';
import { VALID_DATA_STREAM_TYPES } from '../../../../common/services';
import { dataStreamService } from '../../data_streams';
import { FleetUnauthorizedError } from '../../../errors';

export async function getDataStreams(options: {
  esClient: ElasticsearchClient;
  type?: PackageDataStreamTypes;
  datasetQuery?: string;
  sortOrder: 'asc' | 'desc';
  uncategorisedOnly: boolean;
}) {
  const { esClient, type, datasetQuery, uncategorisedOnly, sortOrder } = options;

  const allDataStreams = await dataStreamService
    .getMatchingDataStreams(esClient, {
      type: type ? type : '*',
      dataset: datasetQuery ? `*${datasetQuery}*` : '*',
    })
    .catch((err) => {
      const isResponseError = err instanceof errors.ResponseError;
      if (isResponseError && err?.body?.error?.type === 'security_exception') {
        throw new FleetUnauthorizedError(`Unauthorized to query datastreams: ${err.message}`);
      }
      throw err;
    });

  let filteredDataStreams = uncategorisedOnly
    ? allDataStreams.filter((stream) => {
        return !stream._meta || !stream._meta.managed_by || stream._meta.managed_by !== 'fleet';
      })
    : allDataStreams;

  filteredDataStreams = filteredDataStreams.filter((stream) => {
    const isValidStreamType = VALID_DATA_STREAM_TYPES.some((streamType) =>
      stream.name.startsWith(streamType)
    );

    return isValidStreamType;
  });

  const mappedDataStreams = filteredDataStreams.map((dataStream) => {
    return { name: dataStream.name };
  });

  const sortedDataStreams = mappedDataStreams.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const dataStreams = sortOrder === 'asc' ? sortedDataStreams : sortedDataStreams.reverse();

  return {
    items: dataStreams,
  };
}
