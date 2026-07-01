/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { each, get } from 'lodash';
import type { IScopedClusterClient } from '@kbn/core/server';

import type { estypes } from '@elastic/elasticsearch';
import { ML_PARTITION_FIELDS } from '@kbn/ml-anomaly-utils';

import type { Annotation, Annotations } from '@kbn/ml-common-types/annotations';
import {
  isAnnotation,
  isAnnotations,
  getAnnotationFieldName,
  getAnnotationFieldValue,
} from '@kbn/ml-common-types/annotations';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { ServerlessInfo } from '../../types';
import {
  ML_ANNOTATIONS_INDEX_ALIAS_READ,
  ML_ANNOTATIONS_INDEX_ALIAS_WRITE,
} from '../../../common/constants/index_patterns';
import { ANNOTATION_EVENT_USER, ANNOTATION_TYPE } from '../../../common/constants/annotations';
import { DEFAULT_ML_PROJECT_ROUTING } from '../../../common/constants/cps';

// TODO All of the following interface/type definitions should
// eventually be replaced by the proper upstream definitions
interface EsResult {
  _source: Annotation;
  _id: string;
}

export interface IndexAnnotationArgs {
  jobIds: string[];
  earliestMs: number | null;
  latestMs: number | null;
  maxAnnotations: number;
  detectorIndex?: number;
  entities?: any[];
  event?: Annotation['event'];
}

export interface GetResponse {
  success: true;
  annotations: Record<JobId, Annotations>;
  totalCount: number;
}

export interface IndexParams {
  index: string;
  body: Annotation;
  refresh: boolean | 'wait_for' | undefined;
  require_alias?: boolean;
  id?: string;
}

export interface DeleteParams {
  index: string;
  refresh: boolean | 'wait_for' | undefined;
  id: string;
}

export interface AggByJob {
  key: string;
  doc_count: number;
  latest_delayed: Pick<estypes.SearchResponse<Annotation>, 'hits'>;
}

export function annotationProvider(
  { asInternalUser }: IScopedClusterClient,
  serverless: ServerlessInfo
) {
  // Find the index the annotation is stored in.
  async function fetchAnnotationIndex(id: string) {
    const searchParams: estypes.SearchRequest = {
      index: ML_ANNOTATIONS_INDEX_ALIAS_READ,
      size: 1,
      query: {
        ids: {
          values: [id],
        },
      },
    };

    const body = await asInternalUser.search(searchParams, { maxRetries: 0 });
    const totalCount =
      typeof body.hits.total === 'number' ? body.hits.total : body.hits.total!.value;

    if (totalCount === 0) {
      throw Boom.notFound(`Cannot find annotation with ID ${id}`);
    }

    return body.hits.hits[0]._index;
  }

  async function indexAnnotation(annotation: Annotation, username: string) {
    if (isAnnotation(annotation) === false) {
      // No need to translate, this will not be exposed in the UI.
      return Promise.reject(new Error('invalid annotation format'));
    }

    if (annotation.create_time === undefined) {
      annotation.create_time = new Date().getTime();
      annotation.create_username = username;
    }

    annotation.modified_time = new Date().getTime();
    annotation.modified_username = username;

    const params: IndexParams = {
      index: ML_ANNOTATIONS_INDEX_ALIAS_WRITE,
      body: annotation,
      refresh: 'wait_for',
      require_alias: true,
      ...(serverless.isServerless && serverless.cpsEnabled
        ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
        : {}),
    };

    if (typeof annotation._id !== 'undefined') {
      params.id = annotation._id;
      params.index = await fetchAnnotationIndex(annotation._id);
      params.require_alias = false;
      delete params.body._id;
      delete params.body.key;
    }

    return await asInternalUser.index(params, { maxRetries: 0 });
  }

  async function getAnnotations({
    jobIds,
    earliestMs,
    latestMs,
    maxAnnotations,
    detectorIndex,
    entities,
    event,
  }: IndexAnnotationArgs): Promise<GetResponse> {
    const obj: GetResponse = {
      success: true,
      annotations: {},
      totalCount: 0,
    };

    const boolCriteria: object[] = [];

    // Build the criteria to use in the bool filter part of the request.
    // Adds criteria for the time range plus any specified job IDs.
    // The nested must_not time range filter queries make sure that we fetch:
    // - annotations with start and end within the time range
    // - annotations that either start or end within the time range
    // - annotations that start before and end after the given time range
    // - but skip annotation that are completely outside the time range
    //   (the ones that start and end before or after the time range)
    if (earliestMs !== null && latestMs !== null) {
      boolCriteria.push({
        bool: {
          must_not: [
            {
              bool: {
                filter: [
                  {
                    range: {
                      timestamp: {
                        lte: earliestMs,
                        format: 'epoch_millis',
                      },
                    },
                  },
                  {
                    range: {
                      end_timestamp: {
                        lte: earliestMs,
                        format: 'epoch_millis',
                      },
                    },
                  },
                ],
              },
            },
            {
              bool: {
                filter: [
                  {
                    range: {
                      timestamp: {
                        gte: latestMs,
                        format: 'epoch_millis',
                      },
                    },
                  },
                  {
                    range: {
                      end_timestamp: {
                        gte: latestMs,
                        format: 'epoch_millis',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    boolCriteria.push({
      exists: { field: 'annotation' },
    });

    if (event) {
      boolCriteria.push({
        term: { event },
      });
    }

    if (jobIds && jobIds.length > 0 && !(jobIds.length === 1 && jobIds[0] === '*')) {
      let jobIdFilterStr = '';
      each(jobIds, (jobId, i: number) => {
        jobIdFilterStr += `${i! > 0 ? ' OR ' : ''}job_id:${jobId}`;
      });
      boolCriteria.push({
        query_string: {
          analyze_wildcard: false,
          query: jobIdFilterStr,
        },
      });
    }

    // Build should clause to further query for annotations in SMV
    // we want to show either the exact match with detector index and by/over/partition fields
    // OR annotations without any partition fields defined
    let shouldClauses;
    if (detectorIndex !== undefined && Array.isArray(entities)) {
      // build clause to get exact match of detector index and by/over/partition fields
      const beExactMatch = [];
      beExactMatch.push({
        term: {
          detector_index: detectorIndex,
        },
      });

      entities.forEach(({ fieldName, fieldType, fieldValue }) => {
        beExactMatch.push({
          term: {
            [getAnnotationFieldName(fieldType)]: fieldName,
          },
        });
        beExactMatch.push({
          term: {
            [getAnnotationFieldValue(fieldType)]: fieldValue,
          },
        });
      });

      // clause to get annotations that have no partition fields
      const haveAnyPartitionFields: object[] = [];
      ML_PARTITION_FIELDS.forEach((field) => {
        haveAnyPartitionFields.push({
          exists: {
            field: getAnnotationFieldName(field),
          },
        });
        haveAnyPartitionFields.push({
          exists: {
            field: getAnnotationFieldValue(field),
          },
        });
      });
      shouldClauses = [
        { bool: { must_not: haveAnyPartitionFields } },
        { bool: { must: beExactMatch } },
      ];
    }

    const params: estypes.SearchRequest = {
      index: ML_ANNOTATIONS_INDEX_ALIAS_READ,
      size: maxAnnotations,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            {
              query_string: {
                query: `type:${ANNOTATION_TYPE.ANNOTATION}`,
                analyze_wildcard: false,
              },
            },
            {
              bool: {
                must: boolCriteria,
              },
            },
          ],
          ...(shouldClauses ? { should: shouldClauses, minimum_should_match: 1 } : {}),
        },
      },
      ...(serverless.isServerless && serverless.cpsEnabled
        ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
        : {}),
    };

    try {
      const body = await asInternalUser.search(params, { maxRetries: 0 });

      // @ts-expect-error TODO fix search response types
      if (body.error !== undefined && body.message !== undefined) {
        // No need to translate, this will not be exposed in the UI.
        throw new Error(`Annotations couldn't be retrieved from Elasticsearch.`);
      }

      // @ts-expect-error incorrect search response type
      obj.totalCount = body.hits.total.value;

      // @ts-expect-error TODO fix search response types
      const docs: Annotations = get(body, ['hits', 'hits'], []).map((d: EsResult) => {
        // get the original source document and the document id, we need it
        // to identify the annotation when editing/deleting it.
        // if original `event` is undefined then substitute with 'user` by default
        // since annotation was probably generated by user on the UI
        return {
          ...d._source,
          event: d._source?.event ?? ANNOTATION_EVENT_USER,
          _id: d._id,
        } as Annotation;
      });

      if (isAnnotations(docs) === false) {
        // No need to translate, this will not be exposed in the UI.
        throw new Error(`Annotations didn't pass integrity check.`);
      }

      docs.forEach((doc: Annotation) => {
        const jobId = doc.job_id;
        if (typeof obj.annotations[jobId] === 'undefined') {
          obj.annotations[jobId] = [];
        }
        obj.annotations[jobId].push(doc);
      });

      return obj;
    } catch (error) {
      throw Boom.badRequest(error);
    }
  }

  /**
   * Fetches the latest delayed data annotation per job.
   * @param jobIds
   * @param earliestMs - Timestamp for the end_timestamp range query.
   */
  async function getDelayedDataAnnotations({
    jobIds,
    earliestMs,
  }: {
    jobIds: string[];
    earliestMs?: number;
  }): Promise<Annotation[]> {
    const params: estypes.SearchRequest = {
      index: ML_ANNOTATIONS_INDEX_ALIAS_READ,
      size: 0,
      query: {
        bool: {
          filter: [
            ...(earliestMs ? [{ range: { end_timestamp: { gte: earliestMs } } }] : []),
            {
              term: { event: { value: 'delayed_data' } },
            },
            { terms: { job_id: jobIds } },
          ],
        },
      },
      aggs: {
        by_job: {
          terms: { field: 'job_id', size: jobIds.length },
          aggs: {
            latest_delayed: {
              top_hits: {
                size: 1,
                sort: [
                  {
                    end_timestamp: {
                      order: 'desc',
                    },
                  },
                ],
              },
            },
          },
        },
      },
      ...(serverless.isServerless && serverless.cpsEnabled
        ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
        : {}),
    };

    const body = await asInternalUser.search<Annotation>(params, { maxRetries: 0 });

    const annotations = (
      (body.aggregations!.by_job as estypes.AggregationsTermsAggregateBase<AggByJob>)
        .buckets as AggByJob[]
    ).map((bucket) => {
      return bucket.latest_delayed.hits.hits[0]._source!;
    });

    return annotations;
  }

  async function deleteAnnotation(id: string) {
    const index = await fetchAnnotationIndex(id);

    const deleteParams: DeleteParams = {
      index,
      id,
      refresh: 'wait_for',
      ...(serverless.isServerless && serverless.cpsEnabled
        ? { project_routing: DEFAULT_ML_PROJECT_ROUTING }
        : {}),
    };

    return await asInternalUser.delete(deleteParams);
  }

  return {
    getAnnotations,
    indexAnnotation,
    deleteAnnotation,
    getDelayedDataAnnotations,
  };
}

export type AnnotationService = ReturnType<typeof annotationProvider>;
