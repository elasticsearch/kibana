/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo, useRef } from 'react';
import type { IconType } from '@elastic/eui';
import { FilterStateStore, escapeQuotes, type Filter } from '@kbn/es-query';
import type { SerializableRecord } from '@kbn/utility-types';
import { useInvestigateInTimeline } from '../../../common/hooks/timeline/use_investigate_in_timeline';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { useKibana } from '../../../common/lib/kibana';
import type { TableRow } from '../../components/anomalies/table/types';
import {
  useAnomalySingleMetricViewerUrl,
  type AnomalyRecord,
} from './use_anomaly_single_metric_viewer_url';
import {
  ENTITY_ANOMALY_TABLE_ROW_ACTION_ADD_TO_TIMELINE,
  ENTITY_ANOMALY_TABLE_ROW_ACTION_VIEW_IN_DISCOVER,
  ENTITY_ANOMALY_TABLE_ROW_ACTION_VIEW_IN_SMV,
} from '../../components/anomalies/translations';

export interface AnomalyTableRowAction {
  key: string;
  label: string;
  icon: IconType;
  onClick: () => void;
}

export interface AnomalyTableRowActionsResult {
  actions: AnomalyTableRowAction[];
}

interface UseAnomalyTableRowActionsArgs {
  row: TableRow;
  timeRange: { from: string; to: string };
  closePopover: () => void;
}

const KNOWN_EMPTY_QUERIES = [
  '{"match_all":{}}',
  '{"bool":{"must":[{"match_all":{}}]}}',
  '{"bool":{"filter":[],"must":[{"match_all":{}}],"must_not":[]}}',
  '{"bool":{"filter":[],"must":[{"match_all":{}}]}}',
  '{"bool":{"must":[{"match_all":{}}],"must_not":[]}}',
];

const isKnownEmptyQuery = (query: object) => KNOWN_EMPTY_QUERIES.includes(JSON.stringify(query));

interface AnomalyQuerySource {
  timestamp: number;
  bucket_span: number;
  influencers?: Array<{ influencer_field_name: string; influencer_field_values: string[] }>;
}

type CachedRecord = AnomalyQuerySource & AnomalyRecord;

interface CachedJob {
  datafeed_config?: {
    query?: object;
    indices?: string[];
  };
}

const buildDatafeedFilter = (
  datafeedQuery: object,
  jobId: string,
  indexPatternId?: string | null
): Filter => ({
  meta: {
    ...(indexPatternId ? { index: indexPatternId } : { isMultiIndex: true }),
    alias: jobId,
    negate: false,
    disabled: false,
    type: 'custom',
    value: JSON.stringify(datafeedQuery),
  },
  query: datafeedQuery as SerializableRecord,
  $state: { store: FilterStateStore.APP_STATE },
});

const buildAnomalyQueryParams = (record: AnomalyQuerySource) => {
  let kqlQuery = '';
  if (record.influencers) {
    kqlQuery = record.influencers
      .filter((influencer) => influencer != null)
      .map((influencer) => {
        const { influencer_field_name: fieldName, influencer_field_values: values } = influencer;
        if (values.length === 0) return undefined;
        const escapedField = escapeQuotes(fieldName);
        const escapedVals = values
          .filter((v) => v != null)
          .map((v) => `"${escapedField}":"${escapeQuotes(v)}"`);
        return escapedVals.length > 1 ? `(${escapedVals.join(' OR ')})` : escapedVals[0];
      })
      .filter((part): part is string => part != null)
      .join(' AND ');
  }

  const from = new Date(record.timestamp - 3600 * 1000).toISOString();
  const to = new Date(record.timestamp + record.bucket_span * 1000).toISOString();

  return { kqlQuery, from, to };
};

export const useAnomalyTableRowActions = ({
  row,
  timeRange,
  closePopover,
}: UseAnomalyTableRowActionsArgs): AnomalyTableRowActionsResult => {
  const { services } = useKibana();
  const { ml, share, data } = services;
  const {
    timelinePrivileges: { read: canReadTimeline },
  } = useUserPrivileges();
  const { investigateInTimeline } = useInvestigateInTimeline();

  const cachedRecordRef = useRef<CachedRecord | null>(null);
  const fetchRecordPromiseRef = useRef<Promise<CachedRecord | null> | null>(null);

  const fetchRecord = useCallback((): Promise<CachedRecord | null> => {
    if (cachedRecordRef.current) return Promise.resolve(cachedRecordRef.current);
    if (fetchRecordPromiseRef.current) return fetchRecordPromiseRef.current;
    if (!ml?.mlApi) return Promise.resolve(null);
    fetchRecordPromiseRef.current = ml.mlApi.results
      .anomalySearch({ size: 1, query: { ids: { values: [row.recordId] } } }, [row.jobId])
      .then((result) => {
        const record = (result.hits.hits[0]?._source ?? null) as CachedRecord | null;
        cachedRecordRef.current = record;
        return record;
      })
      .catch(() => {
        fetchRecordPromiseRef.current = null;
        return null;
      });
    return fetchRecordPromiseRef.current;
  }, [ml, row.recordId, row.jobId]);

  const cachedJobRef = useRef<CachedJob | null>(null);
  const fetchJobPromiseRef = useRef<Promise<CachedJob | null> | null>(null);

  const fetchJob = useCallback((): Promise<CachedJob | null> => {
    if (cachedJobRef.current) return Promise.resolve(cachedJobRef.current);
    if (fetchJobPromiseRef.current) return fetchJobPromiseRef.current;
    if (!ml?.mlApi) return Promise.resolve(null);
    fetchJobPromiseRef.current = ml.mlApi.jobs
      .jobs([row.jobId])
      .then((jobs) => {
        const job = (jobs[0] ?? null) as CachedJob | null;
        cachedJobRef.current = job;
        return job;
      })
      .catch(() => {
        fetchJobPromiseRef.current = null;
        return null;
      });
    return fetchJobPromiseRef.current;
  }, [ml, row.jobId]);

  const handleAddToTimeline = useCallback(async () => {
    closePopover();
    try {
      const [record, job] = await Promise.all([fetchRecord(), fetchJob()]);
      if (!record) return;
      const { kqlQuery, from, to } = buildAnomalyQueryParams(record);
      const datafeedQuery = job?.datafeed_config?.query;
      const filters =
        datafeedQuery && !isKnownEmptyQuery(datafeedQuery)
          ? [buildDatafeedFilter(datafeedQuery, row.jobId)]
          : [];
      investigateInTimeline({
        query: { language: 'kuery', query: kqlQuery },
        timeRange: { kind: 'absolute', from, to },
        filters,
      });
    } catch (e) {
      // Failed to add anomaly to timeline
    }
  }, [closePopover, fetchJob, fetchRecord, investigateInTimeline, row.jobId]);

  const handleViewInDiscover = useCallback(async () => {
    closePopover();
    if (!ml?.mlApi) return;

    try {
      const [record, job] = await Promise.all([fetchRecord(), fetchJob()]);
      if (!record) return;

      const indexPattern = job?.datafeed_config?.indices?.join(',') ?? null;
      let indexPatternId: string | null = null;
      if (indexPattern) {
        const dataViews = await data.dataViews.find(indexPattern);
        indexPatternId = dataViews.find((dv) => dv.getIndexPattern() === indexPattern)?.id ?? null;
      }

      const { kqlQuery, from, to } = buildAnomalyQueryParams(record);

      const discoverLocator = share?.url.locators.get('DISCOVER_APP_LOCATOR');
      if (!discoverLocator) return;

      const datafeedQuery = job?.datafeed_config?.query;
      const filters =
        datafeedQuery && !isKnownEmptyQuery(datafeedQuery)
          ? [buildDatafeedFilter(datafeedQuery, row.jobId, indexPatternId)]
          : [];

      const url = await discoverLocator.getRedirectUrl({
        indexPatternId,
        timeRange: { from, to, mode: 'absolute' },
        query: { language: 'kuery', query: kqlQuery },
        filters,
      } as unknown as SerializableRecord);

      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      // Failed to open anomaly in Discover
    }
  }, [closePopover, fetchJob, fetchRecord, ml, share, data, row.jobId]);

  const getUrl = useAnomalySingleMetricViewerUrl(timeRange);

  const handleViewInSingleMetricViewer = useCallback(async () => {
    closePopover();
    if (!getUrl) return;
    try {
      const record = await fetchRecord();
      if (!record) return;
      const url = await getUrl(record);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      // Failed to open anomaly in Single Metric Viewer
    }
  }, [closePopover, fetchRecord, getUrl]);

  const actions = useMemo(() => {
    const items: AnomalyTableRowAction[] = [];

    if (canReadTimeline) {
      items.push({
        key: 'add-to-timeline',
        label: ENTITY_ANOMALY_TABLE_ROW_ACTION_ADD_TO_TIMELINE,
        icon: 'timeline',
        onClick: handleAddToTimeline,
      });
    }

    items.push({
      key: 'view-in-discover',
      label: ENTITY_ANOMALY_TABLE_ROW_ACTION_VIEW_IN_DISCOVER,
      icon: 'productDiscover',
      onClick: handleViewInDiscover,
    });

    if (getUrl) {
      items.push({
        key: 'view-in-single-metric-viewer',
        label: ENTITY_ANOMALY_TABLE_ROW_ACTION_VIEW_IN_SMV,
        icon: 'singleMetricViewer',
        onClick: handleViewInSingleMetricViewer,
      });
    }

    return items;
  }, [
    canReadTimeline,
    getUrl,
    handleAddToTimeline,
    handleViewInDiscover,
    handleViewInSingleMetricViewer,
  ]);

  return useMemo(() => ({ actions }), [actions]);
};
