/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { ML_PAGES } from '@kbn/ml-plugin/public';
import { useKibana } from '../../../common/lib/kibana/use_kibana';

interface TimeRange {
  from: string;
  to: string;
}

export interface AnomalyRecord {
  job_id: string;
  detector_index: number;
  partition_field_name?: string;
  partition_field_value?: string | number;
  by_field_name?: string;
  by_field_value?: string;
  over_field_name?: string;
  over_field_value?: string;
}

export const useAnomalySingleMetricViewerUrl = (
  timeRange: TimeRange
): ((record: AnomalyRecord) => Promise<string | undefined>) | undefined => {
  const {
    services: { ml },
  } = useKibana();

  const locator = ml?.locator;

  const getUrl = useCallback(
    async (record: AnomalyRecord) => {
      if (!locator) return undefined;

      const entities: Record<string, string> = {};
      if (record.partition_field_name && record.partition_field_value !== undefined) {
        entities[record.partition_field_name] = String(record.partition_field_value);
      }
      if (record.by_field_name && record.by_field_value !== undefined) {
        entities[record.by_field_name] = String(record.by_field_value);
      }
      if (record.over_field_name && record.over_field_value !== undefined) {
        entities[record.over_field_name] = String(record.over_field_value);
      }

      return locator.getUrl({
        page: ML_PAGES.SINGLE_METRIC_VIEWER,
        pageState: {
          jobIds: [record.job_id],
          timeRange: {
            from: timeRange.from,
            to: timeRange.to,
            mode: 'relative',
          },
          detectorIndex: record.detector_index,
          entities: Object.keys(entities).length > 0 ? entities : undefined,
        },
      });
    },
    [locator, timeRange.from, timeRange.to]
  );

  if (!ml?.mlApi || !locator) return undefined;
  return getUrl;
};
