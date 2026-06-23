/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiDataGridColumnCellAction, EuiDataGridColumnCellActionProps } from '@elastic/eui';
import { EuiBasicTable, EuiPopover, EuiPopoverTitle, EuiText, EuiTitle } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { getCalleeFunction } from '@kbn/profiling-utils';
import type { SelectedFrame } from '.';
import { getFrameIdentification, isComparisonColumn } from '.';
import type { IFunctionRow } from '../topn_functions/utils';

interface Props {
  baseRows: IFunctionRow[];
  comparisonRows: IFunctionRow[];
  selectedFrame?: SelectedFrame;
  onClick: (selectedFrame?: SelectedFrame) => void;
}

export const getCompareFrameAction =
  ({ baseRows, comparisonRows, selectedFrame, onClick }: Props): EuiDataGridColumnCellAction =>
  ({ rowIndex, columnId, Component }: EuiDataGridColumnCellActionProps) => {
    const isComparison = isComparisonColumn(columnId);
    const currentRow = isComparison ? comparisonRows[rowIndex] : baseRows[rowIndex];
    if (currentRow === undefined) {
      return null;
    }
    const currentFrameId = getFrameIdentification(currentRow.frame);

    const isOpen = selectedFrame
      ? selectedFrame.currentFrameId === currentFrameId &&
        selectedFrame.isComparison === isComparison
      : false;

    const compareRow = isComparison
      ? baseRows.find((item) => getFrameIdentification(item.frame) === currentFrameId)
      : comparisonRows.find((item) => getFrameIdentification(item.frame) === currentFrameId);

    return (
      <EuiPopover
        aria-label={i18n.translate('xpack.profiling.compareFrame.popoverAriaLabel', {
          defaultMessage: 'Corresponding frame',
        })}
        button={
          <Component
            onClick={() => {
              onClick({ currentFrameId, isComparison });
            }}
            iconType="inspect"
          >
            {i18n.translate('xpack.profiling.compareFrame.component.findLabel', {
              defaultMessage: 'Find corresponding frame',
            })}
          </Component>
        }
        isOpen={isOpen}
        closePopover={() => {
          onClick(undefined);
        }}
        anchorPosition="upRight"
        css={css`
          .euiPopover__anchor {
            align-items: start;
            display: flex;
          }
        `}
      >
        {compareRow ? (
          <div style={{ maxWidth: 400 }}>
            <EuiPopoverTitle paddingSize="s">
              {isComparison
                ? i18n.translate('xpack.profiling.diffTopNFunctions.baseLineFunction', {
                    defaultMessage: 'Baseline function',
                  })
                : i18n.translate('xpack.profiling.diffTopNFunctions.comparisonLineFunction', {
                    defaultMessage: 'Comparison function',
                  })}
            </EuiPopoverTitle>
            <EuiTitle size="xs">
              <EuiText>{getCalleeFunction(compareRow.frame)}</EuiText>
            </EuiTitle>
            <EuiBasicTable
              items={[compareRow]}
              columns={[
                { field: 'rank', name: 'Rank' },
                {
                  field: 'samples',
                  name: 'Samples',
                  render: (_, value) => value.samples.toLocaleString(),
                },
                {
                  field: 'selfCPUPerc',
                  name: 'Self CPU',
                  render: (_, value) => `${value.selfCPUPerc.toFixed(2)}%`,
                },
                {
                  field: 'totalCPUPerc',
                  name: 'Total CPU',
                  render: (_, value) => `${value.totalCPUPerc.toFixed(2)}%`,
                },
              ]}
              tableCaption={i18n.translate(
                'xpack.profiling.diffTopNFunctions.compareFrameMetricsCaption',
                {
                  defaultMessage: 'Frame metrics',
                }
              )}
            />
          </div>
        ) : (
          <EuiText color="subdued" size="s">
            {i18n.translate('xpack.profiling.diffTopNFunctions.noCorrespondingValueFound', {
              defaultMessage: 'No corresponding value found',
            })}
          </EuiText>
        )}
      </EuiPopover>
    );
  };
