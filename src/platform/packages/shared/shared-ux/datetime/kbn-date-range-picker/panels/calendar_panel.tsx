/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { EuiButton, EuiCheckbox, useGeneratedHtmlId } from '@elastic/eui';

import { Calendar } from '../calendar';
import { DATE_TYPE_ABSOLUTE } from '../constants';
import {
  PanelBody,
  PanelContainer,
  PanelFooter,
  PanelHeader,
  SubPanelHeading,
} from '../date_range_picker_panel_ui';
import { calendarPanelTexts, mainPanelTexts } from '../translations';
import { timeRangeToDisplayText } from '../format';
import { getEndDate, getStartDate, formatDateRange } from '../utils';
import { useDateRangePickerContext } from '../date_range_picker_context';

/** Calendar-based date selection panel. */
export function CalendarPanel() {
  const { applyRange, onPresetSave, setText, text, timeRange, calendarOptions, settings } =
    useDateRangePickerContext();
  const timePrecision = settings.timePrecision ?? 's';
  const saveAsPresetCheckboxId = useGeneratedHtmlId({ prefix: 'saveAsPreset' });

  const [pendingFrom, setPendingFrom] = useState<Date | null>(null);

  const [saveAsPreset, setSaveAsPreset] = useState(false);

  const originalTextRef = useRef(text);
  const timeSourceRef = useRef({
    startDate: timeRange.startDate,
    endDate: timeRange.endDate,
  });

  // Derived range: pending single-click selection takes priority, otherwise derive from text.
  // Invalid ranges e.g. end date in the future, are left unselected so the calendar doesn't
  // highlight a range that contradicts the input.
  const calendarRange: DateRange | undefined = useMemo(() => {
    if (pendingFrom) return { from: pendingFrom, to: undefined };
    if (!timeRange.isInvalid && timeRange.startDate && timeRange.endDate)
      return { from: timeRange.startDate, to: timeRange.endDate };

    return undefined;
  }, [pendingFrom, timeRange.isInvalid, timeRange.startDate, timeRange.endDate]);

  // On mount: convert to absolute format so user sees resolved dates
  useEffect(() => {
    if (timeSourceRef.current.startDate && timeSourceRef.current.endDate) {
      setText(
        formatDateRange(
          timeSourceRef.current.startDate,
          timeSourceRef.current.endDate,
          timePrecision
        )
      );
    }
  }, [setText, timePrecision]);

  const restoreOriginalText = useCallback(() => {
    setText(originalTextRef.current);
  }, [setText]);

  const getOrderedDates = useCallback((from: Date, to: Date): { start: Date; end: Date } => {
    const startDate = getStartDate(from);
    const endDate = getEndDate(to);

    return startDate <= endDate
      ? { start: startDate, end: endDate }
      : { start: endDate, end: startDate };
  }, []);

  const formatRangeText = useCallback(
    (from: Date, to: Date): string => {
      const { start, end } = getOrderedDates(from, to);
      return formatDateRange(start, end, timePrecision);
    },
    [getOrderedDates, timePrecision]
  );

  const handleRangeChange = useCallback(
    (newRange: DateRange | undefined) => {
      // A single click already yields a full-day range (00:00:00 → 23:59:59), so
      // Apply is enabled immediately; clicking a second day extends it into a
      // multi-day range. react-day-picker stays mid-selection (see `calendarRange`),
      // which is what lets the second click extend rather than reset.

      // Complete range visible — user is starting a new selection
      if (!pendingFrom && calendarRange?.from && calendarRange?.to) {
        const fromChanged = newRange?.from?.getTime() !== calendarRange.from.getTime();
        const clickedDate = fromChanged ? newRange?.from : newRange?.to;

        setPendingFrom(clickedDate ?? null);
        if (clickedDate) setText(formatRangeText(clickedDate, clickedDate));
        return;
      }

      // Second click — completing the range
      if (pendingFrom && newRange?.from && newRange?.to) {
        setPendingFrom(null);
        setText(formatRangeText(newRange.from, newRange.to));
        return;
      }

      // First click with no existing selection — select the full clicked day
      if (newRange?.from) {
        setPendingFrom(newRange.from);
        setText(formatRangeText(newRange.from, newRange.from));
      }
    },
    [pendingFrom, calendarRange, setText, formatRangeText]
  );

  const isApplyDisabled =
    timeRange.isInvalid || timeRange.startDate === null || timeRange.endDate === null;

  const onApply = useCallback(() => {
    // Apply the current input range exactly as pressing Enter does: defer to the
    // context, which applies the resolved range from `text`. This preserves any
    // manual time edits made after selecting days in the calendar, instead of
    // re-flooring the range to 00:00:00 / 23:59:59.
    applyRange();

    const { startDate, endDate } = timeRange;
    if (onPresetSave && saveAsPreset && startDate && endDate) {
      const start = startDate.toISOString();
      const end = endDate.toISOString();

      onPresetSave({
        start,
        end,
        label: timeRangeToDisplayText(
          {
            value: formatDateRange(startDate, endDate, timePrecision),
            start,
            end,
            startDate,
            endDate,
            type: [DATE_TYPE_ABSOLUTE, DATE_TYPE_ABSOLUTE],
            isNaturalLanguage: false,
            isInvalid: false,
            startOffset: null,
            endOffset: null,
          },
          { timePrecision }
        ),
      });
    }
  }, [applyRange, onPresetSave, saveAsPreset, timeRange, timePrecision]);

  const applyButton = (
    <EuiButton
      size="s"
      fill
      onClick={onApply}
      disabled={isApplyDisabled}
      data-test-subj="dateRangePickerCalendarApplyButton"
    >
      {calendarPanelTexts.applyButton}
    </EuiButton>
  );

  return (
    <PanelContainer data-test-subj="dateRangePickerCalendarPanel">
      <PanelHeader>
        <SubPanelHeading onGoBack={restoreOriginalText}>
          {mainPanelTexts.calendarPanelTitle}
        </SubPanelHeading>
      </PanelHeader>
      <PanelBody spacingSide="none" fill>
        <Calendar
          range={calendarRange}
          onRangeChange={handleRangeChange}
          firstDayOfWeek={calendarOptions?.firstDayOfWeek}
        />
      </PanelBody>
      <PanelFooter primaryAction={applyButton}>
        {onPresetSave && (
          <EuiCheckbox
            id={saveAsPresetCheckboxId}
            label={calendarPanelTexts.saveAsPreset}
            checked={saveAsPreset}
            onChange={() => setSaveAsPreset((prev) => !prev)}
            data-test-subj="dateRangePickerCalendarSaveCheckbox"
          />
        )}
      </PanelFooter>
    </PanelContainer>
  );
}
CalendarPanel.PANEL_ID = 'calendar-panel';
