/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import {
  EuiToolTip,
  EuiPopover,
  EuiButton,
  EuiListGroup,
  EuiListGroupItem,
  EuiBadge,
  EuiText,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useSeriesStorage } from '../hooks/use_series_storage';
import type { SeriesConfig, SeriesUrl } from '../types';
import { useAppDataViewContext } from '../hooks/use_app_data_view';
import { RECORDS_FIELD, RECORDS_PERCENTAGE_FIELD } from '../configurations/constants';

interface Props {
  seriesId: number;
  series: SeriesUrl;
  defaultValue?: string;
  seriesConfig?: SeriesConfig;
}

export function ReportMetricOptions({ seriesId, series, seriesConfig }: Props) {
  const { setSeries } = useSeriesStorage();
  const [showOptions, setShowOptions] = useState(false);
  const metricOptions = seriesConfig?.metricOptions;

  const { dataViews, dataViewErrors, loading } = useAppDataViewContext();

  const onChange = (value?: string) => {
    setSeries(seriesId, {
      ...series,
      selectedMetricField: value,
    });
  };

  const focusButton = useCallback((ref: HTMLButtonElement) => {
    ref?.focus();
  }, []);

  if (!series.dataType) {
    return null;
  }

  const dataView = dataViews?.[series.dataType];
  const dataViewError = dataViewErrors?.[series.dataType];

  const options = (metricOptions ?? []).map(({ label, field, id }) => {
    let disabled = false;

    if (field !== RECORDS_FIELD && field !== RECORDS_PERCENTAGE_FIELD && field) {
      disabled = !Boolean(dataView?.getFieldByName(field));
    }
    return {
      disabled,
      value: field || id,
      dropdownDisplay: disabled ? (
        <EuiToolTip
          content={
            <FormattedMessage
              id="xpack.exploratoryView.expView.seriesEditor.selectReportMetric.noFieldData"
              defaultMessage="No data available for field {field}."
              values={{
                field: <strong>{field}</strong>,
              }}
            />
          }
        >
          <span tabIndex={0}>{label}</span>
        </EuiToolTip>
      ) : (
        label
      ),
      inputDisplay: label,
    };
  });

  if (dataViewError && !dataView && !loading) {
    // TODO: Add a link to docs to explain how to add index patterns
    return (
      <EuiText color="danger" className="eui-textNoWrap">
        {dataViewError.body?.error === 'Forbidden' ||
        dataViewError.name === 'DataViewInsufficientAccessError'
          ? NO_PERMISSIONS
          : dataViewError.body?.message}
      </EuiText>
    );
  }

  if (!dataView && !loading) {
    return <EuiText>{NO_DATA_AVAILABLE}</EuiText>;
  }

  return (
    <>
      {!series.selectedMetricField && (
        <EuiPopover
          aria-label={i18n.translate('xpack.exploratoryView.reportMetricOptions.popoverAriaLabel', {
            defaultMessage: 'Select report metric',
          })}
          button={
            <EuiButton
              data-test-subj="o11yReportMetricOptionsButton"
              iconType="plusCircle"
              onClick={() => setShowOptions((prevState) => !prevState)}
              fill
              size="s"
              isLoading={!dataView && loading}
              buttonRef={focusButton}
            >
              {SELECT_REPORT_METRIC_LABEL}
            </EuiButton>
          }
          isOpen={showOptions}
          closePopover={() => setShowOptions((prevState) => !prevState)}
        >
          <EuiListGroup>
            {options.map((option) => (
              <EuiListGroupItem
                key={option.value}
                onClick={() => onChange(option.value)}
                label={option.dropdownDisplay}
                isDisabled={option.disabled}
              />
            ))}
          </EuiListGroup>
        </EuiPopover>
      )}
      {series.selectedMetricField &&
        (dataView ? (
          <EuiToolTip position="top" content={REPORT_METRIC_TOOLTIP}>
            <EuiBadge
              data-test-subj="o11yReportMetricBadge"
              iconType="cross"
              iconSide="right"
              iconOnClick={() => onChange(undefined)}
              iconOnClickAriaLabel={REMOVE_REPORT_METRIC_LABEL}
              tabIndex={0}
            >
              {seriesConfig?.metricOptions?.find(
                (option) =>
                  option.id === series.selectedMetricField ||
                  option.field === series.selectedMetricField
              )?.label ?? series.selectedMetricField}
            </EuiBadge>
          </EuiToolTip>
        ) : (
          <EuiLoadingSpinner />
        ))}
    </>
  );
}

const SELECT_REPORT_METRIC_LABEL = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.selectReportMetric',
  {
    defaultMessage: 'Select report metric',
  }
);

const REMOVE_REPORT_METRIC_LABEL = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.removeReportMetric',
  {
    defaultMessage: 'Remove report metric',
  }
);

const NO_DATA_AVAILABLE = i18n.translate('xpack.exploratoryView.expView.seriesEditor.noData', {
  defaultMessage: 'No data available',
});

const NO_PERMISSIONS = i18n.translate('xpack.exploratoryView.expView.seriesEditor.noPermissions', {
  defaultMessage:
    "Unable to create Data View. You don't have the required permission, please contact your admin.",
});

const REPORT_METRIC_TOOLTIP = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.reportMetricTooltip',
  {
    defaultMessage: 'Report metric',
  }
);
