/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiCheckbox, EuiFormPrepend, EuiSelect } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useUiTracker } from '@kbn/observability-shared-plugin/public';
import { useShouldShowAnomalyUi } from '../../../hooks/use_should_show_anomaly_ui';
import { useEnvironmentsContext } from '../../../context/environments_context/use_environments_context';
import { useAnomalyDetectionJobsContext } from '../../../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import { useAnyOfApmParams } from '../../../hooks/use_apm_params';
import { useBreakpoints } from '../../../hooks/use_breakpoints';
import { useTimeRange } from '../../../hooks/use_time_range';
import * as urlHelpers from '../links/url_helpers';
import { getComparisonOptions, TimeRangeComparisonEnum } from './get_comparison_options';

export function TimeComparison({
  compressed,
  fullWidth,
}: {
  compressed?: boolean;
  fullWidth?: boolean;
}) {
  const trackApmEvent = useUiTracker({ app: 'apm' });
  const history = useHistory();
  const { isSmall, isMedium } = useBreakpoints();
  const {
    query: { rangeFrom, rangeTo, comparisonEnabled, offset, kuery },
  } = useAnyOfApmParams('/services', '/dependencies/*', '/services/{serviceName}');

  const { anomalyDetectionSetupState } = useAnomalyDetectionJobsContext();
  const { preferredEnvironment } = useEnvironmentsContext();

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const shouldShowAnomalyUi = useShouldShowAnomalyUi();

  const comparisonOptions = useMemo(() => {
    const timeComparisonOptions = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: shouldShowAnomalyUi,
      anomalyDetectionSetupState,
      kuery,
      preferredEnvironment,
    });

    return timeComparisonOptions;
  }, [shouldShowAnomalyUi, anomalyDetectionSetupState, start, end, preferredEnvironment, kuery]);

  const isSelectedComparisonTypeAvailable = comparisonOptions.some(({ value }) => value === offset);

  // Replaces type when current one is no longer available in the select options
  if (
    (comparisonOptions.length !== 0 && !isSelectedComparisonTypeAvailable) ||
    // If user changes environment and there's no ML jobs that match the new environment
    // then also default to first comparison option as well
    (offset === TimeRangeComparisonEnum.ExpectedBounds &&
      comparisonOptions.find((d) => d.value === TimeRangeComparisonEnum.ExpectedBounds)
        ?.disabled === true)
  ) {
    urlHelpers.replace(history, {
      query: { offset: comparisonOptions[0].value },
    });
    return null;
  }

  return (
    <EuiSelect
      compressed={compressed}
      aria-label={i18n.translate('xpack.apm.timeComparison.euiSelect.seletTimeComparisonLabel', {
        defaultMessage: 'Select time comparison options',
      })}
      fullWidth={fullWidth ?? (isSmall || isMedium)}
      data-test-subj="comparisonSelect"
      disabled={comparisonEnabled === false}
      options={comparisonOptions}
      value={offset}
      prepend={
        <EuiFormPrepend>
          <EuiCheckbox
            id="comparison"
            label={i18n.translate('xpack.apm.timeComparison.label', {
              defaultMessage: 'Comparison',
            })}
            checked={comparisonEnabled}
            onChange={() => {
              const nextComparisonEnabledValue = !comparisonEnabled;
              if (nextComparisonEnabledValue === false) {
                trackApmEvent({
                  metric: 'time_comparison_disabled',
                });
              }
              urlHelpers.push(history, {
                query: {
                  comparisonEnabled: Boolean(nextComparisonEnabledValue).toString(),
                },
              });
            }}
          />
        </EuiFormPrepend>
      }
      onChange={(e) => {
        trackApmEvent({
          metric: `time_comparison_type_change_${e.target.value}`,
        });
        urlHelpers.push(history, {
          query: {
            offset: e.target.value,
          },
        });
      }}
    />
  );
}
