/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiText,
  useEuiTheme,
  EuiFormControlLayout,
  EuiIcon,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { getSeverityRangeDisplay } from '../../../../../common/util/severity_threshold';
import { useSeverityLegendControlStyles } from './severity_legend_control_styles';
import type { SeverityOption } from '../../hooks/use_severity_options';

export interface SeverityControlProps {
  allSeverityOptions: SeverityOption[];
  selectedSeverities: SeverityOption[];
  onChange: (selectedSeverities: SeverityOption[]) => void;
  dataTestSubj?: string;
}

export const SeverityLegendControl: FC<SeverityControlProps> = ({
  allSeverityOptions,
  selectedSeverities,
  onChange,
  dataTestSubj = 'severity-legend-control',
}) => {
  const { euiTheme } = useEuiTheme();
  const styles = useSeverityLegendControlStyles();

  const handleSeverityClick = useCallback(
    (clickedSeverity: SeverityOption) => {
      const isCurrentlySelected = selectedSeverities.some(
        (severity) => severity.val === clickedSeverity.val
      );
      const allSelected = selectedSeverities.length === allSeverityOptions.length;

      let newSelectedSeverities: SeverityOption[];

      // If all are selected, select only the clicked one
      if (allSelected) {
        newSelectedSeverities = [clickedSeverity];
      }
      // If trying to deselect the last selected option, select all instead
      else if (isCurrentlySelected && selectedSeverities.length === 1) {
        newSelectedSeverities = [...allSeverityOptions];
      }
      // If deselecting one of multiple selected options
      else if (isCurrentlySelected) {
        newSelectedSeverities = selectedSeverities.filter(
          (severity) => severity.val !== clickedSeverity.val
        );
      }
      // If selecting an additional option
      else {
        newSelectedSeverities = [...selectedSeverities, clickedSeverity];
      }

      onChange(newSelectedSeverities);
    },
    [selectedSeverities, allSeverityOptions, onChange]
  );

  const severityControl = (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      {allSeverityOptions.map((severity) => {
        const isSelected = selectedSeverities.some((s) => s.val === severity.val);

        return (
          <EuiFlexItem key={severity.val} grow={false}>
            <EuiButtonEmpty
              size="xs"
              aria-label={i18n.translate(
                'xpack.ml.explorer.severityLegendControl.anomalyScoreButtonLabel',
                {
                  defaultMessage: 'Anomaly score {range}',
                  values: { range: getSeverityRangeDisplay(severity.val) },
                }
              )}
              onClick={() => handleSeverityClick(severity)}
              css={styles.severityButton}
              data-test-subj={`${dataTestSubj}-item-${severity.val}`}
            >
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    aria-hidden={true}
                    type={isSelected ? 'dot' : 'eyeSlash'}
                    color={isSelected ? severity.color : euiTheme.colors.textDisabled}
                    size={isSelected ? 'm' : 's'}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s" css={styles.severityText(isSelected)}>
                    {getSeverityRangeDisplay(severity.val)}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiButtonEmpty>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );

  return (
    <EuiFormControlLayout
      compressed
      prepend={i18n.translate('xpack.ml.explorer.severityLegendControl.anomalyScoreLabel', {
        defaultMessage: 'Anomaly score',
      })}
      fullWidth
      data-test-subj={dataTestSubj}
    >
      <EuiFlexItem css={styles.severityControl}>{severityControl}</EuiFlexItem>
    </EuiFormControlLayout>
  );
};
