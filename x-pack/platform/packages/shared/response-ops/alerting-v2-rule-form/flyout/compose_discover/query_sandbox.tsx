/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiDataGrid,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiTabs,
  EuiText,
  EuiToolTip,
  type EuiDataGridColumn,
  type EuiDataGridCellValueElementProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { CodeEditor, ESQL_LANG_ID, type monaco } from '@kbn/code-editor';
import { useRuleFormServices } from '../../form/contexts/rule_form_context';
import { useQueryExecution } from './use_query_execution';
import { ComposeDiscoverChart } from './compose_discover_chart';
import {
  ComposeDiscoverTabs,
  QueryTabButton,
  TAB_DEFINITIONS,
  isAlertTabDisabled,
} from './compose_discover_tabs';
import type { QueryTab } from './types';
import { CpsPicker } from './cps_picker';
import { useResolveTimeField } from './use_resolve_time_field';

/**
 * Self-contained ES|QL sandbox that handles data fetching and renders the full
 * query preview UI: code editor (or multi-tab editors), date picker, search
 * button, chart, and results grid.
 *
 * ## Editor modes
 *
 * - **Single editor** (default) — when `tabs` is absent or empty, renders a
 *   plain `CodeEditor`. Pass `onQueryChange` to make it editable.
 * - **Multi-tab editors** — when `tabs` is non-empty (e.g. `['base', 'alert']`),
 *   renders `ComposeDiscoverTabs` with a tab bar. The `tabProps` fields drive
 *   the split query blocks.
 *
 * Requires `RuleFormProvider` and `QueryClientProvider` in the ancestor tree.
 */
export interface QuerySandboxProps {
  query: string;
  onQueryChange?: (query: string) => void;
  timeField: string;
  onTimeFieldChange?: (timeField: string) => void;
  dateRange: { dateStart: string; dateEnd: string };
  onDateRangeChange: (range: { dateStart: string; dateEnd: string }) => void;
  /** Execute the query on mount. */
  autoRun?: boolean;
  /**
   * When provided, time-field resolution is owned by the parent (e.g. compose
   * flyout) and the sandbox only displays the options without fetching.
   */
  timeFieldOptions?: Array<{ value: string; text: string }>;
  /** Required with `timeFieldOptions` when the parent gates autoRun on resolution. */
  isTimeFieldResolved?: boolean;
  /**
   * When provided, the editor panel renders `ComposeDiscoverTabs` with a tab
   * bar instead of a single `CodeEditor`. Absent or `[]` → single editor.
   */
  tabProps?: {
    tabs: QueryTab[];
    activeTab: QueryTab;
    onTabChange: (tab: QueryTab) => void;
    baseQuery: string;
    alertBlock: string;
    recoveryBlock: string;
    onBaseQueryChange: (v: string) => void;
    onAlertBlockChange: (v: string) => void;
    onRecoveryBlockChange: (v: string) => void;
    onAlertEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    onRecoveryEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    readOnly?: boolean;
  };
}

const VISIBLE_ROWS = 10;
const INITIAL_EDITOR_HEIGHT = 200;
const MIN_EDITOR_HEIGHT = 80;
const MAX_EDITOR_HEIGHT = 600;

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const RUN_SHORTCUT_LABEL = isMac ? '⌘⏎' : 'Ctrl+Enter';

export const QuerySandbox: React.FC<QuerySandboxProps> = ({
  query,
  onQueryChange,
  timeField,
  onTimeFieldChange,
  dateRange,
  onDateRangeChange,
  autoRun = false,
  timeFieldOptions: timeFieldOptionsProp,
  isTimeFieldResolved: isTimeFieldResolvedProp,
  tabProps,
}) => {
  const services = useRuleFormServices();
  const isReadOnly = !onQueryChange;
  const hasTabs = Boolean(tabProps?.tabs?.length);
  const skipTimeFieldResolution = timeFieldOptionsProp !== undefined;

  const splitTabs = useMemo(() => {
    if (!tabProps?.tabs?.length) return [];
    return TAB_DEFINITIONS.filter((t) => tabProps.tabs.includes(t.id));
  }, [tabProps?.tabs]);

  useEffect(() => {
    if (!tabProps?.tabs.includes('alert')) {
      return;
    }
    if (isAlertTabDisabled(tabProps.tabs, tabProps.baseQuery) && tabProps.activeTab === 'alert') {
      tabProps.onTabChange('base');
    }
  }, [tabProps]);

  const timeRange = useMemo(
    () => ({ from: dateRange.dateStart, to: dateRange.dateEnd }),
    [dateRange.dateStart, dateRange.dateEnd]
  );

  const {
    timeFieldOptions: resolvedTimeFieldOptions,
    isTimeFieldResolved: resolvedIsTimeFieldResolved,
  } = useResolveTimeField({
    query,
    timeField,
    onTimeFieldChange,
    enabled: !skipTimeFieldResolution,
    http: services.http,
    dataViews: services.dataViews,
  });

  const timeFieldOptions = timeFieldOptionsProp ?? resolvedTimeFieldOptions;
  const isTimeFieldResolved = isTimeFieldResolvedProp ?? resolvedIsTimeFieldResolved;

  const {
    columns,
    rows,
    totalRowCount,
    isLoading,
    isError,
    error,
    run,
    hasRun,
    lastExecutedQuery,
  } = useQueryExecution({
    query,
    timeField,
    timeRange,
    data: services.data,
  });

  const hasAutoRunRef = useRef(false);

  useEffect(() => {
    if (!autoRun || hasAutoRunRef.current || !isTimeFieldResolved) {
      return;
    }
    hasAutoRunRef.current = true;
    run();
  }, [autoRun, isTimeFieldResolved, run]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        run();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [run]);

  const gridColumns: EuiDataGridColumn[] = useMemo(
    () =>
      columns.map((col) => ({
        id: col.id,
        displayAsText: col.displayAsText,
        schema: col.esType,
      })),
    [columns]
  );

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  useEffect(() => {
    setVisibleColumns(columns.map((c) => c.id));
  }, [columns]);

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: VISIBLE_ROWS });
  const onChangePage = useCallback((pageIndex: number) => {
    setPagination((prev) => ({ ...prev, pageIndex }));
  }, []);
  const onChangeItemsPerPage = useCallback((pageSize: number) => {
    setPagination({ pageIndex: 0, pageSize });
  }, []);

  const renderCellValue = useCallback(
    ({ rowIndex, columnId }: EuiDataGridCellValueElementProps) => {
      const row = rows[rowIndex];
      if (!row) return null;
      const value = row[columnId];
      return <>{value ?? '—'}</>;
    },
    [rows]
  );

  const editorPanelStyles: React.CSSProperties = useMemo(
    () => ({
      resize: 'vertical',
      overflow: 'auto',
      height: INITIAL_EDITOR_HEIGHT,
      minHeight: MIN_EDITOR_HEIGHT,
      maxHeight: MAX_EDITOR_HEIGHT,
    }),
    []
  );

  return (
    <div data-test-subj="querySandbox">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
        <CpsPicker />
        <EuiFlexItem grow={false} style={{ width: 200, minWidth: 0 }}>
          <EuiSelect
            options={timeFieldOptions}
            value={timeField}
            aria-label={i18n.translate(
              'xpack.alertingV2.composeDiscover.querySandbox.timeFieldAriaLabel',
              { defaultMessage: 'Time field for rule execution' }
            )}
            onChange={(e) => onTimeFieldChange?.(e.target.value)}
            disabled={!onTimeFieldChange}
            compressed
            prepend={i18n.translate(
              'xpack.alertingV2.composeDiscover.querySandbox.timeFieldPrependLabel',
              { defaultMessage: 'Time field' }
            )}
            data-test-subj="querySandboxTimeField"
          />
        </EuiFlexItem>
        <EuiFlexItem grow>
          <EuiSuperDatePicker
            start={dateRange.dateStart}
            end={dateRange.dateEnd}
            onTimeChange={({ start, end }) => {
              onDateRangeChange({ dateStart: start, dateEnd: end });
            }}
            showUpdateButton={false}
            compressed
            width="full"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.searchTooltip', {
              defaultMessage: 'Search ({shortcut})',
              values: { shortcut: RUN_SHORTCUT_LABEL },
            })}
          >
            <EuiButton
              size="s"
              onClick={run}
              isLoading={isLoading}
              data-test-subj="querySandboxRunQuery"
            >
              {i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.searchButtonLabel', {
                defaultMessage: 'Search',
              })}
            </EuiButton>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      {splitTabs.length > 0 && tabProps && (
        <>
          <EuiTabs>
            {splitTabs.map((tab) => (
              <QueryTabButton
                key={tab.id}
                tab={tab}
                isSelected={tabProps.activeTab === tab.id}
                onSelect={(selectedTab) => {
                  if (
                    selectedTab === 'alert' &&
                    isAlertTabDisabled(tabProps.tabs, tabProps.baseQuery)
                  ) {
                    return;
                  }
                  tabProps.onTabChange(selectedTab);
                }}
                baseQuery={tabProps.baseQuery}
                tabs={tabProps.tabs}
                dataTestSubjPrefix="querySandboxTab"
              />
            ))}
          </EuiTabs>
          <EuiSpacer size="s" />
        </>
      )}

      <EuiPanel hasBorder paddingSize="s" style={{ ...editorPanelStyles }}>
        {tabProps && hasTabs ? (
          <ComposeDiscoverTabs
            baseQuery={tabProps.baseQuery}
            alertBlock={tabProps.alertBlock}
            recoveryBlock={tabProps.recoveryBlock}
            onBaseQueryChange={tabProps.onBaseQueryChange}
            onAlertBlockChange={tabProps.onAlertBlockChange}
            onRecoveryBlockChange={tabProps.onRecoveryBlockChange}
            activeTab={tabProps.activeTab}
            onTabChange={tabProps.onTabChange}
            tabs={tabProps.tabs}
            onAlertEditorMount={tabProps.onAlertEditorMount}
            onRecoveryEditorMount={tabProps.onRecoveryEditorMount}
            readOnly={tabProps.readOnly}
            hideTabBar
          />
        ) : (
          <CodeEditor
            languageId={ESQL_LANG_ID}
            value={query}
            onChange={(v) => onQueryChange?.(v)}
            height="100%"
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              fontSize: 13,
              readOnly: isReadOnly,
              domReadOnly: isReadOnly,
            }}
          />
        )}
      </EuiPanel>
      <EuiSpacer size="s" />

      {hasRun && !isLoading && !isError && (
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.resultCountLabel', {
            defaultMessage: '{count, plural, one {# result} other {# results}}',
            values: { count: totalRowCount },
          })}
        </EuiText>
      )}

      <EuiSpacer size="m" />

      {!hasRun && (
        <EuiEmptyPrompt
          iconType="playFilled"
          title={
            <h4>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.querySandbox.runPromptTitle"
                defaultMessage="Run your query to see results"
              />
            </h4>
          }
          body={
            <p>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.querySandbox.runPromptDescription"
                defaultMessage="Click <strong>Search</strong> or press <strong>{shortcut}</strong> to execute the query."
                values={{
                  shortcut: RUN_SHORTCUT_LABEL,
                  strong: (chunks) => <strong>{chunks}</strong>,
                }}
              />
            </p>
          }
        />
      )}

      {hasRun && isLoading && (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 200 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      )}

      {hasRun && isError && (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="error"
          title={i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.queryErrorTitle', {
            defaultMessage: 'Query error',
          })}
        >
          <p>{error}</p>
        </EuiCallOut>
      )}

      {hasRun && !isLoading && !isError && rows.length === 0 && query.trim() && (
        <EuiEmptyPrompt
          iconType="search"
          title={
            <h4>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.querySandbox.noResultsTitle"
                defaultMessage="No results"
              />
            </h4>
          }
          body={
            <p>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.querySandbox.noResultsDescription"
                defaultMessage="The query returned no results for the current time range."
              />
            </p>
          }
        />
      )}

      {hasRun && !isLoading && !isError && rows.length > 0 && (
        <>
          <ComposeDiscoverChart
            query={lastExecutedQuery ?? query}
            timeField={timeField}
            timeRange={timeRange}
            columns={columns}
          />

          <EuiSpacer size="m" />

          <EuiDataGrid
            aria-label={i18n.translate(
              'xpack.alertingV2.composeDiscover.querySandbox.queryResultsAriaLabel',
              { defaultMessage: 'Query results' }
            )}
            columns={gridColumns}
            columnVisibility={{ visibleColumns, setVisibleColumns }}
            rowCount={rows.length}
            renderCellValue={renderCellValue}
            pagination={{
              ...pagination,
              pageSizeOptions: [10, 25, 50],
              onChangePage,
              onChangeItemsPerPage,
            }}
            gridStyle={{ border: 'all', header: 'shade', fontSize: 's', cellPadding: 's' }}
            toolbarVisibility={{
              showColumnSelector: true,
              showSortSelector: true,
              showFullScreenSelector: false,
            }}
          />
        </>
      )}
    </div>
  );
};
