/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { EuiSwitchProps } from '@elastic/eui';
import {
  EuiRadioGroup,
  EuiButtonEmpty,
  EuiPopover,
  EuiForm,
  EuiFormRow,
  EuiSwitch,
} from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';
import type { MetricsExplorerChartOptions as ChartOptions } from '../hooks/use_metrics_explorer_options';
import {
  MetricsExplorerYAxisMode,
  MetricsExplorerChartType,
} from '../hooks/use_metrics_explorer_options';

interface Props {
  chartOptions: ChartOptions;
  onChange: (options: ChartOptions) => void;
}

export const MetricsExplorerChartOptions = ({ chartOptions, onChange }: Props) => {
  const [isPopoverOpen, { toggle: togglePopover }] = useBoolean(false);

  const button = (
    <EuiButtonEmpty
      aria-label={i18n.translate(
        'xpack.infra.metricsExplorerChartOptions.customizeButton.ariaLabel',
        { defaultMessage: 'Customize' }
      )}
      iconSide="left"
      size="s"
      iconType="eye"
      onClick={togglePopover}
      data-test-subj="metricsExplorer-customize"
    >
      <FormattedMessage
        id="xpack.infra.metricsExplorer.customizeChartOptions"
        defaultMessage="Customize"
      />
    </EuiButtonEmpty>
  );

  const yAxisRadios = [
    {
      id: MetricsExplorerYAxisMode.auto,
      label: i18n.translate('xpack.infra.metricsExplorer.chartOptions.autoLabel', {
        defaultMessage: 'Automatic (min to max)',
      }),
    },
    {
      id: MetricsExplorerYAxisMode.fromZero,
      label: i18n.translate('xpack.infra.metricsExplorer.chartOptions.fromZeroLabel', {
        defaultMessage: 'From zero (0 to max)',
      }),
    },
  ];

  const typeRadios = [
    {
      'data-test-subj': 'metricsExplorer-chartRadio-line',
      id: MetricsExplorerChartType.line,
      label: i18n.translate('xpack.infra.metricsExplorer.chartOptions.lineLabel', {
        defaultMessage: 'Line',
      }),
    },
    {
      'data-test-subj': 'metricsExplorer-chartRadio-area',
      id: MetricsExplorerChartType.area,
      label: i18n.translate('xpack.infra.metricsExplorer.chartOptions.areaLabel', {
        defaultMessage: 'Area',
      }),
    },
    {
      'data-test-subj': 'metricsExplorer-chartRadio-bar',
      id: MetricsExplorerChartType.bar,
      label: i18n.translate('xpack.infra.metricsExplorer.chartOptions.barLabel', {
        defaultMessage: 'Bar',
      }),
    },
  ];

  const handleYAxisChange = useCallback(
    (id: string) => {
      onChange({
        ...chartOptions,
        yAxisMode: id as MetricsExplorerYAxisMode,
      });
    },
    [chartOptions, onChange]
  );

  const handleTypeChange = useCallback(
    (id: string) => {
      onChange({
        ...chartOptions,
        type: id as MetricsExplorerChartType,
      });
    },
    [chartOptions, onChange]
  );

  const handleStackChange = useCallback<EuiSwitchProps['onChange']>(
    (e) => {
      onChange({
        ...chartOptions,
        stack: e.target.checked,
      });
    },
    [chartOptions, onChange]
  );

  return (
    <EuiPopover
      id="MetricExplorerChartOptionsPopover"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={togglePopover}
      aria-label={i18n.translate('xpack.infra.metricsExplorer.chartOptions.popoverAriaLabel', {
        defaultMessage: 'Chart options',
      })}
    >
      <EuiForm>
        <EuiFormRow
          display="rowCompressed"
          label={i18n.translate('xpack.infra.metricsExplorer.chartOptions.typeLabel', {
            defaultMessage: 'Chart style',
          })}
        >
          <EuiRadioGroup
            data-test-subj="infraMetricsExplorerChartOptionsRadioGroup"
            compressed
            options={typeRadios}
            idSelected={chartOptions.type}
            onChange={handleTypeChange}
            name="chartStyle"
          />
        </EuiFormRow>
        <EuiFormRow
          display="rowCompressed"
          label={i18n.translate('xpack.infra.metricsExplorer.chartOptions.stackLabel', {
            defaultMessage: 'Stack series',
          })}
        >
          <EuiSwitch
            label={i18n.translate('xpack.infra.metricsExplorer.chartOptions.stackSwitchLabel', {
              defaultMessage: 'Stack',
            })}
            checked={chartOptions.stack}
            onChange={handleStackChange}
          />
        </EuiFormRow>
        <EuiFormRow
          display="rowCompressed"
          label={i18n.translate('xpack.infra.metricsExplorer.chartOptions.yAxisDomainLabel', {
            defaultMessage: 'Y Axis Domain',
          })}
        >
          <EuiRadioGroup
            data-test-subj="infraMetricsExplorerChartOptionsRadioGroup"
            compressed
            options={yAxisRadios}
            idSelected={chartOptions.yAxisMode}
            onChange={handleYAxisChange}
            name="yAxisDomain"
          />
        </EuiFormRow>
      </EuiForm>
    </EuiPopover>
  );
};
