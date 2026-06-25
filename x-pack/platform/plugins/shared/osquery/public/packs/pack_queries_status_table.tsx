/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  EuiBasicTable,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiButtonIcon,
  EuiToolTip,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiSpacer,
  EuiPanel,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedDate, FormattedTime, FormattedRelative } from '@kbn/i18n-react';
import moment from 'moment-timezone';

import type {
  TypedLensByValueInput,
  PersistedIndexPatternLayer,
  PieVisualizationState,
  TermsIndexPatternColumn,
} from '@kbn/lens-plugin/public';
import { DOCUMENT_FIELD_NAME as RECORDS_FIELD } from '@kbn/lens-plugin/common/constants';
import { FilterStateStore } from '@kbn/es-query';
import { removeMultilines } from '../../common/utils/build_query/remove_multilines';
import { useKibana } from '../common/lib/kibana';
import { useSpaceId } from '../common/hooks/use_space_id';
import { ScheduledQueryErrorsTable } from './scheduled_query_errors_table';
import { usePackQueryLastResults } from './use_pack_query_last_results';
import { usePackQueryErrors } from './use_pack_query_errors';
import type { PackQueryFormData, UsePackQueryFormProps } from './queries/use_pack_query_form';
import type { LogsDataView } from '../common/hooks/use_logs_data_view';
import { useLogsDataView } from '../common/hooks/use_logs_data_view';
import { ExperimentalFeaturesService } from '../common/experimental_features_service';
import { formatQuerySchedule } from './format_query_schedule';

const VIEW_IN_DISCOVER = i18n.translate(
  'xpack.osquery.pack.queriesTable.viewDiscoverResultsActionAriaLabel',
  {
    defaultMessage: 'View in Discover',
  }
);

const VIEW_IN_LENS = i18n.translate(
  'xpack.osquery.pack.queriesTable.viewLensResultsActionAriaLabel',
  {
    defaultMessage: 'View in Lens',
  }
);

export enum ViewResultsActionButtonType {
  icon = 'icon',
  button = 'button',
}

interface ViewResultsInDiscoverActionProps {
  actionId?: string;
  scheduleId?: string;
  executionCount?: number;
  buttonType: ViewResultsActionButtonType;
  endDate?: string;
  startDate?: string;
  mode?: string;
}

export function getLensAttributes(
  logsDataView: LogsDataView,
  actionId: string,
  scheduleId?: string,
  executionCount?: number
): TypedLensByValueInput['attributes'] {
  // Scheduled-pack result docs filter by `schedule_id`; live-action docs by `action_id`.
  const useScheduleFilter = !!scheduleId && typeof executionCount === 'number';
  const filterField = useScheduleFilter ? 'schedule_id' : 'action_id';
  const filterValue = useScheduleFilter ? scheduleId : actionId;
  // For scheduled queries, narrow further to a specific execution to match
  // exactly the documents counted in the "Last results" / "Docs" / "Agents"
  // columns; without this the link would return all historical executions.
  const includeExecutionFilter = useScheduleFilter;
  const dataLayer: PersistedIndexPatternLayer = {
    columnOrder: ['8690befd-fd69-4246-af4a-dd485d2a3b38', 'ed999e9d-204c-465b-897f-fe1a125b39ed'],
    columns: {
      '8690befd-fd69-4246-af4a-dd485d2a3b38': {
        sourceField: 'type',
        isBucketed: true,
        dataType: 'string',
        scale: 'ordinal',
        operationType: 'terms',
        label: 'Top values of type',
        params: {
          otherBucket: true,
          size: 5,
          missingBucket: false,
          orderBy: {
            columnId: 'ed999e9d-204c-465b-897f-fe1a125b39ed',
            type: 'column',
          },
          orderDirection: 'desc',
        },
      } as TermsIndexPatternColumn,
      'ed999e9d-204c-465b-897f-fe1a125b39ed': {
        sourceField: RECORDS_FIELD,
        isBucketed: false,
        dataType: 'number',
        scale: 'ratio',
        operationType: 'count',
        label: 'Count of records',
      },
    },
    incompleteColumns: {},
  };

  const xyConfig: PieVisualizationState = {
    shape: 'pie',
    layers: [
      {
        layerType: 'data',
        legendDisplay: 'default',
        nestedLegend: false,
        layerId: 'layer1',
        metrics: ['ed999e9d-204c-465b-897f-fe1a125b39ed'],
        numberDisplay: 'percent',
        primaryGroups: ['8690befd-fd69-4246-af4a-dd485d2a3b38'],
        categoryDisplay: 'default',
      },
    ],
  };

  return {
    visualizationType: 'lnsPie',
    title: useScheduleFilter ? `Schedule ${scheduleId} results` : `Action ${actionId} results`,
    references: [
      {
        id: logsDataView.id,
        name: 'indexpattern-datasource-current-indexpattern',
        type: 'index-pattern',
      },
      {
        id: logsDataView.id,
        name: 'indexpattern-datasource-layer-layer1',
        type: 'index-pattern',
      },
      {
        name: 'filter-index-pattern-0',
        id: logsDataView.id,
        type: 'index-pattern',
      },
    ],
    state: {
      datasourceStates: {
        formBased: {
          layers: {
            layer1: dataLayer,
          },
        },
      },
      filters: [
        {
          $state: { store: FilterStateStore.APP_STATE },
          meta: {
            index: 'filter-index-pattern-0',
            negate: false,
            alias: null,
            disabled: false,
            params: {
              query: filterValue,
            },
            type: 'phrase',
            key: filterField,
          },
          query: {
            match_phrase: {
              [filterField]: filterValue,
            },
          },
        },
        ...(includeExecutionFilter
          ? [
              {
                $state: { store: FilterStateStore.APP_STATE },
                meta: {
                  index: 'filter-index-pattern-0',
                  negate: false,
                  alias: null,
                  disabled: false,
                  params: { query: executionCount },
                  type: 'phrase',
                  key: 'osquery_meta.schedule_execution_count',
                },
                query: {
                  match_phrase: {
                    'osquery_meta.schedule_execution_count': executionCount,
                  },
                },
              },
            ]
          : []),
      ],
      query: { language: 'kuery', query: '' },
      visualization: xyConfig,
    },
  };
}

const ViewResultsInLensActionComponent: React.FC<ViewResultsInDiscoverActionProps> = ({
  actionId,
  scheduleId,
  executionCount,
  buttonType,
  endDate,
  startDate,
  mode,
}) => {
  const lensService = useKibana().services.lens;
  const isLensAvailable = lensService?.canUseEditor();
  const hasIdentifier = !!(actionId || scheduleId);
  const { data: logsDataView } = useLogsDataView({ skip: !hasIdentifier, checkOnly: true });

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      if (logsDataView?.id) {
        lensService?.navigateToPrefilledEditor(
          {
            id: '',
            time_range: {
              from: startDate ?? 'now-1d',
              to: endDate ?? 'now',
              mode: mode ?? (startDate || endDate) ? 'absolute' : 'relative',
            },
            attributes: getLensAttributes(logsDataView, actionId ?? '', scheduleId, executionCount),
          },
          {
            openInNewTab: true,
            skipAppLeave: true,
          }
        );
      }
    },
    [actionId, scheduleId, executionCount, endDate, lensService, logsDataView, mode, startDate]
  );

  if (!isLensAvailable) {
    return null;
  }

  if (buttonType === ViewResultsActionButtonType.button) {
    return (
      <EuiButtonEmpty size="xs" iconType="lensApp" onClick={handleClick} isDisabled={!logsDataView}>
        {VIEW_IN_LENS}
      </EuiButtonEmpty>
    );
  }

  return (
    <EuiToolTip content={VIEW_IN_LENS} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="lensApp"
        isDisabled={!logsDataView}
        onClick={handleClick}
        aria-label={VIEW_IN_LENS}
      />
    </EuiToolTip>
  );
};

export const ViewResultsInLensAction = React.memo(ViewResultsInLensActionComponent);

const ViewResultsInDiscoverActionComponent: React.FC<ViewResultsInDiscoverActionProps> = ({
  actionId,
  scheduleId,
  executionCount,
  buttonType,
  endDate,
  startDate,
}) => {
  const { discover, application } = useKibana().services;
  const locator = discover?.locator;
  const discoverPermissions = application.capabilities.discover_v2;
  const hasIdentifier = !!(actionId || scheduleId);
  const { data: logsDataView } = useLogsDataView({ skip: !hasIdentifier, checkOnly: true });

  const [discoverUrl, setDiscoverUrl] = useState<string>('');

  useEffect(() => {
    const getDiscoverUrl = async () => {
      if (!locator || !logsDataView) return;

      // Scheduled-pack docs filter by `schedule_id`; live-action docs by `action_id`.
      const useScheduleFilter = !!scheduleId && typeof executionCount === 'number';
      const filterField = useScheduleFilter ? 'schedule_id' : 'action_id';
      const filterValue = useScheduleFilter ? scheduleId : actionId;
      // For scheduled queries, narrow further to one execution so the link
      // matches exactly the docs counted in the column.
      const includeExecutionFilter = useScheduleFilter;

      const newUrl = await locator.getUrl({
        indexPatternId: logsDataView.id,
        filters: [
          {
            meta: {
              index: logsDataView.id,
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: filterField,
              params: { query: filterValue },
            },
            query: { match_phrase: { [filterField]: filterValue } },
            $state: { store: FilterStateStore.APP_STATE },
          },
          ...(includeExecutionFilter
            ? [
                {
                  meta: {
                    index: logsDataView.id,
                    alias: null,
                    negate: false,
                    disabled: false,
                    type: 'phrase',
                    key: 'osquery_meta.schedule_execution_count',
                    params: { query: executionCount },
                  },
                  query: {
                    match_phrase: {
                      'osquery_meta.schedule_execution_count': executionCount,
                    },
                  },
                  $state: { store: FilterStateStore.APP_STATE },
                },
              ]
            : []),
        ],
        refreshInterval: {
          pause: true,
          value: 0,
        },
        timeRange:
          startDate && endDate
            ? {
                to: endDate,
                from: startDate,
                mode: 'absolute',
              }
            : {
                to: 'now',
                from: 'now-1d',
                mode: 'relative',
              },
      });
      setDiscoverUrl(newUrl);
    };

    getDiscoverUrl();
  }, [actionId, scheduleId, executionCount, endDate, startDate, locator, logsDataView]);

  if (!discoverPermissions.show) {
    return null;
  }

  if (buttonType === ViewResultsActionButtonType.button) {
    return (
      <EuiButtonEmpty
        size="xs"
        iconType="discoverApp"
        href={discoverUrl}
        target="_blank"
        isDisabled={!logsDataView}
      >
        {VIEW_IN_DISCOVER}
      </EuiButtonEmpty>
    );
  }

  return (
    <EuiToolTip content={VIEW_IN_DISCOVER} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="discoverApp"
        aria-label={VIEW_IN_DISCOVER}
        href={discoverUrl}
        target="_blank"
        isDisabled={!logsDataView}
      />
    </EuiToolTip>
  );
};

export const ViewResultsInDiscoverAction = React.memo(ViewResultsInDiscoverActionComponent);

interface ScheduledQueryExpandedContentProps {
  actionId?: string;
  scheduleId?: string;
  agentIds?: string[];
  interval: number;
}

const ScheduledQueryExpandedContent = React.memo<ScheduledQueryExpandedContentProps>(
  ({ actionId, scheduleId, agentIds, interval }) => (
    <EuiFlexGroup direction="column" gutterSize="xl">
      <EuiFlexItem>
        <EuiSpacer size="m" />
        <EuiPanel paddingSize="s" hasBorder hasShadow={false}>
          <ScheduledQueryErrorsTable
            actionId={actionId}
            scheduleId={scheduleId}
            agentIds={agentIds}
            interval={interval}
          />
        </EuiPanel>
        <EuiSpacer size="m" />
      </EuiFlexItem>
    </EuiFlexGroup>
  )
);

ScheduledQueryExpandedContent.displayName = 'ScheduledQueryExpandedContent';

interface ScheduledQueryLastResultsProps {
  actionId?: string;
  queryId?: string;
  interval: number;
  scheduleId?: string;
}

interface ScheduledQueryErrorsProps {
  actionId?: string;
  scheduleId?: string;
  queryId: string;
  interval: number;
  toggleErrors: (payload: { queryId: string; interval: number; scheduleId?: string }) => void;
  expanded: boolean;
}

const ScheduledQueryLastResults: React.FC<ScheduledQueryLastResultsProps> = ({
  actionId,
  interval,
  scheduleId,
}) => {
  const { data: lastResultsData, isLoading } = usePackQueryLastResults({
    actionId,
    interval,
    scheduleId,
  });

  const timestamp = useMemo(() => {
    const dateTime = lastResultsData?.lastResultTime;
    if (!dateTime) return undefined;

    return Array.isArray(dateTime) ? dateTime[0] : dateTime;
  }, [lastResultsData]);

  if (isLoading) {
    return <EuiLoadingSpinner />;
  }

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={4}>
        {timestamp ? (
          <EuiToolTip
            content={
              <>
                <FormattedDate value={timestamp} year="numeric" month="short" day="2-digit" />{' '}
                <FormattedTime value={timestamp} timeZoneName="short" />
              </>
            }
          >
            <div data-test-subj="last-results-date" tabIndex={0}>
              <FormattedRelative value={timestamp} />
            </div>
          </EuiToolTip>
        ) : (
          '-'
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const DocsColumnResults: React.FC<ScheduledQueryLastResultsProps> = ({
  actionId,
  interval,
  scheduleId,
}) => {
  const { data: lastResultsData, isLoading } = usePackQueryLastResults({
    actionId,
    interval,
    scheduleId,
  });

  if (isLoading) {
    return <EuiLoadingSpinner />;
  }

  if (!lastResultsData) {
    return <>{'-'}</>;
  }

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiNotificationBadge color="subdued" data-test-subj="docs-count-badge">
          {(lastResultsData?.docCount as number) ?? 0}
        </EuiNotificationBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const AgentsColumnResults: React.FC<ScheduledQueryLastResultsProps> = ({
  actionId,
  interval,
  scheduleId,
}) => {
  const { data: lastResultsData, isLoading } = usePackQueryLastResults({
    actionId,
    interval,
    scheduleId,
  });
  if (isLoading) {
    return <EuiLoadingSpinner data-test-subj={'docsLoading'} />;
  }

  if (!lastResultsData) {
    return <>{'-'}</>;
  }

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiNotificationBadge color="subdued" data-test-subj="agent-count-badge">
          {lastResultsData?.uniqueAgentsCount ?? 0}
        </EuiNotificationBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const ErrorsColumnResults: React.FC<ScheduledQueryErrorsProps> = ({
  actionId,
  scheduleId,
  interval,
  queryId,
  toggleErrors,
  expanded,
}) => {
  const handleErrorsToggle = useCallback(
    () => toggleErrors({ queryId, interval, scheduleId }),
    [toggleErrors, queryId, interval, scheduleId]
  );

  const { data: errorsData, isLoading: errorsLoading } = usePackQueryErrors({
    actionId,
    scheduleId,
    interval,
  });
  if (errorsLoading) {
    return <EuiLoadingSpinner />;
  }

  if (!errorsData?.total) {
    return <span data-test-subj="packResultsErrorsEmpty">{'-'}</span>;
  }

  return (
    <EuiFlexItem grow={false}>
      <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiNotificationBadge color={errorsData?.total ? 'accent' : 'subdued'}>
            {(errorsData?.total as number) ?? 0}
          </EuiNotificationBadge>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('xpack.osquery.pack.queriesTable.errorsAriaLabel', {
              defaultMessage: 'Error details',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              isDisabled={!errorsData?.total}
              onClick={handleErrorsToggle}
              iconType={expanded ? 'chevronSingleUp' : 'chevronSingleDown'}
              aria-label={i18n.translate('xpack.osquery.pack.queriesTable.errorsAriaLabel', {
                defaultMessage: 'Error details',
              })}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};

const getPackActionId = (queryId: string, packName: string, spaceId?: string) =>
  spaceId ? `pack_${spaceId}--${packName}_${queryId}` : undefined;

interface PackViewInActionProps {
  actionId?: string;
  scheduleId?: string;
  interval: number;
}

const PackViewInDiscoverActionComponent: React.FC<PackViewInActionProps> = ({
  actionId,
  scheduleId,
  interval,
}) => {
  const { data: lastResultsData } = usePackQueryLastResults({
    actionId,
    scheduleId,
    interval,
  });

  const startDate = lastResultsData?.lastResultTime
    ? moment(lastResultsData.lastResultTime[0]).subtract(interval, 'seconds').toISOString()
    : `now-${interval}s`;
  const endDate = lastResultsData?.lastResultTime
    ? moment(lastResultsData.lastResultTime[0]).toISOString()
    : 'now';

  return (
    <ViewResultsInDiscoverAction
      actionId={actionId}
      scheduleId={scheduleId}
      executionCount={lastResultsData?.executionCount}
      buttonType={ViewResultsActionButtonType.icon}
      startDate={startDate}
      endDate={endDate}
      mode={lastResultsData?.lastResultTime ? 'absolute' : 'relative'}
    />
  );
};

const PackViewInDiscoverAction = React.memo(PackViewInDiscoverActionComponent);

const PackViewInLensActionComponent: React.FC<PackViewInActionProps> = ({
  actionId,
  scheduleId,
  interval,
}) => {
  const { data: lastResultsData } = usePackQueryLastResults({
    actionId,
    scheduleId,
    interval,
  });

  const startDate = lastResultsData?.lastResultTime
    ? moment(lastResultsData.lastResultTime[0]).subtract(interval, 'seconds').toISOString()
    : `now-${interval}s`;
  const endDate = lastResultsData?.lastResultTime
    ? moment(lastResultsData.lastResultTime[0]).toISOString()
    : 'now';

  return (
    <ViewResultsInLensAction
      actionId={actionId}
      scheduleId={scheduleId}
      executionCount={lastResultsData?.executionCount}
      buttonType={ViewResultsActionButtonType.icon}
      startDate={startDate}
      endDate={endDate}
      mode={lastResultsData?.lastResultTime ? 'absolute' : 'relative'}
    />
  );
};

const PackViewInLensAction = React.memo(PackViewInLensActionComponent);

interface PackQueriesStatusTableProps {
  agentIds?: string[];
  data: PackQueryFormData[];
  packName: string;
  packSchedule?: UsePackQueryFormProps['packSchedule'];
}

const PackQueriesStatusTableComponent: React.FC<PackQueriesStatusTableProps> = ({
  agentIds,
  data,
  packName,
  packSchedule,
}) => {
  const spaceId = useSpaceId();
  const isRruleSchedulingEnabled = ExperimentalFeaturesService.get().rruleScheduling;
  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<
    Record<string, ReturnType<typeof ScheduledQueryExpandedContent>>
  >({});

  const actionIdForQuery = useCallback(
    (queryId: string) => getPackActionId(queryId, packName, spaceId),
    [packName, spaceId]
  );

  const renderQueryColumn = useCallback((query: string, item: PackQueryFormData) => {
    const singleLine = removeMultilines(query);
    const content = singleLine.length > 55 ? `${singleLine.substring(0, 55)}...` : singleLine;

    return (
      <EuiToolTip title={item.id} content={<EuiFlexItem>{query}</EuiFlexItem>}>
        <EuiCodeBlock language="sql" fontSize="s" paddingSize="none" transparentBackground>
          {content}
        </EuiCodeBlock>
      </EuiToolTip>
    );
  }, []);

  const renderScheduleColumn = useCallback(
    (_: unknown, item: PackQueryFormData) =>
      formatQuerySchedule(
        item.schedule_type
          ? {
              schedule_type: item.schedule_type,
              interval: item.interval,
              rrule_schedule: item.rrule_schedule,
            }
          : packSchedule ?? { interval: item.interval }
      ),
    [packSchedule]
  );

  // Scheduled-pack docs filter by `schedule_id`; live-action docs by `action_id`.
  // Hooks downstream prefer `scheduleId` when both are present, so callers can
  // pass `actionId` unconditionally and let the precedence rule pick.
  const toggleErrors = useCallback(
    ({
      queryId,
      interval,
      scheduleId,
    }: {
      queryId: string;
      interval: number;
      scheduleId?: string;
    }) => {
      const itemIdToExpandedRowMapValues = { ...itemIdToExpandedRowMap };
      if (itemIdToExpandedRowMapValues[queryId]) {
        delete itemIdToExpandedRowMapValues[queryId];
      } else {
        itemIdToExpandedRowMapValues[queryId] = (
          <ScheduledQueryExpandedContent
            actionId={actionIdForQuery(queryId)}
            scheduleId={scheduleId}
            agentIds={agentIds}
            interval={interval}
          />
        );
      }

      setItemIdToExpandedRowMap(itemIdToExpandedRowMapValues);
    },
    [agentIds, itemIdToExpandedRowMap, actionIdForQuery]
  );

  const renderLastResultsColumn = useCallback(
    (item: PackQueryFormData) => (
      <ScheduledQueryLastResults
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        interval={item.interval}
      />
    ),
    [actionIdForQuery]
  );
  const renderDocsColumn = useCallback(
    (item: PackQueryFormData) => (
      <DocsColumnResults
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        interval={item.interval}
      />
    ),
    [actionIdForQuery]
  );
  const renderAgentsColumn = useCallback(
    (item: PackQueryFormData) => (
      <AgentsColumnResults
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        interval={item.interval}
      />
    ),
    [actionIdForQuery]
  );
  const renderErrorsColumn = useCallback(
    (item: PackQueryFormData) => (
      <ErrorsColumnResults
        queryId={item.id}
        interval={item.interval}
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        toggleErrors={toggleErrors}
        expanded={!!itemIdToExpandedRowMap[item.id]}
      />
    ),
    [itemIdToExpandedRowMap, actionIdForQuery, toggleErrors]
  );

  const renderDiscoverResultsAction = useCallback(
    (item: PackQueryFormData) => (
      <PackViewInDiscoverAction
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        interval={item.interval}
      />
    ),
    [actionIdForQuery]
  );

  const renderLensResultsAction = useCallback(
    (item: PackQueryFormData) => (
      <PackViewInLensAction
        actionId={actionIdForQuery(item.id)}
        scheduleId={item.schedule_id}
        interval={item.interval}
      />
    ),
    [actionIdForQuery]
  );

  const getItemId = useCallback((item: PackQueryFormData) => item.id ?? '', []);

  const columns = useMemo(
    () => [
      {
        field: 'id',
        name: i18n.translate('xpack.osquery.pack.queriesTable.idColumnTitle', {
          defaultMessage: 'ID',
        }),
        width: '15%',
        truncateText: true,
      },
      isRruleSchedulingEnabled
        ? {
            field: 'interval',
            name: i18n.translate('xpack.osquery.pack.queriesTable.scheduleColumnTitle', {
              defaultMessage: 'Schedule',
            }),
            render: renderScheduleColumn,
            width: '12%',
          }
        : {
            field: 'interval',
            name: i18n.translate('xpack.osquery.pack.queriesTable.intervalColumnTitle', {
              defaultMessage: 'Interval (s)',
            }),
            width: '80px',
          },
      {
        field: 'query',
        name: i18n.translate('xpack.osquery.pack.queriesTable.queryColumnTitle', {
          defaultMessage: 'Query',
        }),
        render: renderQueryColumn,
        width: '40%',
      },
      {
        name: i18n.translate('xpack.osquery.pack.queriesTable.lastResultsColumnTitle', {
          defaultMessage: 'Last results',
        }),
        render: renderLastResultsColumn,
        width: '12%',
      },
      {
        name: i18n.translate('xpack.osquery.pack.queriesTable.docsResultsColumnTitle', {
          defaultMessage: 'Docs',
        }),
        render: renderDocsColumn,
      },
      {
        name: i18n.translate('xpack.osquery.pack.queriesTable.agentsResultsColumnTitle', {
          defaultMessage: 'Agents',
        }),
        render: renderAgentsColumn,
      },
      {
        name: i18n.translate('xpack.osquery.pack.queriesTable.errorsResultsColumnTitle', {
          defaultMessage: 'Errors',
        }),
        render: renderErrorsColumn,
      },
      {
        name: i18n.translate('xpack.osquery.pack.queriesTable.viewResultsColumnTitle', {
          defaultMessage: 'View results',
        }),
        width: '90px',
        actions: [
          {
            render: renderDiscoverResultsAction,
          },
          {
            render: renderLensResultsAction,
          },
        ],
      },
    ],
    [
      isRruleSchedulingEnabled,
      renderScheduleColumn,
      renderQueryColumn,
      renderLastResultsColumn,
      renderDocsColumn,
      renderAgentsColumn,
      renderErrorsColumn,
      renderDiscoverResultsAction,
      renderLensResultsAction,
    ]
  );

  const sorting = useMemo(
    () => ({
      sort: {
        field: 'id' as keyof PackQueryFormData,
        direction: 'asc' as const,
      },
    }),
    []
  );

  return (
    <EuiBasicTable<PackQueryFormData>
      tableCaption={i18n.translate(
        'xpack.osquery.pack.queriesTable.packQueriesStatusTableCaption',
        {
          defaultMessage: 'Status of pack {packName} queries',
          values: { packName },
        }
      )}
      // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
      items={data ?? []}
      itemId={getItemId}
      columns={columns}
      sorting={sorting}
      itemIdToExpandedRowMap={itemIdToExpandedRowMap}
    />
  );
};

export const PackQueriesStatusTable = React.memo(PackQueriesStatusTableComponent);
