/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { EuiBadge, EuiBadgeGroup, EuiCallOut, EuiCode, EuiFlexGrid, EuiStat } from '@elastic/eui';
import { max, min } from 'lodash';
import type { ESQLColumn } from '@kbn/es-types';
import { isNumericType } from '@kbn/esql-language';
import { EMPTY_LABEL } from '@kbn/field-formats-common';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ChooseColumnPopover } from './choose_column_popover';

export const ESQLValuesPreview: React.FC<{
  // The raw values returned by the query — shown as badges or a range stat
  values: string[] | number[];
  // Columns returned by the query — used to detect multi-column errors and determine value type
  columns: ESQLColumn[];
  // Query execution error; when set, renders an error callout instead of values
  error?: Error;
  updateQuery: (column: string) => void;
  // When true and the column is numeric, renders a min/max range stat instead of badges
  isRangeControl?: boolean;
}> = ({ values, error, columns, updateQuery, isRangeControl }) => {
  const range = useMemo(() => {
    if (!isRangeControl || !isNumericType(columns?.[0]?.type)) return;

    const valuesAsNumbers = values.map((v) => Number(v));
    return { min: min(valuesAsNumbers), max: max(valuesAsNumbers) };
  }, [values, isRangeControl, columns]);

  if (error) {
    return (
      <EuiCallOut
        announceOnMount
        title={i18n.translate('esqlUtils.valuesPreview.errorTitle', {
          defaultMessage: 'Error getting values preview',
        })}
        color="danger"
        iconType="error"
        size="s"
      >
        <p>{error.message}</p>
      </EuiCallOut>
    );
  }

  if (columns.length > 1) {
    return (
      <EuiCallOut
        announceOnMount
        title={i18n.translate('esqlUtils.valuesPreview.multiColumnErrorTitle', {
          defaultMessage: 'Query must return a single column',
        })}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlMoreThanOneColumnCallout"
      >
        <FormattedMessage
          id="esqlUtils.valuesPreview.multiColumnErrorBody"
          defaultMessage="Your query is currently returning {totalColumns} columns. Choose a column, or use {statsBy} to narrow your query down."
          values={{
            totalColumns: columns.length,
            statsBy: <EuiCode>STATS BY</EuiCode>,
          }}
        />
        <ChooseColumnPopover columns={columns} updateQuery={updateQuery} />
      </EuiCallOut>
    );
  }

  if (values.length === 0) {
    return (
      <EuiCallOut
        announceOnMount
        title={i18n.translate('esqlUtils.valuesPreview.emptyTitle', {
          defaultMessage: 'No values returned',
        })}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlNoValuesForControlCallout"
      >
        <p>
          {i18n.translate('esqlUtils.valuesPreview.emptyText', {
            defaultMessage: "This query isn't returning any values. Edit it and run it again.",
          })}
        </p>
      </EuiCallOut>
    );
  }

  if (range) {
    return (
      <EuiFlexGrid columns={2} data-test-subj="esqlValuesPreviewRange">
        <EuiStat
          titleSize="s"
          title={range.min}
          description={i18n.translate('esqlUtils.valuesPreview.minText', {
            defaultMessage: 'Minimum value',
          })}
        />
        <EuiStat
          titleSize="s"
          title={range.max}
          description={i18n.translate('esqlUtils.valuesPreview.maxText', {
            defaultMessage: 'Maximum value',
          })}
        />
      </EuiFlexGrid>
    );
  }

  const visibleOptions = values.slice(0, 10);
  const hiddenCount = values.length - visibleOptions.length;

  return (
    <div>
      <EuiBadgeGroup data-test-subj="esqlValuesPreviewStrings">
        {visibleOptions.map((option, i) => (
          <EuiBadge key={`${i}-${option}`}>{option === '' ? EMPTY_LABEL : option}</EuiBadge>
        ))}
      </EuiBadgeGroup>
      {hiddenCount > 0 && (
        <p>
          {i18n.translate('esqlUtils.valuesPreview.hiddenCount', {
            defaultMessage: '+{hiddenCount} more',
            values: { hiddenCount },
          })}
        </p>
      )}
    </div>
  );
};
