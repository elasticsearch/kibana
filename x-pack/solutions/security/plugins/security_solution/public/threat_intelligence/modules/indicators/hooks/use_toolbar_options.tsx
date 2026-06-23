/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { EuiDataGridColumn } from '@elastic/eui';
import { EuiButtonIcon, EuiText, EuiToolTip } from '@elastic/eui';
import type { BrowserField } from '@kbn/rule-registry-plugin/common';
import { useInspector } from '../../../hooks/use_inspector';
import { IndicatorsFieldBrowser } from '../components/table/field_browser';
import { INSPECT_BUTTON_TEST_ID } from './test_ids';
import { INSPECT_BUTTON_TITLE, translatePaginationStatus } from './translations';

export const useToolbarOptions = ({
  browserFields,
  start,
  end,
  indicatorCount,
  columns,
  onResetColumns,
  onToggleColumn,
}: {
  browserFields: Readonly<Record<string, Partial<BrowserField>>>;
  start: number;
  end: number;
  indicatorCount: number;
  columns: EuiDataGridColumn[];
  onResetColumns: () => void;
  onToggleColumn: (columnId: string) => void;
}) => {
  const { onOpenInspector: handleOpenInspector } = useInspector();

  return useMemo(
    () => ({
      showDisplaySelector: false,
      showFullScreenSelector: true,
      additionalControls: {
        left: {
          prepend: (
            <EuiText css={{ display: 'inline' }} size="xs">
              {indicatorCount && end ? (
                <>{translatePaginationStatus({ start, end, indicatorCount })}</>
              ) : (
                <>{'-'}</>
              )}
            </EuiText>
          ),
          append: (
            <IndicatorsFieldBrowser
              browserFields={browserFields}
              columnIds={columns.map(({ id }) => id)}
              onResetColumns={onResetColumns}
              onToggleColumn={onToggleColumn}
            />
          ),
        },
        right: (
          <EuiToolTip content={INSPECT_BUTTON_TITLE} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={INSPECT_BUTTON_TITLE}
              iconType="inspect"
              data-test-subj={INSPECT_BUTTON_TEST_ID}
              onClick={handleOpenInspector}
            />
          </EuiToolTip>
        ),
      },
    }),
    [
      indicatorCount,
      end,
      start,
      browserFields,
      columns,
      onResetColumns,
      onToggleColumn,
      handleOpenInspector,
    ]
  );
};
