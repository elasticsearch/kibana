/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSuperDatePicker } from '@elastic/eui';
import type { IUnifiedSearchPluginServices } from '@kbn/unified-search-plugin/public';
import styled from '@emotion/styled';
import type { EuiSuperDatePickerRecentRange } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type {
  DurationRange,
  OnRefreshChangeProps,
} from '@elastic/eui/src/components/date_picker/types';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';

export interface DateRangePickerValues {
  autoRefreshOptions: {
    enabled: boolean;
    duration: number;
  };
  startDate: string;
  endDate: string;
  recentlyUsedDateRanges: EuiSuperDatePickerRecentRange[];
}

const DatePickerWrapper = styled.div`
  padding-bottom: ${(props) => props.theme.euiTheme.size.l};
`;

export const ActionLogDateRangePicker = memo(
  ({
    dateRangePickerState,
    isDataLoading,
    onRefresh,
    onRefreshChange,
    onTimeChange,
    'data-test-subj': dataTestSubj,
  }: {
    dateRangePickerState: DateRangePickerValues;
    isDataLoading: boolean;
    onRefresh: () => void;
    onRefreshChange: (evt: OnRefreshChangeProps) => void;
    onTimeChange: ({ start, end }: DurationRange) => void;
    'data-test-subj'?: string;
  }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const kibana = useKibana<IUnifiedSearchPluginServices>();
    const { uiSettings } = kibana.services;
    const [commonlyUsedRanges] = useState(() => {
      return (
        uiSettings
          ?.get(UI_SETTINGS.TIMEPICKER_QUICK_RANGES)
          ?.map(({ from, to, display }: { from: string; to: string; display: string }) => {
            return {
              start: from,
              end: to,
              label: display,
            };
          }) ?? []
      );
    });

    return (
      <DatePickerWrapper data-test-subj={getTestId('super-date-picker')}>
        <EuiFlexGroup alignItems="center" direction="row" responsive={false} gutterSize="s">
          <EuiFlexItem>
            <EuiSuperDatePicker
              isLoading={isDataLoading}
              dateFormat={uiSettings.get('dateFormat')}
              commonlyUsedRanges={commonlyUsedRanges}
              end={dateRangePickerState.endDate}
              isPaused={!dateRangePickerState.autoRefreshOptions.enabled}
              onTimeChange={onTimeChange}
              onRefreshChange={onRefreshChange}
              refreshInterval={dateRangePickerState.autoRefreshOptions.duration}
              onRefresh={onRefresh}
              recentlyUsedRanges={dateRangePickerState.recentlyUsedDateRanges}
              start={dateRangePickerState.startDate}
              showUpdateButton={false}
              updateButtonProps={{ iconOnly: true, fill: false }}
              width="auto"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </DatePickerWrapper>
    );
  }
);

ActionLogDateRangePicker.displayName = 'ActionLogDateRangePicker';
