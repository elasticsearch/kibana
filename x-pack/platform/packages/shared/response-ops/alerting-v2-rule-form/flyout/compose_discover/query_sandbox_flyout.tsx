/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/code-editor';
import type { RuleQuery } from './compose_form_types';
import { getBreachQuery } from './compose_form_types';
import type { QueryTab } from './types';
import { QuerySandbox } from './query_sandbox';
import type { QuerySandboxProps } from './query_sandbox';

/**
 * Props for the Discover Sandbox flyout — a full-screen ES|QL editor with live
 * query execution, time-range selection, and a results grid.
 *
 * ## Usage modes
 *
 * **Compose Discover flyout (editable)** — pass `query`, `onQueryChange`, and `onApply`.
 * The parent holds the editing buffer; Apply commits it to RHF.
 *
 * **Preview / read-only** — omit `onQueryChange` (makes all editors read-only) and
 * omit `onApply` (hides the Apply button). Only the close button is shown.
 *
 * **Edit without Apply** — pass `onQueryChange` but omit `onApply`. The flyout has
 * editors but no Apply button; the caller commits on its own terms.
 *
 * ## State ownership
 *
 * `QuerySandboxFlyout` is a **props-only component** — it owns no query state.
 * The parent holds `query`, `timeField`, and `dateRange` as separate `useState`s and
 * passes them down. `query` and `timeField` reset to committed RHF values on close;
 * `dateRange` persists across open/close cycles.
 */
export interface QuerySandboxFlyoutProps {
  /** The live query being edited. Shape drives the split-editor layout. */
  query: RuleQuery;
  /** Called on every editor change. Absent → all query editors are read-only. */
  onQueryChange?: (q: RuleQuery) => void;
  /**
   * Which tabs to show. Absent or [] → single editor, no tab bar.
   * ['base', 'alert'] → base-alert split; ['recovery'] → recovery tab only.
   */
  tabs?: QueryTab[];
  /** Active tab — ignored when tabs is absent/[]. */
  activeTab?: QueryTab;
  /** Should always be provided when tabs is non-empty — without it tab clicks are no-ops. */
  onTabChange?: (tab: QueryTab) => void;
  timeField: string;
  /** Absent → time field selector is read-only. */
  onTimeFieldChange?: (tf: string) => void;
  /** When provided, resolution is owned by the parent and passed through to QuerySandbox. */
  timeFieldOptions?: Array<{ value: string; text: string }>;
  isTimeFieldResolved?: boolean;
  /** Preview date range. Never resets on close — caller owns persistence. */
  dateRange: { dateStart: string; dateEnd: string };
  /** Always required — date range is always interactive. */
  onDateRangeChange: (r: { dateStart: string; dateEnd: string }) => void;
  /** When provided an Apply button is shown. No-args: caller already holds current state. */
  onApply?: () => void;
  onClose: () => void;
  title?: string;
  onAlertEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  onRecoveryEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

const QUERY_SANDBOX_TITLE_ID = 'composeDiscoverChildTitle';

export const QuerySandboxFlyout: React.FC<QuerySandboxFlyoutProps> = ({
  query,
  onQueryChange,
  tabs,
  activeTab = 'alert',
  onTabChange,
  timeField,
  onTimeFieldChange,
  timeFieldOptions,
  isTimeFieldResolved,
  dateRange,
  onDateRangeChange,
  onApply,
  onClose,
  onAlertEditorMount,
  onRecoveryEditorMount,
  title = i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.defaultTitle', {
    defaultMessage: 'Query sandbox',
  }),
}) => {
  const isReadOnly = !onQueryChange;

  const queryFields = useMemo(
    () =>
      query.format === 'composed'
        ? {
            base: query.base,
            breach: query.breach.segment,
            recover: query.recovery?.segment ?? '',
          }
        : {
            base: query.no_data?.query ?? '',
            breach: query.breach.query,
            recover: query.recovery?.query ?? '',
          },
    [query]
  );

  const updateQuery = useCallback(
    (patch: { base?: string; breach?: string; recover?: string }) => {
      if (!onQueryChange) return;
      const next = { ...queryFields, ...patch };
      onQueryChange(
        query.format === 'composed'
          ? {
              format: 'composed',
              base: next.base,
              breach: { segment: next.breach },
              ...(next.recover ? { recovery: { segment: next.recover } } : {}),
            }
          : {
              format: 'standalone',
              breach: { query: next.breach },
              ...(next.base ? { no_data: { query: next.base } } : {}),
              ...(next.recover ? { recovery: { query: next.recover } } : {}),
            }
      );
    },
    [query, queryFields, onQueryChange]
  );

  const activeQuery = query.format === 'composed' ? getBreachQuery(query) : query.breach.query;

  const handleQueryChange = useCallback((v: string) => updateQuery({ breach: v }), [updateQuery]);

  const tabProps: QuerySandboxProps['tabProps'] = useMemo(() => {
    if (!tabs?.length) return undefined;
    return {
      tabs,
      activeTab,
      onTabChange: onTabChange ?? (() => {}),
      baseQuery: queryFields.base,
      alertBlock: queryFields.breach,
      recoveryBlock: queryFields.recover,
      onBaseQueryChange: (v: string) => updateQuery({ base: v }),
      onAlertBlockChange: (v: string) => updateQuery({ breach: v }),
      onRecoveryBlockChange: (v: string) => updateQuery({ recover: v }),
      onAlertEditorMount,
      onRecoveryEditorMount,
      readOnly: isReadOnly,
    };
  }, [
    tabs,
    activeTab,
    onTabChange,
    queryFields,
    updateQuery,
    onAlertEditorMount,
    onRecoveryEditorMount,
    isReadOnly,
  ]);

  return (
    <EuiFlyout
      type="overlay"
      size="fill"
      onClose={onClose}
      aria-labelledby={QUERY_SANDBOX_TITLE_ID}
      closeButtonProps={{ 'data-test-subj': 'querySandboxClose' }}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s" id={QUERY_SANDBOX_TITLE_ID}>
          <h3>{title}</h3>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <QuerySandbox
          query={activeQuery}
          onQueryChange={isReadOnly ? undefined : handleQueryChange}
          timeField={timeField}
          onTimeFieldChange={onTimeFieldChange}
          timeFieldOptions={timeFieldOptions}
          isTimeFieldResolved={isTimeFieldResolved}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          autoRun
          tabProps={tabProps}
        />
      </EuiFlyoutBody>

      {onApply && (
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButton fill onClick={onApply} data-test-subj="querySandboxApply">
                {i18n.translate('xpack.alertingV2.composeDiscover.querySandbox.applyButtonLabel', {
                  defaultMessage: 'Apply changes',
                })}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      )}
    </EuiFlyout>
  );
};
