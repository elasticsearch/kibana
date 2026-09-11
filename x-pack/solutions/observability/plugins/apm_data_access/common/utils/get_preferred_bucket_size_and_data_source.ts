/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { parseInterval } from '@kbn/data-plugin/common';
import { orderBy, last } from 'lodash';
import type { ApmDataSourceWithSummary } from '@kbn/apm-types';
import { ApmDocumentType } from '../document_type';
import { RollupInterval } from '../rollup';

const EVENT_PREFERENCE = [
  ApmDocumentType.ServiceTransactionMetric,
  ApmDocumentType.TransactionMetric,
  ApmDocumentType.TransactionEvent,
];

export function intervalToSeconds(rollupInterval: string) {
  if (rollupInterval === RollupInterval.None) {
    return 0;
  }

  return parseInterval(rollupInterval)!.asSeconds();
}

export function getPreferredBucketSizeAndDataSource({
  sources,
  bucketSizeInSeconds,
}: {
  sources: ApmDataSourceWithSummary[];
  bucketSizeInSeconds: number;
}): {
  source: ApmDataSourceWithSummary;
  bucketSizeInSeconds: number;
} {
  let preferred: ApmDataSourceWithSummary | undefined;

  const sourcesWithDocs = sources.filter((source) => source.hasDocs);

  const sourcesInPreferredOrder = orderBy(
    sourcesWithDocs,
    [
      (source) => EVENT_PREFERENCE.indexOf(source.documentType),
      (source) => intervalToSeconds(source.rollupInterval),
    ],
    ['asc', 'desc']
  );

  if (sourcesInPreferredOrder.length > 0) {
    const preferredDocumentType = sourcesInPreferredOrder[0].documentType;

    const sourcesFromPreferredDocumentType = sourcesInPreferredOrder.filter(
      (source) => source.documentType === preferredDocumentType
    );

    preferred =
      sourcesFromPreferredDocumentType.find((source) => {
        const rollupIntervalInSeconds = intervalToSeconds(source.rollupInterval);

        return rollupIntervalInSeconds <= bucketSizeInSeconds;
      }) ||
      // pick 1m from available docs if we can't find a matching bucket size
      last(sourcesFromPreferredDocumentType);
  }

  if (!preferred) {
    preferred = {
      documentType: ApmDocumentType.TransactionEvent,
      rollupInterval: RollupInterval.None,
      hasDurationSummaryField: false,
      hasDocs: true,
    };
  }

  return {
    source: preferred,
    bucketSizeInSeconds: Math.max(bucketSizeInSeconds, intervalToSeconds(preferred.rollupInterval)),
  };
}
