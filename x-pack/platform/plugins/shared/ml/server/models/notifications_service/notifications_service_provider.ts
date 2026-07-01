/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import type { NotificationItem, NotificationSource } from '@kbn/ml-common-types/notifications';
import type {
  MlNotificationMessageLevel,
  NotificationsCountResponse,
  NotificationsSearchResponse,
} from '@kbn/ml-common-types/notifications';
import type { MlFeatures } from '../../../common/constants/app';
import type { MLSavedObjectService } from '../../saved_objects';
import { ML_NOTIFICATION_INDEX_PATTERN } from '../../../common/constants/index_patterns';
import type {
  MessagesSearchParams,
  NotificationsCountParams,
} from '../../routes/schemas/notifications_schema';
import type { ServerlessInfo } from '../../types';
import { DEFAULT_ML_PROJECT_ROUTING } from '../../../common/constants/cps';

const MAX_NOTIFICATIONS_SIZE = 10000;

interface EntityIdsPerType {
  type: 'anomaly_detector' | 'data_frame_analytics' | 'inference' | 'system';
  ids?: Array<string | null>;
}

export class NotificationsService {
  constructor(
    private readonly scopedClusterClient: IScopedClusterClient,
    private readonly mlSavedObjectService: MLSavedObjectService,
    private readonly enabledFeatures: MlFeatures,
    private readonly serverless: ServerlessInfo
  ) {}

  private getDefaultCountResponse() {
    return {
      error: 0,
      warning: 0,
      info: 0,
    } as NotificationsCountResponse;
  }

  /**
   * Provides entity IDs per type for the current space.
   * @internal
   */
  private async _getEntityIdsPerType() {
    const [adJobIds, dfaJobIds, modelIds] = await Promise.all([
      this.enabledFeatures.ad ? this.mlSavedObjectService.getAnomalyDetectionJobIds() : [],
      this.enabledFeatures.dfa ? this.mlSavedObjectService.getDataFrameAnalyticsJobIds() : [],
      this.enabledFeatures.nlp ? this.mlSavedObjectService.getTrainedModelsIds() : [],
    ]);
    const idsPerType: EntityIdsPerType[] = [{ type: 'system' }];

    if (this.enabledFeatures.ad) {
      idsPerType.push({ type: 'anomaly_detector', ids: adJobIds });
    }
    if (this.enabledFeatures.dfa) {
      idsPerType.push({ type: 'data_frame_analytics', ids: dfaJobIds });
    }
    if (this.enabledFeatures.nlp) {
      idsPerType.push({ type: 'inference', ids: modelIds as string[] });
    }

    return idsPerType.filter((v) => v.ids === undefined || v.ids.length > 0);
  }

  /**
   * Searches notifications based on the criteria.
   *
   * {@link ML_NOTIFICATION_INDEX_PATTERN} uses job_id field for all types of entities,
   * e.g. anomaly_detector, data_frame_analytics jobs and inference models, hence
   * to make sure the results are space aware, we have to perform separate requests
   * for each type of entities.
   *
   */
  async searchMessages(params: MessagesSearchParams) {
    const entityIdsPerType = await this._getEntityIdsPerType();

    const results = await Promise.all(
      entityIdsPerType.map(async (v) => {
        const responseBody =
          await this.scopedClusterClient.asInternalUser.search<NotificationSource>(
            {
              index: ML_NOTIFICATION_INDEX_PATTERN,
              ignore_unavailable: true,
              from: 0,
              size: MAX_NOTIFICATIONS_SIZE,
              sort: [{ [params.sortField]: { order: params.sortDirection } }],
              query: {
                bool: {
                  ...(params.queryString
                    ? {
                        must: [
                          {
                            query_string: {
                              query: params.queryString,
                              default_field: 'message',
                            },
                          },
                        ],
                      }
                    : {}),
                  filter: [
                    ...(v.ids
                      ? [
                          {
                            terms: {
                              job_id: v.ids as string[],
                            },
                          },
                        ]
                      : []),
                    {
                      term: {
                        job_type: {
                          value: v.type,
                        },
                      },
                    },
                    ...(params.earliest || params.latest
                      ? [
                          {
                            range: {
                              timestamp: {
                                ...(params.earliest ? { gt: params.earliest } : {}),
                                ...(params.latest ? { lte: params.latest } : {}),
                              },
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
              ...(this.serverless.isServerless && this.serverless.cpsEnabled
                ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
                : {}),
            },
            { maxRetries: 0 }
          );

        return {
          total: (responseBody.hits.total as estypes.SearchTotalHits).value,
          results: responseBody.hits.hits.map((result) => {
            return {
              ...result._source,
              id: result._id,
            };
          }),
        } as NotificationsSearchResponse;
      })
    );

    const response = results.reduce(
      (acc, curr) => {
        acc.total += curr.total;
        acc.results = acc.results.concat(curr.results);
        return acc;
      },
      { total: 0, results: [] }
    );

    function getSortCallback(
      sortField: keyof NotificationItem,
      sortDirection: 'asc' | 'desc'
    ): (a: NotificationItem, b: NotificationItem) => number {
      switch (sortField) {
        case 'timestamp':
          if (sortDirection === 'asc') {
            return (a, b) => a.timestamp - b.timestamp;
          } else {
            return (a, b) => b.timestamp - a.timestamp;
          }
        case 'level':
          if (sortDirection === 'asc') {
            const levelOrder: Record<NotificationSource['level'], number> = {
              error: 0,
              warning: 1,
              info: 2,
            };
            return (a, b) => levelOrder[b.level] - levelOrder[a.level];
          } else {
            const levelOrder: Record<NotificationSource['level'], number> = {
              error: 2,
              warning: 1,
              info: 0,
            };
            return (a, b) => levelOrder[b.level] - levelOrder[a.level];
          }
        default:
          if (sortDirection === 'asc') {
            return (a, b) => (a[sortField] ?? '').localeCompare(b[sortField]);
          } else {
            return (a, b) => (b[sortField] ?? '').localeCompare(a[sortField]);
          }
      }
    }

    response.results = response.results.sort(
      getSortCallback(params.sortField, params.sortDirection)
    );

    return response;
  }

  /**
   * Provides a number of messages by level.
   */
  async countMessages(params: NotificationsCountParams): Promise<NotificationsCountResponse> {
    const entityIdsPerType = await this._getEntityIdsPerType();

    const res = await Promise.all(
      entityIdsPerType.map(async (v) => {
        const responseBody = await this.scopedClusterClient.asInternalUser.search({
          size: 0,
          index: ML_NOTIFICATION_INDEX_PATTERN,
          query: {
            bool: {
              filter: [
                ...(v.ids
                  ? [
                      {
                        terms: {
                          job_id: v.ids as string[],
                        },
                      },
                    ]
                  : []),
                {
                  term: {
                    job_type: {
                      value: v.type,
                    },
                  },
                },
                {
                  range: {
                    timestamp: {
                      gt: params.lastCheckedAt,
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            by_level: {
              terms: { field: 'level' },
            },
          },
          ...(this.serverless.isServerless && this.serverless.cpsEnabled
            ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
            : {}),
        });

        if (!responseBody.aggregations) {
          return this.getDefaultCountResponse();
        }

        const byLevel = responseBody.aggregations
          .by_level as estypes.AggregationsMultiBucketAggregateBase<estypes.AggregationsStringTermsBucketKeys>;

        return Array.isArray(byLevel.buckets)
          ? byLevel.buckets.reduce((acc, curr) => {
              acc[curr.key as MlNotificationMessageLevel] = curr.doc_count;
              return acc;
            }, {} as NotificationsCountResponse)
          : ({} as NotificationsCountResponse);
      })
    );

    return res.reduce((acc, curr) => {
      for (const levelKey in curr) {
        if (Object.hasOwn(curr, levelKey)) {
          acc[levelKey as MlNotificationMessageLevel] +=
            curr[levelKey as MlNotificationMessageLevel];
        }
      }
      return acc;
    }, this.getDefaultCountResponse());
  }
}
