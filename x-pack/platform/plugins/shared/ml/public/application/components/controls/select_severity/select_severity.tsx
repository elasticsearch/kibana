/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * React component for rendering a select element with threshold levels.
 */
import type { FC } from 'react';
import React, { Fragment, useMemo, useCallback } from 'react';

import type { EuiSelectableOption, EuiSuperSelectProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiHealth, useEuiTheme } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { usePageUrlState } from '@kbn/ml-url-state';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { MultiSuperSelect } from '../../multi_super_select/multi_super_select';
import { useSeverityOptions } from '../../../explorer/hooks/use_severity_options';
import {
  getSeverityThresholdMax,
  resolveSeverityFormat,
} from '../../../../../common/util/severity_threshold';

export interface TableSeverityPageUrlState {
  pageKey: 'mlSelectSeverity';
  pageUrlState: TableSeverityState;
}

export interface TableSeverity {
  val: number;
  display: string;
  color: string;
  threshold: SeverityThreshold;
}

export interface TableSeverityState {
  val: SeverityThreshold[];
}

/**
 * React hook that returns the default table severity state
 */
export const useDefaultSeverity = () => {
  const severityOptions = useSeverityOptions();
  return useMemo(
    () => ({
      val: severityOptions.map((option) => option.threshold),
    }),
    [severityOptions]
  );
};

/**
 * React hook that provides table severity url state management
 */
export const useTableSeverity = () => {
  const defaultSeverity = useDefaultSeverity();

  const [rawUrlState, setUrlState, urlStateService] = usePageUrlState<TableSeverityPageUrlState>(
    'mlSelectSeverity',
    defaultSeverity
  );

  const resolvedUrlState = useMemo(
    () => ({
      val: resolveSeverityFormat(rawUrlState.val),
    }),
    [rawUrlState.val]
  );

  return [resolvedUrlState, setUrlState, urlStateService] as const;
};

/**
 * Helper function to get severity range display value
 */
export const getSeverityRangeDisplay = (val: number): string => {
  switch (val) {
    case ML_ANOMALY_THRESHOLD.CRITICAL:
      return '75-100';
    case ML_ANOMALY_THRESHOLD.MAJOR:
      return '50-75';
    case ML_ANOMALY_THRESHOLD.MINOR:
      return '25-50';
    case ML_ANOMALY_THRESHOLD.WARNING:
      return '3-25';
    case ML_ANOMALY_THRESHOLD.LOW:
      return '0-3';
    default:
      return val.toString();
  }
};

const useFormattedSeverityOptions = (selectedSeverities: TableSeverity[] = []) => {
  const severityOptions = useSeverityOptions();

  return useMemo<EuiSelectableOption[]>(() => {
    return severityOptions.map(({ color, val }) => {
      return {
        key: val.toString(),
        label: getSeverityRangeDisplay(val),
        prepend: <EuiHealth color={color} css={{ lineHeight: 'inherit' }} />,
        checked: selectedSeverities.some((severity) => severity.val === val) ? 'on' : undefined,
      };
    });
  }, [severityOptions, selectedSeverities]);
};

interface Props {
  classNames?: string;
}

export const SelectSeverity: FC<Props> = ({ classNames } = { classNames: '' }) => {
  const [severity, setSeverity] = useTableSeverity();
  // Get the selected severities from the state
  const selectedThresholds = severity.val || [];

  // Update the severity state with new selections
  const handleSeverityChange = useCallback(
    (newSelectedSeverities: TableSeverity[]) => {
      // Extract the thresholds from the selected severities
      const newSelectedThresholds = newSelectedSeverities.map((s) => s.threshold);

      setSeverity({
        val: newSelectedThresholds,
      });
    },
    [setSeverity]
  );

  return (
    <SelectSeverityUI
      severity={selectedThresholds}
      onChange={handleSeverityChange}
      classNames={classNames}
    />
  );
};

export const SelectSeverityUI: FC<
  Omit<EuiSuperSelectProps<string>, 'onChange' | 'options'> & {
    classNames?: string;
    severity: SeverityThreshold[];
    onChange: (selectedSeverities: TableSeverity[]) => void;
  }
> = ({ classNames = '', severity, onChange }) => {
  const { euiTheme } = useEuiTheme();
  const allSeverityOptions = useSeverityOptions();
  const selectedSeverities = useMemo(
    () =>
      allSeverityOptions.filter((option) =>
        severity.some(
          (threshold) =>
            threshold.min === option.threshold.min &&
            getSeverityThresholdMax(threshold) === getSeverityThresholdMax(option.threshold)
        )
      ),
    [allSeverityOptions, severity]
  );

  // Create a display string for the selected severities
  const inputDisplay = useMemo(() => {
    if (severity.length === 1) {
      const selectedSeverity = selectedSeverities[0];
      if (selectedSeverity && typeof selectedSeverity.val === 'number') {
        const rangeDisplay = getSeverityRangeDisplay(selectedSeverity.val);
        return (
          <Fragment>
            <EuiHealth color={selectedSeverity.color} css={{ lineHeight: 'inherit' }}>
              {rangeDisplay}
            </EuiHealth>
          </Fragment>
        );
      }
    }

    // For multiple selections, show "Multiple" with horizontally overlapping health icons
    return (
      <Fragment>
        <EuiFlexGroup gutterSize="none" alignItems="center" direction="row">
          <EuiFlexGroup
            direction="row"
            gutterSize="none"
            css={{
              marginRight: euiTheme.size.s,
              position: 'relative',
            }}
          >
            {selectedSeverities.map((selectedSeverity, index) => (
              <EuiFlexItem
                key={index}
                css={{
                  position: 'relative',
                  marginLeft: index > 0 ? '-6px' : '0',
                  width: euiTheme.size.s,
                  height: euiTheme.size.s,
                  borderRadius: euiTheme.border.radius.medium,
                  backgroundColor: selectedSeverity.color,
                  zIndex: index + 1,
                }}
              />
            ))}
          </EuiFlexGroup>
          <EuiFlexItem>
            {i18n.translate('xpack.ml.controls.selectSeverity.multiple', {
              defaultMessage: 'Multiple',
            })}
          </EuiFlexItem>
        </EuiFlexGroup>
      </Fragment>
    );
  }, [euiTheme.border.radius.medium, euiTheme.size.s, selectedSeverities, severity.length]);

  // Get the options for the multi-select component
  const multiSelectOptions = useFormattedSeverityOptions(selectedSeverities);

  // Handle changes from the multi-select component
  const handleOptionsChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      // Get the keys of selected options
      const selectedOptionKeys = newOptions
        .filter((option) => option.checked === 'on')
        .map((option) => option.key);

      // Prevent deselecting all options - at least one must remain selected
      if (selectedOptionKeys.length === 0) {
        return;
      }

      // Find the corresponding severity options
      const newSelectedSeverities = allSeverityOptions.filter((option) =>
        selectedOptionKeys.includes(option.val.toString())
      );

      onChange(newSelectedSeverities);
    },
    [onChange, allSeverityOptions]
  );

  const anomalyScoreLabel = i18n.translate('xpack.ml.explorer.severityThresholdLabel', {
    defaultMessage: 'Anomaly score',
  });

  return (
    <div data-test-subj={'mlAnomalySeverityThresholdControls'} className={classNames}>
      <MultiSuperSelect
        prepend={anomalyScoreLabel}
        aria-label={anomalyScoreLabel}
        inputDisplay={inputDisplay}
        options={multiSelectOptions}
        onOptionsChange={handleOptionsChange}
      />
    </div>
  );
};
