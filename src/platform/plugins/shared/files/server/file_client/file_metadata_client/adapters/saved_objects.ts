/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { reduce } from 'lodash';
import type { Logger } from '@kbn/core/server';
import type {
  SavedObjectsClientContract,
  ISavedObjectsRepository,
  SavedObjectsOpenPointInTimeResponse,
} from '@kbn/core-saved-objects-api-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-api-server';
import type { AggregationsSumAggregate } from '@elastic/elasticsearch/lib/api/types';

import type { FindFileArgs } from '../../../file_service/file_action_types';
import { ES_FIXED_SIZE_INDEX_BLOB_STORE } from '../../../../common/constants';
import type { FileMetadata, FilesMetrics, FileStatus } from '../../../../common/types';
import type {
  FileMetadataClient,
  UpdateArgs,
  GetArg,
  BulkGetArg,
  FileDescriptor,
  GetUsageMetricsArgs,
} from '../file_metadata_client';

import { filterArgsToKuery } from './query_filters';

interface TermsAgg {
  buckets: Array<{ key: string; doc_count: number }>;
}
interface FilesMetricsAggs {
  bytesUsed: AggregationsSumAggregate;
  status: TermsAgg;
  extension: TermsAgg;
}

export class SavedObjectsFileMetadataClient implements FileMetadataClient {
  constructor(
    private readonly soType: string,
    private readonly soClient: SavedObjectsClientContract | ISavedObjectsRepository,
    private readonly logger: Logger
  ) {}

  async create({ id, metadata }: FileDescriptor): Promise<FileDescriptor> {
    const result = await this.soClient.create(this.soType, metadata, { id });
    return { id: result.id, metadata: result.attributes };
  }
  async update({ id, metadata }: UpdateArgs): Promise<FileDescriptor> {
    const result = await this.soClient.update(this.soType, id, metadata);
    return {
      id: result.id,
      metadata: result.attributes as FileDescriptor['metadata'],
    };
  }

  async get({ id }: GetArg): Promise<FileDescriptor> {
    const result = await this.soClient.get(this.soType, id);
    return {
      id: result.id,
      metadata: result.attributes as FileDescriptor['metadata'],
    };
  }

  async bulkGet(arg: { ids: string[]; throwIfNotFound?: true }): Promise<FileDescriptor[]>;
  async bulkGet({ ids, throwIfNotFound }: BulkGetArg): Promise<Array<FileDescriptor | null>> {
    const result = await this.soClient.bulkGet(ids.map((id) => ({ id, type: this.soType })));
    return result.saved_objects.map((so) => {
      if (isSavedObjectErrorResult(so)) {
        if (throwIfNotFound) {
          throw new Error(`File [${so.id}] not found`);
        }
        return null;
      }

      return {
        id: so.id,
        metadata: so.attributes as FileDescriptor['metadata'],
      };
    });
  }

  async find({ page, perPage, ...filterArgs }: FindFileArgs = {}): Promise<{
    total: number;
    files: Array<FileDescriptor<unknown>>;
  }> {
    const result = await this.soClient.find({
      type: this.soType,
      filter: filterArgsToKuery({ ...filterArgs, attrPrefix: `${this.soType}.attributes` }),
      page,
      perPage,
      sortOrder: 'desc',
      sortField: 'created',
    });
    return {
      files: result.saved_objects.map((so) => ({
        id: so.id,
        metadata: so.attributes as FileMetadata,
      })),
      total: result.total,
    };
  }

  async delete({ id }: { id: string }): Promise<void> {
    await this.soClient.delete(this.soType, id);
  }

  async getUsageMetrics({
    esFixedSizeIndex: { capacity },
  }: GetUsageMetricsArgs): Promise<FilesMetrics> {
    let pit: undefined | SavedObjectsOpenPointInTimeResponse;
    try {
      pit = await this.soClient.openPointInTimeForType(this.soType);
      const { aggregations } = await this.soClient.find<FileMetadata, FilesMetricsAggs>({
        type: this.soType,
        pit,
        aggs: {
          bytesUsed: {
            sum: {
              field: `${this.soType}.attributes.size`,
            },
          },
          status: {
            terms: {
              field: `${this.soType}.attributes.Status`,
            },
          },
          extension: {
            terms: {
              field: `${this.soType}.attributes.extension`,
            },
          },
        },
      });

      if (aggregations) {
        const used = aggregations.bytesUsed!.value!;
        return {
          storage: {
            [ES_FIXED_SIZE_INDEX_BLOB_STORE]: {
              capacity,
              available: capacity - used,
              used,
            },
          },
          countByExtension: reduce(
            aggregations.extension.buckets,
            (acc, { key, doc_count: docCount }) => ({ ...acc, [key]: docCount }),
            {}
          ),
          countByStatus: reduce(
            aggregations.status.buckets,
            (acc, { key, doc_count: docCount }) => ({ ...acc, [key]: docCount }),
            {} as Record<FileStatus, number>
          ),
        };
      }

      throw new Error('Could not retrieve usage metrics');
    } finally {
      if (pit) {
        await this.soClient.closePointInTime(pit.id).catch(this.logger.error.bind(this.logger));
      }
    }
  }
}
