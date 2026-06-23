/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

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
  EuiSpacer,
  EuiStat,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiIconTip,
} from '@elastic/eui';
import { max, min } from 'lodash';
import type { ESQLColumn } from '@kbn/es-types';
import { isNumericType } from '@kbn/esql-language';
import { EMPTY_LABEL } from '@kbn/field-formats-common';
import { ChooseColumnPopover } from './choose_column_popover';
import { DataControlEditorStrings } from '../data_control_constants';

export const ESQLValuesPreview: React.FC<{
  previewOptions: string[] | number[];
  previewColumns: ESQLColumn[];
  previewError?: Error;
  updateQuery: (column: string) => void;
  queryNeedsRunning: boolean;
  isQueryRunning: boolean;
  dataSource: string;
}> = ({
  previewOptions,
  previewError,
  previewColumns,
  updateQuery,
  queryNeedsRunning,
  isQueryRunning,
  dataSource,
}) => {
  const isEmpty = useMemo(() => previewOptions.length === 0, [previewOptions]);

  const multiColumnResult = useMemo(() => previewColumns.length > 1, [previewColumns]);
  const singleColumn = useMemo(
    () => (previewColumns.length === 1 ? previewColumns[0] : null),
    [previewColumns]
  );

  const range = useMemo(() => {
    if (isNumericType(singleColumn?.type)) {
      const optionsAsNumbers = previewOptions.map((v) => Number(v));
      return { min: min(optionsAsNumbers), max: max(optionsAsNumbers) };
    }
    return null;
  }, [previewOptions, singleColumn]);

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
        title={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getErrorTitle()}
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
        title={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getMultiColumnErrorTitle()}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlMoreThanOneColumnCallout"
      >
        <p>
          {DataControlEditorStrings.manageControl.dataSource.valuesPreview.getMultiColumnErrorBody(
            previewColumns.length
          )}
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
        title={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getEmptyTitle()}
        color="warning"
        iconType="warning"
        size="s"
        data-test-subj="esqlMoreThanOneColumnCallout"
      >
        <p>{DataControlEditorStrings.manageControl.dataSource.valuesPreview.getEmptyText()}</p>
      </EuiCallOut>
    </EuiPanel>
  ) : range ? (
    <EuiFlexGrid columns={2} data-test-subj="esqlValuesPreviewRange">
      <EuiStat
        titleSize="s"
        title={range.min}
        description={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getMinText()}
      />
      <EuiStat
        titleSize="s"
        title={range.max}
        description={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getMaxText()}
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
      {singleColumn && (
        <>
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiFormRow
                label={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getDataSourceLabel()}
              >
                <EuiCode>{dataSource}</EuiCode>
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={
                  <>
                    {DataControlEditorStrings.manageControl.dataSource.valuesPreview.getFieldLabel()}{' '}
                    <EuiIconTip
                      type="question"
                      color="primary"
                      content={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getFieldTooltip()}
                    />
                  </>
                }
              >
                <EuiCode>{singleColumn.name}</EuiCode>
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}
      {!queryNeedsRunning && (
        <EuiFormRow
          label={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getTitle()}
        >
          {body}
        </EuiFormRow>
      )}
    </>
  );
};
