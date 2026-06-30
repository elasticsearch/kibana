/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { useRulePreview } from '../hooks/use_rule_preview';
import { QueryResultsGrid } from './query_results_grid';

/**
 * Rule results preview panel.
 *
 * Displays a live preview of the evaluation ES|QL query results as the user
 * configures the rule form. Includes a chart histogram above the data grid
 * when results are available. Delegates rendering to `QueryResultsGrid`.
 */
export const RuleResultsPreview = () => {
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
    additionalFilter,
    refetch,
  } = useRulePreview();

  return (
    <QueryResultsGrid
      title={i18n.translate('xpack.alertingV2.ruleForm.ruleResultsPreview.title', {
        defaultMessage: 'Rule results preview',
      })}
      dataTestSubj="ruleResultsPreviewGrid"
      emptyBody={i18n.translate('xpack.alertingV2.ruleForm.ruleResultsPreview.emptyBody', {
        defaultMessage:
          'Configure a base query, time field, and lookback window to see a preview of matching results.',
      })}
      noResultsBody={i18n.translate('xpack.alertingV2.ruleForm.ruleResultsPreview.noResultsBody', {
        defaultMessage:
          'The query returned no results for the configured lookback window. Try adjusting the query or lookback period.',
      })}
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
      additionalFilter={additionalFilter}
      onRunQuery={refetch}
    />
  );
};
