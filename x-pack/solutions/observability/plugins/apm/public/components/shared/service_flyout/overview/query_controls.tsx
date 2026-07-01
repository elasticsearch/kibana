/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiSuperDatePicker,
} from '@elastic/eui';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { i18n } from '@kbn/i18n';
import React, { useEffect, useMemo } from 'react';
import { ApmDocumentType } from '../../../../../common/document_type';
import type { Environment } from '../../../../../common/environment_rt';
import { getTransactionType } from '../../../../context/apm_service/apm_service_context';
import { useServiceTransactionTypesFetcher } from '../../../../context/apm_service/use_service_transaction_types_fetcher';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useEnvironmentsFetcher } from '../../../../hooks/use_environments_fetcher';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { useTimeRange } from '../../../../hooks/use_time_range';
import type { TimePickerQuickRange } from '../../date_picker/typings';
import { EnvironmentSelect } from '../../environment_select';

interface ServiceFlyoutQueryControlsProps {
  agentName?: string;
  environment: Environment;
  serviceName: string;
  kuery: string;
  rangeFrom: string;
  rangeTo: string;
  transactionType: string;
  onEnvironmentChange: (environment: Environment) => void;
  onTransactionTypeChange: (transactionType: string) => void;
  onRangeChange: (range: { rangeFrom: string; rangeTo: string }) => void;
  onRefresh: () => void;
}

export function ServiceFlyoutQueryControls({
  agentName,
  environment,
  serviceName,
  kuery,
  rangeFrom,
  rangeTo,
  transactionType,
  onEnvironmentChange,
  onTransactionTypeChange,
  onRangeChange,
  onRefresh,
}: ServiceFlyoutQueryControlsProps) {
  const { core } = useApmPluginContext();

  const { start = '', end = '' } = useTimeRange({ rangeFrom, rangeTo, optional: true });

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.TransactionMetric,
    numBuckets: 100,
  });

  const { transactionTypes, status: transactionTypeStatus } = useServiceTransactionTypesFetcher({
    serviceName,
    start,
    end,
    documentType: preferred?.source.documentType,
    rollupInterval: preferred?.source.rollupInterval,
  });

  const { environments, status: environmentsStatus } = useEnvironmentsFetcher({
    serviceName,
    start,
    end,
  });

  const commonlyUsedRanges = useMemo(() => {
    const timePickerQuickRanges =
      core?.uiSettings?.get<TimePickerQuickRange[]>(UI_SETTINGS.TIMEPICKER_QUICK_RANGES) ?? [];

    return timePickerQuickRanges.map(({ from, to, display }) => ({
      start: from,
      end: to,
      label: display,
    }));
  }, [core?.uiSettings]);

  const selectedTransactionType = useMemo(
    () => getTransactionType({ transactionType, transactionTypes, agentName }),
    [agentName, transactionType, transactionTypes]
  );

  useEffect(() => {
    if (selectedTransactionType !== undefined && selectedTransactionType !== transactionType) {
      onTransactionTypeChange(selectedTransactionType);
    }
  }, [onTransactionTypeChange, selectedTransactionType, transactionType]);

  const transactionTypeOptions = transactionTypes.map((type) => ({ value: type, text: type }));
  const isTransactionTypeDisabled =
    transactionTypeStatus === FETCH_STATUS.LOADING || transactionTypeOptions.length === 0;

  return (
    <EuiPanel data-test-subj="serviceFlyoutQueryControls" hasShadow={false} paddingSize="none">
      <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiSuperDatePicker
            start={start || rangeFrom}
            end={end || rangeTo}
            onTimeChange={({ start: nextRangeFrom, end: nextRangeTo }) => {
              onRangeChange({ rangeFrom: nextRangeFrom, rangeTo: nextRangeTo });
            }}
            onRefresh={onRefresh}
            showUpdateButton
            updateButtonProps={{ fill: false }}
            commonlyUsedRanges={commonlyUsedRanges}
            width="full"
            compressed
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiSpacer size="xs" />
          <EuiFlexGrid columns={2} gutterSize="s">
            <EuiFlexItem>
              <EuiSelect
                compressed
                fullWidth
                prepend={i18n.translate('xpack.apm.serviceFlyout.transactionTypeSelectLabel', {
                  defaultMessage: 'Transaction type',
                })}
                aria-label={i18n.translate(
                  'xpack.apm.serviceFlyout.transactionTypeSelectAriaLabel',
                  {
                    defaultMessage: 'Select transaction type',
                  }
                )}
                data-test-subj="serviceFlyoutTransactionTypeSelect"
                disabled={isTransactionTypeDisabled}
                options={
                  isTransactionTypeDisabled
                    ? [
                        {
                          value: '',
                          text: i18n.translate(
                            'xpack.apm.serviceFlyout.noTransactionTypeOptionLabel',
                            { defaultMessage: 'No transaction type available' }
                          ),
                        },
                      ]
                    : transactionTypeOptions
                }
                value={isTransactionTypeDisabled ? '' : selectedTransactionType ?? ''}
                onChange={(event) => onTransactionTypeChange(event.currentTarget.value)}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EnvironmentSelect
                compressed
                fullWidth
                status={environmentsStatus}
                environment={environment}
                availableEnvironments={environments}
                serviceName={serviceName}
                rangeFrom={rangeFrom ?? ''}
                rangeTo={rangeTo ?? ''}
                onChange={(nextEnvironment) => onEnvironmentChange(nextEnvironment as Environment)}
              />
            </EuiFlexItem>
          </EuiFlexGrid>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
