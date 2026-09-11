/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';

import dateMath from '@elastic/datemath';
import moment from 'moment';
import { EuiButtonGroup, type EuiButtonGroupOptionProps } from '@elastic/eui';

import { useDateRangePickerContext } from './date_range_picker_context';
import { durationToDisplayFullText } from './format';
import { formatDateRange } from './utils';
import { timeWindowButtonsTexts as translations } from './translations';

/** Configuration for time window buttons. */
export interface TimeWindowButtonsConfig {
  /**
   * How much the time window is increased/decreased when zooming.
   * A number between 0 and 1, or a percentage string e.g. "25%".
   * @default 0.5
   */
  zoomFactor?: number | string;
  /**
   * Show buttons for shifting the time window forward and backward.
   * @default true
   */
  showShiftArrows?: boolean;
  /**
   * Show the "zoom out" button.
   * @default true
   */
  showZoomOut?: boolean;
  /**
   * Show the "zoom in" button.
   * @default false
   */
  showZoomIn?: boolean;
}

export const DEFAULT_ZOOM_FACTOR = 0.5;

/** Minimum zoom delta (ms) used when the window is zero-width. */
export const ZOOM_DELTA_FALLBACK_MS = 500;

const BUTTON_ID_PREVIOUS = 'previous';
const BUTTON_ID_ZOOM_OUT = 'zoomOut';
const BUTTON_ID_ZOOM_IN = 'zoomIn';
const BUTTON_ID_NEXT = 'next';

/**
 * Time window control buttons rendered beside the DateRangePicker control.
 * Provides step forward/backward and zoom out/in actions.
 */
export function TimeWindowButtons({ config }: { config: TimeWindowButtonsConfig }) {
  const { timeRange, applyRange, compressed, disabled, disabledTooltip, readOnly, settings } =
    useDateRangePickerContext();
  const isDisabled = disabled || readOnly;
  const timePrecision = settings.timePrecision ?? 's';
  const {
    showShiftArrows = true,
    showZoomOut = true,
    showZoomIn = false,
    zoomFactor = DEFAULT_ZOOM_FACTOR,
  } = config;

  const {
    stepForward,
    stepBackward,
    expandWindow,
    shrinkWindow,
    isWindowDurationZero,
    isInvalid,
    durationText,
  } = useTimeWindow(
    timeRange.start,
    timeRange.end,
    timeRange.startDate,
    timeRange.endDate,
    applyRange,
    { zoomFactor, timePrecision }
  );

  const onChange = useCallback(
    (id: string) => {
      switch (id) {
        case BUTTON_ID_PREVIOUS:
          return stepBackward();
        case BUTTON_ID_ZOOM_OUT:
          return expandWindow();
        case BUTTON_ID_ZOOM_IN:
          return shrinkWindow();
        case BUTTON_ID_NEXT:
          return stepForward();
      }
    },
    [stepBackward, expandWindow, shrinkWindow, stepForward]
  );

  const disabledReason = isDisabled ? disabledTooltip : undefined;

  const options = useMemo<EuiButtonGroupOptionProps[]>(() => {
    const items: EuiButtonGroupOptionProps[] = [];

    if (showShiftArrows) {
      items.push({
        id: BUTTON_ID_PREVIOUS,
        label: translations.previousLabel,
        title: '',
        iconType: 'chevronSingleLeft',
        isDisabled: isDisabled || isInvalid || isWindowDurationZero,
        toolTipContent:
          disabledReason ??
          (isInvalid
            ? translations.cannotShiftInvalid
            : translations.previousTooltip(durationText)),
        'data-test-subj': 'dateRangePickerPreviousButton',
      });
    }

    if (showZoomOut) {
      items.push({
        id: BUTTON_ID_ZOOM_OUT,
        label: translations.zoomOutLabel,
        title: '',
        iconType: 'magnifyMinus',
        isDisabled: isDisabled || isInvalid,
        toolTipContent:
          disabledReason ??
          (isInvalid ? translations.cannotZoomOutInvalid : translations.zoomOutTooltip),
        'data-test-subj': 'dateRangePickerZoomOutButton',
      });
    }

    if (showZoomIn) {
      items.push({
        id: BUTTON_ID_ZOOM_IN,
        label: translations.zoomInLabel,
        title: '',
        iconType: 'magnifyPlus',
        isDisabled: isDisabled || isInvalid || isWindowDurationZero,
        toolTipContent:
          disabledReason ??
          (isInvalid
            ? translations.cannotZoomInInvalid
            : isWindowDurationZero
            ? translations.cannotZoomInFurther
            : translations.zoomInTooltip),
        'data-test-subj': 'dateRangePickerZoomInButton',
      });
    }

    if (showShiftArrows) {
      items.push({
        id: BUTTON_ID_NEXT,
        label: translations.nextLabel,
        title: '',
        iconType: 'chevronSingleRight',
        isDisabled: isDisabled || isInvalid || isWindowDurationZero,
        toolTipContent:
          disabledReason ??
          (isInvalid ? translations.cannotShiftInvalid : translations.nextTooltip(durationText)),
        'data-test-subj': 'dateRangePickerNextButton',
      });
    }

    return items;
  }, [
    showShiftArrows,
    showZoomOut,
    showZoomIn,
    isDisabled,
    isInvalid,
    isWindowDurationZero,
    durationText,
    disabledReason,
  ]);

  if (options.length === 0) {
    return null;
  }

  return (
    // EuiButtonGroup has a quirky API designed around filter-style selection,
    // not plain action buttons. Ideally we'd replace it with a dedicated button
    // group primitive from EUI once one exists.
    <EuiButtonGroup
      legend={translations.legend}
      type="multi"
      options={options}
      idToSelectedMap={{}}
      onChange={onChange}
      isIconOnly
      isDisabled={isDisabled}
      buttonSize={compressed ? 's' : 'm'}
      color="text"
      data-test-subj="dateRangePickerTimeWindowButtons"
    />
  );
}

/**
 * Parse a zoom factor value (number or percentage string) into a multiplier.
 * For example: 0.5 stays 0.5, "25%" becomes 0.25.
 */
function parseZoomFactor(value: number | string): number {
  const isPercentage = typeof value === 'string' && value.trim().endsWith('%');
  const parsed =
    typeof value === 'number'
      ? value
      : parseFloat(isPercentage ? value.replace('%', '').trim() : value);

  if (isNaN(parsed)) {
    throw new TypeError('Please provide a valid number or percentage string e.g. "25%"');
  }
  const result = isPercentage ? parsed / 100 : parsed;
  if (result < 0 || result > 1) {
    throw new TypeError('Please provide a `zoomFactor` value between 0 and 1');
  }

  return result;
}

/**
 * Hook providing time window shift and zoom operations.
 *
 * Adapted from EUI's `useEuiTimeWindow` — uses `@elastic/datemath` and
 * `moment` for the same date math, but lives locally to avoid depending
 * on internal EUI exports.
 */
function useTimeWindow(
  start: string,
  end: string,
  startDate: Date | null,
  endDate: Date | null,
  apply: (range: { start: string; end: string }, textOverride?: string) => void,
  options: { zoomFactor: number | string; timePrecision: import('./types').TimePrecision }
) {
  // Prefer pre-parsed dates when available to avoid passing non-standard date
  // strings (e.g. "Jan 2, 2025, 01:00:00") through dateMath.parse → moment(),
  // which triggers deprecation warnings for non-ISO/non-RFC2822 formats.
  const min = startDate ? moment(startDate) : dateMath.parse(start);
  const max = endDate ? moment(endDate) : dateMath.parse(end, { roundUp: true });
  const isInvalid = !min || !min.isValid() || !max || !max.isValid();
  const windowDuration = isInvalid ? -1 : max.diff(min);
  const isWindowDurationZero = windowDuration === 0;
  const durationText = isInvalid ? '' : durationToDisplayFullText(min.toDate(), max.toDate());
  const zoomMultiplier = parseZoomFactor(options.zoomFactor);
  const zoomDelta = windowDuration * (zoomMultiplier / 2);
  const { timePrecision } = options;

  const applyDates = useCallback(
    (s: moment.Moment, e: moment.Moment) => {
      apply(
        { start: s.toISOString(), end: e.toISOString() },
        formatDateRange(s.toDate(), e.toDate(), timePrecision)
      );
    },
    [apply, timePrecision]
  );

  const stepForward = useCallback(() => {
    if (isInvalid || isWindowDurationZero) return;
    applyDates(moment(max), moment(max).add(windowDuration, 'ms'));
  }, [isInvalid, isWindowDurationZero, max, windowDuration, applyDates]);

  const stepBackward = useCallback(() => {
    if (isInvalid || isWindowDurationZero) return;
    applyDates(moment(min).subtract(windowDuration, 'ms'), moment(min));
  }, [isInvalid, isWindowDurationZero, min, windowDuration, applyDates]);

  const expandWindow = useCallback(() => {
    if (isInvalid) return;
    const addition = zoomDelta === 0 ? ZOOM_DELTA_FALLBACK_MS : zoomDelta;
    applyDates(moment(min).subtract(addition, 'ms'), moment(max).add(addition, 'ms'));
  }, [isInvalid, min, max, zoomDelta, applyDates]);

  const shrinkWindow = useCallback(() => {
    if (isInvalid || isWindowDurationZero) return;
    applyDates(moment(min).add(zoomDelta, 'ms'), moment(max).subtract(zoomDelta, 'ms'));
  }, [isInvalid, isWindowDurationZero, min, max, zoomDelta, applyDates]);

  return {
    stepForward,
    stepBackward,
    expandWindow,
    shrinkWindow,
    isWindowDurationZero,
    isInvalid,
    durationText,
  };
}
