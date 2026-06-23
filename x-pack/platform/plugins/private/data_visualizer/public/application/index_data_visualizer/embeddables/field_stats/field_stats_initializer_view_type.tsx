/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { FC } from 'react';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiButtonGroup, EuiFormRow, type EuiButtonGroupOptionProps } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FieldStatsInitializerViewType } from '../../../../../common/embeddables/types';

const viewTypeOptions: EuiButtonGroupOptionProps[] = [
  {
    id: FieldStatsInitializerViewType.DATA_VIEW,
    label: (
      <FormattedMessage
        id="xpack.dataVisualizer.fieldStatsDashboardPanel.dataSourceSelector.dataViewLabel"
        defaultMessage="Data view"
      />
    ),
    iconType: 'chartLine',
  },
  {
    id: FieldStatsInitializerViewType.ESQL,
    label: (
      <FormattedMessage
        id="xpack.dataVisualizer.fieldStatsDashboardPanel.dataSourceSelector.esqlLabel"
        defaultMessage="ES|QL"
      />
    ),
    iconType: 'table',
  },
];

const dataSourceLabel = i18n.translate(
  'xpack.dataVisualizer.fieldStatsDashboardPanel.dataSourceLabel',
  {
    defaultMessage: 'Data source',
  }
);

const dataSourceAriaLabel = i18n.translate(
  'xpack.dataVisualizer.fieldStatsDashboardPanel.viewTypeLabel',
  {
    defaultMessage: 'Pick type of data source to use',
  }
);

export interface ViewTypeSelectorProps {
  value: FieldStatsInitializerViewType;
  onChange: (update: FieldStatsInitializerViewType) => void;
}

export const DataSourceTypeSelector: FC<ViewTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <EuiFormRow fullWidth label={dataSourceLabel}>
      <EuiButtonGroup
        isFullWidth
        aria-label={dataSourceAriaLabel}
        options={viewTypeOptions}
        idSelected={value}
        onChange={onChange as (id: string) => void}
        legend={dataSourceAriaLabel}
      />
    </EuiFormRow>
  );
};
