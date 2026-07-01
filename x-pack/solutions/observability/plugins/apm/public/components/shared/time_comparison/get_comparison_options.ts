/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { i18n } from '@kbn/i18n';
import { isEmpty } from 'lodash';
import {
  AnomalyDetectionSetupState,
  getIsAnomalyDetectionConfiguredForEnvironment,
} from '../../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import type { Environment } from '../../../../common/environment_rt';
import { ENVIRONMENT_ALL, getEnvironmentLabel } from '../../../../common/environment_filter_values';
import type { AnomalyDetectionJobsContextValue } from '../../../context/anomaly_detection_jobs/anomaly_detection_jobs_context';
import { getOffsetInMs } from '../../../../common/utils/get_offset_in_ms';

export enum TimeRangeComparisonEnum {
  WeekBefore = 'week',
  DayBefore = 'day',
  PeriodBefore = 'period',
  ExpectedBounds = 'expected_bounds',
}

/**
 * Stable `data-test-subj` values for the "Expected bounds" option. Each value
 * encodes the option state so tests can assert behaviour without depending on
 * the (translated) option copy.
 */
export const EXPECTED_BOUNDS_TEST_SUBJ = {
  enabled: 'comparisonSelectExpectedBounds',
  allEnvironmentsDisabled: 'comparisonSelectExpectedBoundsAllEnvironments',
  environmentDisabled: 'comparisonSelectExpectedBoundsEnvironmentDisabled',
  kueryDisabled: 'comparisonSelectExpectedBoundsKueryDisabled',
} as const;

interface ComparisonOption {
  value: string;
  text: string;
  disabled?: boolean;
  'data-test-subj'?: string;
}

export const isTimeComparison = (v: string | undefined) =>
  v !== TimeRangeComparisonEnum.ExpectedBounds;

export const isExpectedBoundsComparison = (v: string | undefined) =>
  v === TimeRangeComparisonEnum.ExpectedBounds;

export const dayAndWeekBeforeToOffset = {
  [TimeRangeComparisonEnum.DayBefore]: '1d',
  [TimeRangeComparisonEnum.WeekBefore]: '1w',
} as const;

const twentyFiveHoursInMs = moment.duration(25, 'h').asMilliseconds();
const eightDaysInMs = moment.duration(8, 'd').asMilliseconds();

function formatDate({
  currentPeriodEnd,
  previousPeriodStart,
  previousPeriodEnd,
}: {
  currentPeriodEnd: moment.Moment;
  previousPeriodStart: moment.Moment;
  previousPeriodEnd: moment.Moment;
}) {
  const isDifferentYears = previousPeriodStart.get('year') !== currentPeriodEnd.get('year');
  const dateFormat = isDifferentYears ? 'DD/MM/YY HH:mm' : 'DD/MM HH:mm';

  return `${previousPeriodStart.format(dateFormat)} - ${previousPeriodEnd.format(dateFormat)}`;
}

export function isDefined<T>(argument: T | undefined | null): argument is T {
  return argument !== undefined && argument !== null;
}

function getSelectOptions({
  comparisonTypes,
  start,
  end,
  msDiff,
}: {
  comparisonTypes: TimeRangeComparisonEnum[];
  start: moment.Moment;
  end: moment.Moment;
  msDiff: number;
}): ComparisonOption[] {
  return comparisonTypes
    .map((value) => {
      switch (value) {
        case TimeRangeComparisonEnum.DayBefore: {
          return {
            value: dayAndWeekBeforeToOffset[TimeRangeComparisonEnum.DayBefore],
            text: i18n.translate('xpack.apm.timeComparison.select.dayBefore', {
              defaultMessage: 'Day before',
            }),
          };
        }
        case TimeRangeComparisonEnum.WeekBefore: {
          return {
            value: dayAndWeekBeforeToOffset[TimeRangeComparisonEnum.WeekBefore],
            text: i18n.translate('xpack.apm.timeComparison.select.weekBefore', {
              defaultMessage: 'Week before',
            }),
          };
        }
        case TimeRangeComparisonEnum.PeriodBefore: {
          const offset = `${msDiff}ms`;

          const { startWithOffset, endWithOffset } = getOffsetInMs({
            start: start.valueOf(),
            end: end.valueOf(),
            offset,
          });

          return {
            value: offset,
            text: formatDate({
              currentPeriodEnd: end,
              previousPeriodStart: moment(startWithOffset),
              previousPeriodEnd: moment(endWithOffset),
            }),
          };
        }
      }
    })
    .filter(isDefined);
}

function getExpectedBoundsText({
  isAllEnvironments,
  hasJobForEnvironment,
  kuery,
  environment,
}: {
  isAllEnvironments: boolean;
  hasJobForEnvironment: boolean;
  kuery?: string;
  environment: string;
}) {
  if (isAllEnvironments) {
    return i18n.translate('xpack.apm.comparison.mlExpectedBoundsAllEnvironmentsText', {
      defaultMessage: 'Expected bounds (Select a specific environment to use Expected bounds)',
    });
  }

  if (!hasJobForEnvironment) {
    return i18n.translate('xpack.apm.comparison.mlExpectedBoundsEnvironmentDisabledText', {
      defaultMessage:
        'Expected bounds (Anomaly detection must be enabled for environment "{environment}")',
      values: { environment: getEnvironmentLabel(environment) },
    });
  }

  if (!isEmpty(kuery)) {
    return i18n.translate('xpack.apm.comparison.mlExpectedBoundsKueryFilterText', {
      defaultMessage:
        'Expected bounds (Anomaly detection is hidden while a search bar filter is applied)',
    });
  }

  return i18n.translate('xpack.apm.comparison.mlExpectedBoundsText', {
    defaultMessage: 'Expected bounds',
  });
}

function getExpectedBoundsTestSubj({
  isAllEnvironments,
  hasJobForEnvironment,
  kuery,
}: {
  isAllEnvironments: boolean;
  hasJobForEnvironment: boolean;
  kuery?: string;
}) {
  if (isAllEnvironments) {
    return EXPECTED_BOUNDS_TEST_SUBJ.allEnvironmentsDisabled;
  }

  if (!hasJobForEnvironment) {
    return EXPECTED_BOUNDS_TEST_SUBJ.environmentDisabled;
  }

  if (!isEmpty(kuery)) {
    return EXPECTED_BOUNDS_TEST_SUBJ.kueryDisabled;
  }

  return EXPECTED_BOUNDS_TEST_SUBJ.enabled;
}

export function getComparisonOptions({
  start,
  end,
  showSelectedBoundsOption,
  anomalyDetectionSetupState,
  preferredEnvironment,
  kuery,
}: {
  start?: string;
  end?: string;
  showSelectedBoundsOption: boolean;
  anomalyDetectionSetupState?: AnomalyDetectionJobsContextValue['anomalyDetectionSetupState'];
  preferredEnvironment?: Environment;
  kuery?: string;
}) {
  const momentStart = moment(start);
  const momentEnd = moment(end);
  const msDiff = momentEnd.diff(momentStart, 'ms', true);

  let comparisonTypes: TimeRangeComparisonEnum[];

  if (msDiff < twentyFiveHoursInMs) {
    // Less than 25 hours. This is because relative times may be rounded when
    // asking for a day, which can result in a duration > 24h. (e.g. rangeFrom: 'now-24h/h, rangeTo: 'now')
    comparisonTypes = [TimeRangeComparisonEnum.DayBefore, TimeRangeComparisonEnum.WeekBefore];
  } else if (msDiff < eightDaysInMs) {
    // Less than 8 days. This is because relative times may be rounded when
    // asking for a week, which can result in a duration > 7d. (e.g. rangeFrom: 'now-7d/d, rangeTo: 'now')
    comparisonTypes = [TimeRangeComparisonEnum.WeekBefore];
  } else {
    comparisonTypes = [TimeRangeComparisonEnum.PeriodBefore];
  }

  const comparisonOptions = getSelectOptions({
    comparisonTypes,
    start: momentStart,
    end: momentEnd,
    msDiff,
  });

  if (showSelectedBoundsOption) {
    const isAllEnvironments = preferredEnvironment === ENVIRONMENT_ALL.value;
    const hasJobForEnvironment = getIsAnomalyDetectionConfiguredForEnvironment(
      anomalyDetectionSetupState ?? AnomalyDetectionSetupState.Unknown
    );

    const disabled = isAllEnvironments || !hasJobForEnvironment || !isEmpty(kuery);

    comparisonOptions.push({
      value: TimeRangeComparisonEnum.ExpectedBounds,
      text: getExpectedBoundsText({
        isAllEnvironments,
        hasJobForEnvironment,
        kuery,
        environment: preferredEnvironment ?? ENVIRONMENT_ALL.value,
      }),
      disabled,
      'data-test-subj': getExpectedBoundsTestSubj({
        isAllEnvironments,
        hasJobForEnvironment,
        kuery,
      }),
    });
  }

  return comparisonOptions;
}
