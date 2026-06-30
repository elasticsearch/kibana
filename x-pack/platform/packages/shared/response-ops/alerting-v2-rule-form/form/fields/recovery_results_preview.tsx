/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { useRecoveryPreview } from '../hooks/use_recovery_preview';
import { QueryResultsGrid } from './query_results_grid';

/**
 * Recovery results preview panel.
 *
 * Displays a live preview of the recovery ES|QL query results. Shown when
 * the recovery policy type is `'query'`. Includes a chart histogram above
 * the data grid when results are available. Delegates rendering to
 * `QueryResultsGrid`.
 */
export const RecoveryResultsPreview = () => {
  const {
    columns,
    rows,
    totalRowCount,
    isLoading,
    isError,
    error,
    groupingFields,
    uniqueGroupCount,
    hasValidQuery,
    query,
    timeField,
    interval,
    lookback,
    refetch,
  } = useRecoveryPreview();

  return (
    <QueryResultsGrid
      title={i18n.translate('xpack.alertingV2.ruleForm.recoveryResultsPreview.title', {
        defaultMessage: 'Recovery results preview',
      })}
      dataTestSubj="recoveryResultsPreviewGrid"
      emptyBody={i18n.translate('xpack.alertingV2.ruleForm.recoveryResultsPreview.emptyBody', {
        defaultMessage:
          'Configure a recovery query to see a preview of results that would resolve active alerts.',
      })}
      noResultsBody={i18n.translate(
        'xpack.alertingV2.ruleForm.recoveryResultsPreview.noResultsBody',
        {
          defaultMessage:
            'The recovery query returned no results for the configured lookback window. Try adjusting the recovery query or lookback period.',
        }
      )}
      columns={columns}
      rows={rows}
      totalRowCount={totalRowCount}
      isLoading={isLoading}
      isError={isError}
      error={error}
      groupingFields={groupingFields}
      uniqueGroupCount={uniqueGroupCount}
      hasValidQuery={hasValidQuery}
      query={query}
      timeField={timeField}
      interval={interval}
      lookback={lookback}
      onRunQuery={refetch}
    />
  );
};
