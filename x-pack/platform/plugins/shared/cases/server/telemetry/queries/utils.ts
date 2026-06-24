/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import type { KueryNode } from '@kbn/es-query';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  FILE_ATTACHMENT_TYPE,
  LEGACY_FILE_ATTACHMENT_TYPE,
  MAX_OBSERVABLES_PER_CASE,
} from '../../../common/constants';
import {
  AUTO_EXTRACT_OBSERVABLE_DESCRIPTION,
  OBSERVABLE_TYPES_BUILTIN_KEYS,
} from '../../../common/constants/observables';
import type {
  CaseAggregationResult,
  Buckets,
  MaxBucketOnCaseAggregation,
  SolutionTelemetry,
  AttachmentFramework,
  AttachmentAggregationResult,
  BucketsWithMaxOnCase,
  AttachmentStats,
  FileAttachmentStats,
  FileAttachmentAggregationResults,
  FileAttachmentAggsResult,
  AttachmentFrameworkAggsResult,
  CustomFieldsTelemetry,
  AlertBuckets,
  CasesTelemetryWithAlertsAggsByOwnerResults,
  ObservablesAggregationResult,
  ObservablesTelemetry,
  TotalWithMaxObservablesAggregationResult,
} from '../types';
import { buildFilter } from '../../client/utils';
import type { Owner } from '../../../common/constants/types';
import type { ConfigurationPersistedAttributes } from '../../common/types/configure';
import type { TelemetrySavedObjectsClient } from '../telemetry_saved_objects_client';
import { CasePersistedStatus } from '../../common/types/case';

export const getCountsAggregationQuery = (savedObjectType: string) => ({
  counts: {
    date_range: {
      field: `${savedObjectType}.attributes.created_at`,
      format: 'dd/MM/yyyy',
      ranges: [
        { from: 'now-1d', to: 'now' },
        { from: 'now-1w', to: 'now' },
        { from: 'now-1M', to: 'now' },
      ],
    },
  },
});

export const getAlertsCountsAggregationQuery = () => ({
  counts: {
    date_range: {
      field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.created_at`,
      format: 'dd/MM/yyyy',
      ranges: [
        { from: 'now-1d', to: 'now' },
        { from: 'now-1w', to: 'now' },
        { from: 'now-1M', to: 'now' },
      ],
    },
    aggregations: {
      topAlertsPerBucket: {
        cardinality: {
          field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.alertId`,
        },
      },
    },
  },
});

export const getMaxBucketOnCaseAggregationQuery = (savedObjectType: string) => ({
  references: {
    nested: {
      path: `${savedObjectType}.references`,
    },
    aggregations: {
      cases: {
        filter: {
          term: {
            [`${savedObjectType}.references.type`]: CASE_SAVED_OBJECT,
          },
        },
        aggregations: {
          ids: {
            terms: {
              field: `${savedObjectType}.references.id`,
            },
          },
          max: {
            max_bucket: {
              buckets_path: 'ids._count',
            },
          },
        },
      },
    },
  },
});

export const getAlertsMaxBucketOnCaseAggregationQuery = () => ({
  references: {
    nested: {
      path: `${CASE_COMMENT_SAVED_OBJECT}.references`,
    },
    aggregations: {
      cases: {
        filter: {
          term: {
            [`${CASE_COMMENT_SAVED_OBJECT}.references.type`]: CASE_SAVED_OBJECT,
          },
        },
        aggregations: {
          ids: {
            terms: {
              field: `${CASE_COMMENT_SAVED_OBJECT}.references.id`,
            },
            aggregations: {
              reverse: {
                reverse_nested: {},
                aggregations: {
                  topAlerts: {
                    cardinality: {
                      field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.alertId`,
                    },
                  },
                },
              },
            },
          },
          max: {
            max_bucket: {
              buckets_path: 'ids>reverse.topAlerts',
            },
          },
        },
      },
    },
  },
});

export const getUniqueAlertCommentsCountQuery = () => ({
  uniqueAlertCommentsCount: {
    cardinality: {
      field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.alertId`,
    },
  },
});

export const getReferencesAggregationQuery = ({
  savedObjectType,
  referenceType,
  agg = 'terms',
}: {
  savedObjectType: string;
  referenceType: string;
  agg?: string;
}) => ({
  references: {
    nested: {
      path: `${savedObjectType}.references`,
    },
    aggregations: {
      referenceType: {
        filter: {
          term: {
            [`${savedObjectType}.references.type`]: referenceType,
          },
        },
        aggregations: {
          referenceAgg: {
            [agg]: {
              field: `${savedObjectType}.references.id`,
            },
          },
        },
      },
    },
  },
});

export const getConnectorsCardinalityAggregationQuery = () =>
  getReferencesAggregationQuery({
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
    referenceType: 'action',
    agg: 'cardinality',
  });

export const getCountsFromBuckets = (buckets: Buckets['buckets']) => ({
  daily: buckets?.[2]?.doc_count ?? 0,
  weekly: buckets?.[1]?.doc_count ?? 0,
  monthly: buckets?.[0]?.doc_count ?? 0,
});

export const getAlertsCountsFromBuckets = (buckets: AlertBuckets['buckets']) => ({
  daily: buckets?.[2]?.topAlertsPerBucket?.value ?? 0,
  weekly: buckets?.[1]?.topAlertsPerBucket?.value ?? 0,
  monthly: buckets?.[0]?.topAlertsPerBucket?.value ?? 0,
});

export const getObservablesTotalsByType = (
  observablesAggs?: ObservablesAggregationResult
): ObservablesTelemetry => {
  const result: ObservablesTelemetry = {
    manual: { default: 0, custom: 0 },
    auto: { default: 0, custom: 0 },
    total: 0,
  };

  if (!observablesAggs || !observablesAggs.byDescription?.buckets) {
    return result;
  }

  observablesAggs.byDescription.buckets.forEach((bucket) => {
    const description = bucket.key;

    bucket.byType.buckets.forEach((typeBucket) => {
      const type = OBSERVABLE_TYPES_BUILTIN_KEYS.includes(typeBucket.key) ? 'default' : 'custom';
      const count = typeBucket.doc_count;

      if (description === AUTO_EXTRACT_OBSERVABLE_DESCRIPTION) {
        result.auto[type] += count;
      } else {
        result.manual[type] += count;
      }
      result.total += count;
    });
  });
  return result;
};

export const getTotalWithMaxObservables = (
  totalWithMaxObservablesAgg?: TotalWithMaxObservablesAggregationResult['buckets']
): number => {
  if (!totalWithMaxObservablesAgg || totalWithMaxObservablesAgg.length === 0) {
    return 0;
  }

  // Sum doc_count for all buckets where key (total_observables value) >= 50
  return totalWithMaxObservablesAgg.reduce((sum, bucket) => {
    const key = typeof bucket.key === 'number' ? bucket.key : Number(bucket.key);
    return key >= MAX_OBSERVABLES_PER_CASE ? sum + (bucket.doc_count ?? 0) : sum;
  }, 0);
};

interface CountsAndMaxAlertsAggRes {
  by_owner: {
    buckets: Array<{
      key: string;
      doc_count: number;
      counts: AlertBuckets;
      references: MaxBucketOnCaseAggregation['references'];
      uniqueAlertCommentsCount: {
        value: number;
      };
    }>;
  };
}
export const getCountsAndMaxAlertsData = async ({
  savedObjectsClient,
}: {
  savedObjectsClient: TelemetrySavedObjectsClient;
}) => {
  const filter = getOnlyAlertsCommentsFilter();

  const res = await savedObjectsClient.find<unknown, CountsAndMaxAlertsAggRes>({
    page: 0,
    perPage: 0,
    filter,
    type: CASE_COMMENT_SAVED_OBJECT,
    namespaces: ['*'],
    aggs: {
      by_owner: {
        terms: {
          field: `${CASE_COMMENT_SAVED_OBJECT}.attributes.owner`,
          size: 3,
          include: ['securitySolution', 'observability', 'cases'],
        },
        aggs: {
          ...getAlertsCountsAggregationQuery(),
          ...getAlertsMaxBucketOnCaseAggregationQuery(),
          ...getUniqueAlertCommentsCountQuery(),
        },
      },
    },
  });

  const sec = getSolutionStats('securitySolution', res?.aggregations);
  const obs = getSolutionStats('observability', res?.aggregations);
  const main = getSolutionStats('cases', res?.aggregations);
  const all = getTotalStats(res?.aggregations);
  return {
    all,
    sec,
    obs,
    main,
  };
};

export const getSolutionStats = (
  owner: Owner,
  countsAndMaxAlertsAggRes?: CountsAndMaxAlertsAggRes
) => {
  const bucket = countsAndMaxAlertsAggRes?.by_owner?.buckets?.find((b) => b?.key === owner);
  if (!bucket) {
    return {
      total: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      maxOnACase: 0,
    };
  }

  return {
    total: bucket?.uniqueAlertCommentsCount?.value ?? 0,
    ...getAlertsCountsFromBuckets(bucket?.counts?.buckets ?? []),
    maxOnACase: bucket?.references?.cases?.max?.value ?? 0,
  };
};
export const getTotalStats = (countsAndMaxAlertsAggRes?: CountsAndMaxAlertsAggRes) => {
  const buckets = countsAndMaxAlertsAggRes?.by_owner?.buckets ?? [];
  return buckets.reduce(
    (acc, bucket) => {
      acc.total += bucket?.uniqueAlertCommentsCount?.value ?? 0;
      const counts = getAlertsCountsFromBuckets(bucket?.counts?.buckets ?? []);
      acc.daily += counts.daily;
      acc.weekly += counts.weekly;
      acc.monthly += counts.monthly;
      const maxCaseVal = bucket?.references?.cases?.max?.value ?? 0;
      if (maxCaseVal > acc.maxOnACase) {
        acc.maxOnACase = maxCaseVal;
      }
      return acc;
    },
    { total: 0, daily: 0, weekly: 0, monthly: 0, maxOnACase: 0 }
  );
};

export const getCountsAndMaxData = async ({
  savedObjectsClient,
  savedObjectType,
  filter,
}: {
  savedObjectsClient: TelemetrySavedObjectsClient;
  savedObjectType: string;
  filter?: KueryNode;
}) => {
  const res = await savedObjectsClient.find<
    unknown,
    {
      counts: Buckets;
      references: MaxBucketOnCaseAggregation['references'];
    }
  >({
    page: 0,
    perPage: 0,
    filter,
    type: savedObjectType,
    namespaces: ['*'],
    aggs: {
      ...getCountsAggregationQuery(savedObjectType),
      ...getMaxBucketOnCaseAggregationQuery(savedObjectType),
    },
  });

  const countsBuckets = res.aggregations?.counts?.buckets ?? [];
  const maxOnACase = res.aggregations?.references?.cases?.max?.value ?? 0;

  return {
    all: {
      total: res.total,
      ...getCountsFromBuckets(countsBuckets),
      maxOnACase,
    },
  };
};

export const getBucketFromAggregation = ({
  aggs,
  key,
}: {
  key: string;
  aggs?: Record<string, unknown>;
}): Buckets['buckets'] => (get(aggs, `${key}.buckets`) ?? []) as Buckets['buckets'];

export const getSolutionValues = ({
  caseAggregations,
  attachmentAggregations,
  filesAggregations,
  casesTotalWithAlerts,
  owner,
}: {
  caseAggregations?: CaseAggregationResult;
  attachmentAggregations?: AttachmentAggregationResult;
  filesAggregations?: FileAttachmentAggregationResults;
  casesTotalWithAlerts?: CasesTelemetryWithAlertsAggsByOwnerResults;
  owner: Owner;
}): SolutionTelemetry => {
  const aggregationsBuckets = getAggregationsBuckets({
    aggs: caseAggregations,
    keys: [
      'totalsByOwner',
      'securitySolution.counts',
      'observability.counts',
      'cases.counts',
      `${owner}.status`,
    ],
  });
  const totalCasesForOwner = findValueInBuckets(aggregationsBuckets.totalsByOwner, owner);
  const attachmentsAggsForOwner = attachmentAggregations?.[owner];
  const fileAttachmentsForOwner = filesAggregations?.[owner];
  const totalWithAlerts = processWithAlertsByOwner(casesTotalWithAlerts);
  return {
    total: totalCasesForOwner,
    ...getCountsFromBuckets(aggregationsBuckets[`${owner}.counts`]),
    status: {
      open: findValueInBuckets(aggregationsBuckets[`${owner}.status`], CasePersistedStatus.OPEN),
      inProgress: findValueInBuckets(
        aggregationsBuckets[`${owner}.status`],
        CasePersistedStatus.IN_PROGRESS
      ),
      closed: findValueInBuckets(
        aggregationsBuckets[`${owner}.status`],
        CasePersistedStatus.CLOSED
      ),
    },
    ...getAttachmentsFrameworkStats({
      attachmentAggregations: attachmentsAggsForOwner,
      filesAggregations: fileAttachmentsForOwner,
      totalCasesForOwner,
    }),
    observables: getObservablesTotalsByType(caseAggregations?.[owner]?.observables),
    totalWithMaxObservables: getTotalWithMaxObservables(
      caseAggregations?.[owner]?.totalWithMaxObservables?.buckets ?? []
    ),
    totalWithAlerts: totalWithAlerts[owner],
    assignees: {
      total: caseAggregations?.[owner].totalAssignees.value ?? 0,
      totalWithZero: caseAggregations?.[owner].assigneeFilters.buckets.zero.doc_count ?? 0,
      totalWithAtLeastOne:
        caseAggregations?.[owner].assigneeFilters.buckets.atLeastOne.doc_count ?? 0,
    },
  };
};

export const getCustomFieldsTelemetry = (
  customFields?: ConfigurationPersistedAttributes['customFields']
): CustomFieldsTelemetry => {
  const customFiledTypes: Record<string, number> = {};

  const totalsByType = customFields?.reduce((a, c) => {
    if (c?.type) {
      Object.assign(customFiledTypes, { [c.type]: (customFiledTypes[c.type] ?? 0) + 1 });
    }

    return customFiledTypes;
  }, {});

  const allRequiredCustomFields = customFields?.filter((field) => field?.required).length;

  return {
    totalsByType: totalsByType ?? {},
    totals: customFields?.length ?? 0,
    required: allRequiredCustomFields ?? 0,
  };
};

export const findValueInBuckets = (buckets: Buckets['buckets'], value: string | number): number =>
  buckets.find(({ key }) => key === value)?.doc_count ?? 0;

export const getAggregationsBuckets = ({
  aggs,
  keys,
}: {
  keys: string[];
  aggs?: Record<string, unknown>;
}) =>
  keys.reduce<Record<string, Buckets['buckets']>>((acc, key) => {
    acc[key] = getBucketFromAggregation({ aggs, key });
    return acc;
  }, {});

export const getAttachmentsFrameworkStats = ({
  attachmentAggregations,
  filesAggregations,
  totalCasesForOwner,
}: {
  attachmentAggregations?: AttachmentFrameworkAggsResult;
  filesAggregations?: FileAttachmentAggsResult;
  totalCasesForOwner: number;
}): AttachmentFramework => {
  if (!attachmentAggregations) {
    return emptyAttachmentFramework();
  }

  const averageFileSize = getAverageFileSize(filesAggregations);
  const topMimeTypes = filesAggregations?.topMimeTypes;

  return {
    attachmentFramework: {
      externalAttachments: getAttachmentRegistryStats(
        attachmentAggregations.externalReferenceTypes,
        totalCasesForOwner
      ),
      persistableAttachments: getAttachmentRegistryStats(
        attachmentAggregations.persistableReferenceTypes,
        totalCasesForOwner
      ),
      files: getFileAttachmentStats({
        registryResults: attachmentAggregations.externalReferenceTypes,
        averageFileSize,
        totalCasesForOwner,
        topMimeTypes,
      }),
    },
  };
};

const getAverageFileSize = (filesAggregations?: FileAttachmentAggsResult) => {
  if (filesAggregations?.averageSize?.value == null) {
    return 0;
  }

  return Math.round(filesAggregations.averageSize.value);
};

const getAttachmentRegistryStats = (
  registryResults: BucketsWithMaxOnCase,
  totalCasesForOwner: number
): AttachmentStats[] => {
  const stats: AttachmentStats[] = [];

  for (const bucket of registryResults.buckets) {
    const commonFields = {
      average: calculateTypePerCaseAverage(bucket.doc_count, totalCasesForOwner),
      maxOnACase: bucket.references.cases.max.value,
      total: bucket.doc_count,
    };

    stats.push({
      type: bucket.key,
      ...commonFields,
    });
  }

  return stats;
};

const calculateTypePerCaseAverage = (typeDocCount: number | undefined, totalCases: number) => {
  if (typeDocCount == null || totalCases === 0) {
    return 0;
  }

  return Math.round(typeDocCount / totalCases);
};

const getFileAttachmentStats = ({
  registryResults,
  averageFileSize,
  totalCasesForOwner,
  topMimeTypes,
}: {
  registryResults: BucketsWithMaxOnCase;
  averageFileSize?: number;
  totalCasesForOwner: number;
  topMimeTypes?: Buckets<string>;
}): FileAttachmentStats => {
  const fileBuckets = registryResults.buckets.filter(
    (bucket) => bucket.key === FILE_ATTACHMENT_TYPE || bucket.key === LEGACY_FILE_ATTACHMENT_TYPE
  );

  const totalDocCount = fileBuckets.reduce((sum, bucket) => sum + bucket.doc_count, 0);
  // TODO(post-migration): once `.files` rows are gone, drop the legacy bucket.
  // While both keys coexist, `maxOnACase` reports `max(legacyMax, unifiedMax)`
  // — a case with mixed legacy + unified files under-reports the true max-on-a-case;
  // the underlying agg is per-bucket so cross-bucket max can't be reconstructed here.
  const maxOnACase = fileBuckets.reduce(
    (max, bucket) => Math.max(max, bucket.references.cases.max.value ?? 0),
    0
  );

  const mimeTypes =
    topMimeTypes?.buckets.map((mimeType) => ({
      count: mimeType.doc_count,
      name: mimeType.key,
    })) ?? [];

  return {
    averageSize: averageFileSize ?? 0,
    average: calculateTypePerCaseAverage(totalDocCount, totalCasesForOwner),
    maxOnACase,
    total: totalDocCount,
    topMimeTypes: mimeTypes,
  };
};

export const getOnlyAlertsCommentsFilter = () =>
  buildFilter({
    filters: ['alert'],
    field: 'type',
    operator: 'or',
    type: CASE_COMMENT_SAVED_OBJECT,
  });

export const getOnlyConnectorsFilter = () =>
  buildFilter({
    filters: ['connector'],
    field: 'type',
    operator: 'or',
    type: CASE_USER_ACTION_SAVED_OBJECT,
  });

const emptyAttachmentFramework = (): AttachmentFramework => ({
  attachmentFramework: {
    persistableAttachments: [],
    externalAttachments: [],
    files: emptyFileAttachment(),
  },
});

const emptyFileAttachment = (): FileAttachmentStats => ({
  average: 0,
  averageSize: 0,
  maxOnACase: 0,
  total: 0,
  topMimeTypes: [],
});

export const processWithAlertsByOwner = (
  aggregations?: CasesTelemetryWithAlertsAggsByOwnerResults
): Record<Owner, number> => {
  const result: Record<Owner, number> = {
    securitySolution: 0,
    observability: 0,
    cases: 0,
  };
  if (aggregations) {
    aggregations.by_owner?.buckets.forEach((item) => {
      result[item.key as Owner] = item.references.referenceType.referenceAgg.value;
    });
  }
  return result;
};
