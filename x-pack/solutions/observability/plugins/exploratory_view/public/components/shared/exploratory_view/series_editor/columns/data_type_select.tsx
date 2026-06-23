/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import {
  EuiButton,
  EuiPopover,
  EuiListGroup,
  EuiListGroupItem,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useSeriesStorage } from '../../hooks/use_series_storage';
import type { AppDataType, SeriesUrl } from '../../types';
import { useExploratoryView } from '../../contexts/exploratory_view_config';

interface Props {
  seriesId: number;
  series: Omit<SeriesUrl, 'dataType'> & {
    dataType?: SeriesUrl['dataType'];
  };
}

const SELECT_DATA_TYPE = 'SELECT_DATA_TYPE';

export function DataTypesSelect({ seriesId, series }: Props) {
  const { setSeries, reportType } = useSeriesStorage();
  const [showOptions, setShowOptions] = useState(false);

  const focusButton = useCallback((ref: HTMLButtonElement) => {
    ref?.focus();
  }, []);

  const onDataTypeChange = (dataType: AppDataType) => {
    if (String(dataType) !== SELECT_DATA_TYPE) {
      setSeries(seriesId, {
        dataType,
        time: series.time,
        name: `${dataType}-series-${seriesId + 1}`,
      });
    }
  };

  const { dataTypes, reportConfigMap } = useExploratoryView();

  const options = dataTypes
    .filter(({ id }) => {
      return reportConfigMap[id]?.find((config) => config({}).reportType === reportType);
    })
    .map(({ id, label }) => ({
      value: id,
      inputDisplay: label,
    }));

  const currDataType = dataTypes.find((dt) => dt.id === series.dataType);

  return (
    <>
      {!series.dataType && (
        <EuiPopover
          aria-label={i18n.translate('xpack.exploratoryView.dataTypesSelect.popoverAriaLabel', {
            defaultMessage: 'Select data type',
          })}
          button={
            <EuiButton
              data-test-subj="o11yDataTypesSelectButton"
              iconType="plusCircle"
              onClick={() => setShowOptions((prevState) => !prevState)}
              fill
              size="s"
              buttonRef={focusButton}
            >
              {SELECT_DATA_TYPE_LABEL}
            </EuiButton>
          }
          isOpen={showOptions}
          closePopover={() => setShowOptions((prevState) => !prevState)}
        >
          <EuiListGroup>
            {options.map((option) => (
              <EuiListGroupItem
                key={option.value}
                onClick={() => onDataTypeChange(option.value)}
                label={option.inputDisplay}
              />
            ))}
          </EuiListGroup>
        </EuiPopover>
      )}
      {series.dataType && (
        <EuiToolTip position="top" content={SELECT_DATA_TYPE_TOOLTIP}>
          <EuiBadge data-test-subj="o11yDataTypeBadge" tabIndex={0}>
            {currDataType?.label}
          </EuiBadge>
        </EuiToolTip>
      )}
    </>
  );
}

const SELECT_DATA_TYPE_LABEL = i18n.translate('xpack.exploratoryView.selectDataType', {
  defaultMessage: 'Select data type',
});

const SELECT_DATA_TYPE_TOOLTIP = i18n.translate('xpack.exploratoryView.selectDataTypeTooltip', {
  defaultMessage: 'Data type cannot be edited.',
});
