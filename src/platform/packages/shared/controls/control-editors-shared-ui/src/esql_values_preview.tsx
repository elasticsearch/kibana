/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactElement } from 'react';
import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiCallOut,
  EuiCode,
  EuiFlexGrid,
  EuiFormRow,
  EuiPanel,
  EuiStat,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { max, min } from 'lodash';
import type { ESQLColumn } from '@kbn/es-types';
import { isNumericType } from '@kbn/esql-language';
import { EMPTY_LABEL } from '@kbn/field-formats-common';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ChooseColumnPopover } from './choose_column_popover';

export const ESQLValuesPreview: React.FC<{
  previewOptions: string[] | number[];
  previewColumns: ESQLColumn[];
  previewError?: Error;
  updateQuery: (column: string) => void;
  isQueryRunning: boolean;
  header?: ReactElement;
  useRange?: boolean;
}> = ({
  previewOptions,
  previewError,
  previewColumns,
  updateQuery,
  isQueryRunning,
  header,
  useRange = true, // TODO: Remove when variable controls can produce range sliders
}) => {
  const isEmpty = useMemo(() => previewOptions.length === 0, [previewOptions]);

  const multiColumnResult = useMemo(() => previewColumns.length > 1, [previewColumns]);
  const singleColumn = useMemo(
    () => (previewColumns.length === 1 ? previewColumns[0] : null),
    [previewColumns]
  );

  const range = useMemo(() => {
    if (!useRange) return null;
    if (isNumericType(singleColumn?.type)) {
      const optionsAsNumbers = previewOptions.map((v) => Number(v));
      return { min: min(optionsAsNumbers), max: max(optionsAsNumbers) };
    }
    return null;
  }, [previewOptions, singleColumn, useRange]);

  const body = previewError ? (
    <EuiPanel
      hasBorder
      paddingSize="xs"
      color="danger"
      css={css`
        text-align: center;
      `}
    >
      <EuiCallOut
        announceOnMount
        title={i18n.translate('controls.editorsSharedUi.valuesPreview.errorTitle', {
          defaultMessage: 'Error getting values preview',
        })}
        color="danger"
        iconType="error"
        size="s"
      >
        <p>{previewError.message}</p>
      </EuiCallOut>
    </EuiPanel>
  ) : multiColumnResult ? (
    <EuiPanel
      hasBorder
      paddingSize="xs"
      color="warning"
      css={css`
        text-align: center;
      `}
    >
      <EuiCallOut
        announceOnMount
        title={i18n.translate('controls.editorsSharedUi.valuesPreview.multiColumnErrorTitle', {
          defaultMessage: 'Query must return a single column',
        })}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlMoreThanOneColumnCallout"
      >
        <p>
          <FormattedMessage
            id="controls.editorsSharedUi.valuesPreview.multiColumnErrorBody"
            defaultMessage="Your query is currently returning {totalColumns} columns. Choose a column, or use {statsBy} to narrow your query down."
            values={{
              totalColumns: previewColumns.length,
              statsBy: <EuiCode>STATS BY</EuiCode>,
            }}
          />
        </p>
        <ChooseColumnPopover columns={previewColumns} updateQuery={updateQuery} />
      </EuiCallOut>
    </EuiPanel>
  ) : isEmpty ? (
    <EuiPanel
      hasBorder
      paddingSize="xs"
      color="warning"
      css={css`
        text-align: center;
      `}
    >
      <EuiCallOut
        announceOnMount
        title={i18n.translate('controls.editorsSharedUi.valuesPreview.emptyTitle', {
          defaultMessage: 'No values returned',
        })}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlMoreThanOneColumnCallout"
      >
        <p>
          {i18n.translate('controls.editorsSharedUi.valuesPreview.emptyText', {
            defaultMessage: "This query isn't returning any values. Edit it and run it again.",
          })}
        </p>
      </EuiCallOut>
    </EuiPanel>
  ) : range ? (
    <EuiFlexGrid columns={2} data-test-subj="esqlValuesPreviewRange">
      <EuiStat
        titleSize="s"
        title={range.min}
        description={i18n.translate('controls.editorsSharedUi.valuesPreview.minText', {
          defaultMessage: 'Minimum value',
        })}
      />
      <EuiStat
        titleSize="s"
        title={range.max}
        description={i18n.translate('controls.editorsSharedUi.valuesPreview.maxText', {
          defaultMessage: 'Maximum value',
        })}
      />
    </EuiFlexGrid>
  ) : (
    <div
      style={{
        maxHeight: '200px',
        overflow: 'auto',
      }}
    >
      <EuiBadgeGroup data-test-subj="esqlValuesPreviewStrings">
        {previewOptions.map((option, i) => (
          <EuiBadge key={`${i}-${option}`}>{option === '' ? EMPTY_LABEL : option}</EuiBadge>
        ))}
      </EuiBadgeGroup>
    </div>
  );

  return isQueryRunning ? (
    <EuiPanel
      hasBorder={false}
      hasShadow={false}
      paddingSize="xl"
      css={css`
        text-align: center;
      `}
    >
      <EuiLoadingSpinner size="l" />
    </EuiPanel>
  ) : (
    <>
      {header}
      <EuiFormRow
        fullWidth
        label={i18n.translate('controls.editorsSharedUi.valuesPreview.title', {
          defaultMessage: 'Values preview',
        })}
      >
        {body}
      </EuiFormRow>
    </>
  );
};
