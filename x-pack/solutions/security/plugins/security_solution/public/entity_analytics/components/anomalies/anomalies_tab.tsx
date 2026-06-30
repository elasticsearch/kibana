/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import moment from 'moment';
import {
  ML_PAGES,
  useMlManagementHref,
  useSeverityOptions,
  SeverityLegendControl,
} from '@kbn/ml-plugin/public';
import type { SeverityOption } from '@kbn/ml-plugin/public';
import type { EntityType } from '@kbn/entity-store/common';
import type { DateRangePickerSettings, TimeRangeBoundsOption } from '@kbn/date-range-picker/types';
import { DateRangePicker, type DateRangePickerOnChangeProps } from '@kbn/date-range-picker';
import { parseDateWithDefault } from '../../../common/utils/default_date_settings';
import { useKibana } from '../../../common/lib/kibana';
import { ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS } from '../../../../common/entity_analytics/anomalies/constants';

import { useAnomalyOverview } from '../../api/hooks/use_anomaly_overview';
import {
  ENTITY_ANOMALIES_TAB_MANAGE_ML_JOBS,
  ENTITY_ANOMALIES_TAB_ATTACK_CHAIN_TITLE,
  ENTITY_ANOMALY_DATE_RANGE_TOO_OLD_ERROR,
  ENTITY_ANOMALY_DATE_RANGE_LAST_15_MINUTES,
  ENTITY_ANOMALY_DATE_RANGE_LAST_30_MINUTES,
  ENTITY_ANOMALY_DATE_RANGE_LAST_1_HOUR,
  ENTITY_ANOMALY_DATE_RANGE_LAST_24_HOURS,
  ENTITY_ANOMALY_DATE_RANGE_LAST_7_DAYS,
  ENTITY_ANOMALY_DATE_RANGE_LAST_30_DAYS,
  ENTITY_ANOMALY_DATE_RANGE_LAST_90_DAYS,
  ENTITY_ANOMALY_DATE_RANGE_LAST_1_YEAR,
} from './translations';
import { useAnomalySummary } from '../../api/hooks/use_anomaly_summary';
import {
  ANOMALIES_TAB_TEST_ID,
  ANOMALIES_TAB_ATTACK_CHAIN_TEST_ID,
  ANOMALIES_TAB_MANAGE_JOBS_BUTTON_TEST_ID,
  ANOMALIES_TAB_DATE_RANGE_ERROR_TEST_ID,
} from './test_ids';
import { MitreAttackChain } from './mitre/components/mitre_attack_chain';
import { AnomalyTabTimelineSection } from './anomalies_tab_timeline';
import type { TableChangeEvent } from './anomalies_tab_table';
import { AnomalyTabTableSection } from './anomalies_tab_table';
import type { TableSortDirection, TableSortField } from './table/constants';
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_FIELD,
  DEFAULT_TABLE_PAGE_SIZE,
} from './table/constants';

const TIME_RANGE_PRESETS: TimeRangeBoundsOption[] = [
  { start: 'now-15m', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_15_MINUTES },
  { start: 'now-30m', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_30_MINUTES },
  { start: 'now-1h', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_1_HOUR },
  { start: 'now-24h', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_24_HOURS },
  { start: 'now-7d', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_7_DAYS },
  { start: 'now-30d', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_30_DAYS },
  { start: 'now-90d', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_90_DAYS },
  { start: 'now-1y', end: 'now', label: ENTITY_ANOMALY_DATE_RANGE_LAST_1_YEAR },
];

const DEFAULT_DATE_PICKER_VALUE = ENTITY_ANOMALY_DATE_RANGE_LAST_30_DAYS;
const DEFAULT_TIME_RANGE = { from: 'now-30d', to: 'now' } as const;
const DEFAULT_DATE_PICKER_SETTINGS: DateRangePickerSettings = {
  roundRelativeTime: true,
  timePrecision: 's',
};

interface AnomaliesTabProps {
  entityId: string;
  entityType: EntityType;
}

export const AnomaliesTab: React.FC<AnomaliesTabProps> = ({ entityId, entityType }) => {
  const [datePickerValue, setDatePickerValue] = useState<string>(DEFAULT_DATE_PICKER_VALUE);
  const [start, setStart] = useState<string>(DEFAULT_TIME_RANGE.from);
  const [end, setEnd] = useState<string>(DEFAULT_TIME_RANGE.to);
  const [datePickerSettings, setDatePickerSettings] = useState<DateRangePickerSettings>(
    DEFAULT_DATE_PICKER_SETTINGS
  );

  const [recentTimeRanges, setRecentTimeRanges] = useState<TimeRangeBoundsOption[]>([]);

  const handleDatePickerChange = useCallback((args: DateRangePickerOnChangeProps) => {
    if (args.isInvalid) return;
    setStart(args.start);
    setEnd(args.end);
    setDatePickerValue(args.value);
    setRecentTimeRanges((prev) => {
      const key = `${args.start}|${args.end}`;
      const deduped = prev.filter((r) => `${r.start}|${r.end}` !== key);
      return [{ start: args.start, end: args.end }, ...deduped].slice(0, 10);
    });
    setTablePageIndex(0);
  }, []);

  const timeRangeMs = useMemo(
    () => ({
      from: parseDateWithDefault(
        start,
        moment().subtract(ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS, 'days')
      ).valueOf(),
      to: parseDateWithDefault(end, moment(), true).valueOf(),
    }),
    [start, end]
  );

  const severityOptions = useSeverityOptions();
  const [selectedSeverities, setSelectedSeverities] = useState<SeverityOption[]>(severityOptions);
  const handleSeverityChange = useCallback((next: SeverityOption[]) => {
    setSelectedSeverities(next);
    setTablePageIndex(0);
  }, []);

  const scoreFilter = useMemo<{ min_score?: number; max_score?: number }>(() => {
    if (selectedSeverities.length === severityOptions.length) return {};
    const mins = selectedSeverities.map((s) => s.threshold.min);
    const maxes = selectedSeverities
      .map((s) => ('max' in s.threshold ? s.threshold.max : undefined))
      .filter((m): m is number => m != null);
    return {
      min_score: Math.min(...mins),
      // Only set an upper bound when every selected severity has a max (i.e. critical not included)
      max_score: maxes.length === selectedSeverities.length ? Math.max(...maxes) : undefined,
    };
  }, [selectedSeverities, severityOptions.length]);

  const [tablePageIndex, setTablePageIndex] = useState(0);
  const [tablePageSize, setTablePageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [tableSortField, setTableSortField] = useState<TableSortField>(DEFAULT_SORT_FIELD);
  const [tableSortDirection, setTableSortDirection] =
    useState<TableSortDirection>(DEFAULT_SORT_DIRECTION);

  const [selectedTactic, setSelectedTactic] = useState<string | null>(null);
  const handleSelectTactic = useCallback(
    (tactic: string) => {
      setSelectedTactic((current) => (current === tactic ? null : tactic));
      setTablePageIndex(0);
    },
    [setSelectedTactic]
  );

  const handleTableChange = useCallback(({ page, sort }: TableChangeEvent) => {
    if (page) {
      setTablePageIndex(page.index);
      setTablePageSize(page.size);
    }
    if (sort) {
      setTableSortField(sort.field);
      setTableSortDirection(sort.direction);
    }
  }, []);

  const anomalyOverview = useAnomalyOverview({
    entityId,
    entityType,
    from: timeRangeMs.from,
    to: timeRangeMs.to,
    threatTactics: selectedTactic ? [selectedTactic] : undefined,
    minScore: scoreFilter.min_score,
    maxScore: scoreFilter.max_score,
  });

  const uniqueTactics = useMemo(
    () => Object.keys(anomalyOverview.data?.tacticCounts ?? {}),
    [anomalyOverview]
  );

  const anomalySummary = useAnomalySummary({
    entityId,
    entityType,
    body: {
      from: timeRangeMs.from,
      to: timeRangeMs.to,
      threat_tactics: selectedTactic ? [selectedTactic] : undefined,
      min_score: scoreFilter.min_score,
      max_score: scoreFilter.max_score,
      page: tablePageIndex + 1,
      page_size: tablePageSize,
      sort: [{ field: tableSortField, order: tableSortDirection }],
    },
  });

  useEffect(() => {
    if (anomalyOverview.isFetching) return;
    if (selectedTactic && !uniqueTactics.includes(selectedTactic)) {
      setSelectedTactic(null);
    }
  }, [anomalyOverview.isFetching, selectedTactic, uniqueTactics]);

  const [isDateRangeTooOld, setIsDateRangeTooOld] = useState(false);
  useEffect(() => {
    if (anomalyOverview.isFetching || anomalySummary.isFetching) return;
    const err = (anomalyOverview.error ?? anomalySummary.error) as
      | { response?: { status?: number }; body?: { message?: string } }
      | null
      | undefined;
    setIsDateRangeTooOld(
      err?.response?.status === 400 &&
        Boolean(err?.body?.message?.includes('`from` must not be older than 1 year'))
    );
  }, [
    anomalyOverview.isFetching,
    anomalyOverview.error,
    anomalySummary.isFetching,
    anomalySummary.error,
  ]);

  const {
    services: { ml },
  } = useKibana();
  const manageJobsHref = useMlManagementHref(ml, {
    page: ML_PAGES.ANOMALY_DETECTION_JOBS_MANAGE,
  });

  return (
    <div data-test-subj={ANOMALIES_TAB_TEST_ID}>
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="s"
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
            <EuiFlexItem grow={false}>
              <DateRangePicker
                value={datePickerValue}
                onChange={handleDatePickerChange}
                settings={datePickerSettings}
                onSettingsChange={setDatePickerSettings}
                presets={TIME_RANGE_PRESETS}
                recent={recentTimeRanges}
                width="auto"
                compressed
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <SeverityLegendControl
                allSeverityOptions={severityOptions}
                selectedSeverities={selectedSeverities}
                onChange={handleSeverityChange}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            data-test-subj={ANOMALIES_TAB_MANAGE_JOBS_BUTTON_TEST_ID}
            color="primary"
            size="s"
            iconType="external"
            iconSide="right"
            href={manageJobsHref}
            target="_blank"
            isDisabled={!manageJobsHref}
          >
            {ENTITY_ANOMALIES_TAB_MANAGE_ML_JOBS}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      {isDateRangeTooOld && (
        <>
          <EuiCallOut
            data-test-subj={ANOMALIES_TAB_DATE_RANGE_ERROR_TEST_ID}
            announceOnMount
            color="warning"
            iconType="warning"
            title={ENTITY_ANOMALY_DATE_RANGE_TOO_OLD_ERROR}
          />
          <EuiSpacer size="m" />
        </>
      )}
      {uniqueTactics.length > 0 && (
        <EuiAccordion
          id="entity-anomalies-tab-attack-chain-accordion"
          data-test-subj={ANOMALIES_TAB_ATTACK_CHAIN_TEST_ID}
          initialIsOpen
          buttonContent={
            <EuiTitle size="xs">
              <h3>{ENTITY_ANOMALIES_TAB_ATTACK_CHAIN_TITLE}</h3>
            </EuiTitle>
          }
        >
          <EuiSpacer size="m" />
          <EuiPanel
            color="plain"
            hasBorder
            paddingSize="none"
            css={css`
              padding: 16px 24px;
            `}
          >
            <MitreAttackChain
              anomalyCountByTactic={anomalyOverview?.data?.tacticCounts ?? {}}
              onSelectTactic={handleSelectTactic}
              selectedTactic={selectedTactic}
              triggeredTactics={uniqueTactics}
              showLabels
            />
          </EuiPanel>
        </EuiAccordion>
      )}
      <EuiSpacer size="l" />
      <AnomalyTabTimelineSection
        anomalies={anomalyOverview.data?.anomalyByTimeBucket ?? []}
        selectedTactic={selectedTactic}
        timeRangeMs={timeRangeMs}
      />
      <EuiSpacer size="l" />
      <AnomalyTabTableSection
        anomalies={anomalySummary.data?.anomalies ?? []}
        entityType={entityType}
        onTableChange={handleTableChange}
        page={anomalySummary.data?.page ?? tablePageIndex + 1}
        pageSize={anomalySummary.data?.page_size ?? tablePageSize}
        sortField={tableSortField}
        sortDirection={tableSortDirection}
        timeRange={{ from: start, to: end }}
        total={anomalySummary.data?.total ?? 0}
      />
    </div>
  );
};
