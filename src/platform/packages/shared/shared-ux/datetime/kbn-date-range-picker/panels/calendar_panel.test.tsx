/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithEuiTheme } from '@kbn/test-jest-helpers';

import { CalendarPanel } from './calendar_panel';
import { DATE_TYPE_ABSOLUTE, DATE_TYPE_NOW, DATE_TYPE_RELATIVE } from '../constants';
import { formatDateRange } from '../utils';
import { textToTimeRange } from '../parse';

const mockUseDateRangePickerContext = jest.fn();
const mockCalendarRangeSpy = jest.fn();

jest.mock('../date_range_picker_context', () => ({
  useDateRangePickerContext: () => mockUseDateRangePickerContext(),
}));

jest.mock('../date_range_picker_panel_ui', () => ({
  PanelContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PanelHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PanelBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PanelFooter: ({
    children,
    primaryAction,
  }: {
    children: React.ReactNode;
    primaryAction?: React.ReactNode;
  }) => (
    <>
      {primaryAction}
      {children}
    </>
  ),
  SubPanelHeading: ({
    children,
    onGoBack,
  }: {
    children: React.ReactNode;
    onGoBack?: () => void;
  }) => (
    <button data-test-subj="back-button" onClick={onGoBack}>
      {children}
    </button>
  ),
}));

/**
 * Calendar mock: renders numbered day buttons for February 2026 (days 1-28).
 * Clicking a day simulates DayPicker's range selection state machine using the
 * current `range` prop.
 */
jest.mock('../calendar', () => {
  const mockReact = jest.requireActual('react');

  function MockCalendar({
    range,
    onRangeChange,
  }: {
    range: { from?: Date; to?: Date } | undefined;
    onRangeChange: (r: { from?: Date; to?: Date } | undefined) => void;
  }) {
    mockCalendarRangeSpy(range);

    const handleClick = (day: number) => {
      const date = new Date(2026, 1, day);

      if (range?.from && !range.to) {
        onRangeChange({ from: range.from, to: date });
      } else {
        onRangeChange({ from: date, to: undefined });
      }
    };

    return mockReact.createElement(
      'div',
      null,
      Array.from({ length: 28 }, (_, i) => i + 1).map((d) =>
        mockReact.createElement('button', { key: d, onClick: () => handleClick(d) }, d)
      )
    );
  }

  return { Calendar: MockCalendar };
});

/** Creates a Date for Feb 2026 with the given components. */
const feb2026 = (day: number, h: number, m: number, s = 0, ms = 0) =>
  new Date(2026, 1, day, h, m, s, ms);

describe('CalendarPanel', () => {
  let user: ReturnType<typeof userEvent.setup>;

  /** Click a day by its number in the February 2026 calendar. */
  const clickDay = (day: number) => user.click(screen.getByRole('button', { name: String(day) }));

  const applyRange = jest.fn();
  const onPresetSave = jest.fn();
  const setText = jest.fn((newText: string) => {
    const parsed = textToTimeRange(newText);
    const current = mockUseDateRangePickerContext();

    mockUseDateRangePickerContext.mockReturnValue({
      ...current,
      text: newText,
      timeRange: { ...current.timeRange, startDate: parsed.startDate, endDate: parsed.endDate },
    });
  });

  const defaultSettings = { roundRelativeTime: true };

  /** Context with computed dates. */
  const makeContext = (
    type: [string, string],
    startDate = new Date(2026, 1, 1, 10, 15, 30, 500),
    endDate = new Date(2026, 1, 2, 12, 45, 0, 0)
  ) => ({
    applyRange,
    onPresetSave,
    setText,
    settings: defaultSettings,
    text: formatDateRange(startDate, endDate),
    timeRange: {
      startDate,
      endDate,
      type,
      isInvalid: false,
    },
  });

  /** Context without computed dates (e.g., invalid or empty input). */
  const makeContextNoDates = () => ({
    applyRange,
    onPresetSave,
    setText,
    settings: defaultSettings,
    text: '',
    timeRange: {
      startDate: null,
      endDate: null,
      type: [DATE_TYPE_RELATIVE, DATE_TYPE_NOW] as [string, string],
      isInvalid: false,
    },
  });

  beforeEach(() => {
    user = userEvent.setup();
    applyRange.mockClear();
    onPresetSave.mockClear();
    setText.mockClear();
    mockCalendarRangeSpy.mockClear();
    mockUseDateRangePickerContext.mockReturnValue(
      makeContext([DATE_TYPE_ABSOLUTE, DATE_TYPE_ABSOLUTE])
    );
  });

  describe('initialization', () => {
    it('converts to absolute format on mount, preserving existing times', () => {
      renderWithEuiTheme(<CalendarPanel />);

      expect(setText).toHaveBeenCalledWith(
        formatDateRange(feb2026(1, 10, 15, 30, 500), feb2026(2, 12, 45, 0, 0))
      );
    });

    it('does not call setText on mount when no dates are available', () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      expect(setText).not.toHaveBeenCalled();
    });
  });

  describe('date normalization', () => {
    it('always uses start/end of day when selecting new dates', async () => {
      mockUseDateRangePickerContext.mockReturnValue(
        makeContext(
          [DATE_TYPE_ABSOLUTE, DATE_TYPE_ABSOLUTE],
          new Date(2026, 1, 1, 14, 30, 45, 123),
          new Date(2026, 1, 2, 18, 15, 30, 456)
        )
      );
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);
      await clickDay(15);

      expect(setText).toHaveBeenLastCalledWith(
        formatDateRange(feb2026(10, 0, 0, 0, 0), feb2026(15, 23, 59, 59, 999))
      );
    });

    it('uses start/end of day when selecting the same day twice', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);
      await clickDay(10);

      expect(setText).toHaveBeenLastCalledWith(
        formatDateRange(feb2026(10, 0, 0, 0, 0), feb2026(10, 23, 59, 59, 999))
      );
    });
  });

  describe('date selection', () => {
    it('calls setText with a full-day range when only the first date is clicked', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);

      expect(setText).toHaveBeenCalledWith(
        formatDateRange(feb2026(10, 0, 0), feb2026(10, 23, 59, 59, 999))
      );
    });

    it('calls setText with the formatted range after both dates are selected', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);
      await clickDay(15);

      expect(setText).toHaveBeenLastCalledWith(
        formatDateRange(feb2026(10, 0, 0), feb2026(15, 23, 59, 59, 999))
      );
    });

    it('resets to a new full-day range when clicking after a complete selection', async () => {
      mockUseDateRangePickerContext.mockReturnValue(
        makeContext(
          [DATE_TYPE_ABSOLUTE, DATE_TYPE_ABSOLUTE],
          new Date(2026, 1, 1, 14, 30, 45, 123),
          new Date(2026, 1, 2, 18, 15, 30, 456)
        )
      );
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(20);

      expect(setText).toHaveBeenCalledWith(
        formatDateRange(feb2026(20, 0, 0), feb2026(20, 23, 59, 59, 999))
      );
    });
  });

  describe('invalid range', () => {
    it('leaves the calendar unselected when the range is invalid', () => {
      // End date in the future
      mockUseDateRangePickerContext.mockReturnValue({
        ...makeContext([DATE_TYPE_ABSOLUTE, DATE_TYPE_NOW]),
        timeRange: {
          startDate: feb2026(20, 0, 0),
          endDate: feb2026(15, 23, 59, 59, 999),
          type: [DATE_TYPE_ABSOLUTE, DATE_TYPE_NOW] as [string, string],
          isInvalid: true,
        },
      });

      renderWithEuiTheme(<CalendarPanel />);

      expect(mockCalendarRangeSpy).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe('Apply button', () => {
    it('is disabled when no dates are selected', () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('is enabled after a single day is selected (full-day range)', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);

      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });

    it('is enabled when initialized with a valid date range', () => {
      renderWithEuiTheme(<CalendarPanel />);

      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });

    it('becomes enabled as soon as a day is selected and stays enabled for a range', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

      await clickDay(10);
      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();

      await clickDay(15);
      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });

    it('delegates to applyRange() so the current input range is applied', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);
      await clickDay(15);
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      // Applies the resolved range from `text` (matching the Enter key)
      expect(applyRange).toHaveBeenCalledWith();
    });

    it('calls onPresetSave with a precision-aware display label when Save as preset is checked', async () => {
      mockUseDateRangePickerContext.mockReturnValue({
        ...makeContextNoDates(),
        settings: { ...defaultSettings, timePrecision: 'none' },
      });
      renderWithEuiTheme(<CalendarPanel />);

      await user.click(screen.getByRole('checkbox', { name: 'Save as preset' }));
      await clickDay(10);
      await clickDay(15);
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      // 'none' precision drops the seconds, and the label is display-only (uses the → delimiter).
      expect(onPresetSave).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringMatching(/^Feb 10(?:, 2026)?, 00:00 → Feb 15(?:, 2026)?, 23:59$/),
        })
      );
    });

    it('does not call onPresetSave when Save as preset is unchecked', async () => {
      mockUseDateRangePickerContext.mockReturnValue(makeContextNoDates());
      renderWithEuiTheme(<CalendarPanel />);

      await clickDay(10);
      await clickDay(15);
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(onPresetSave).not.toHaveBeenCalled();
    });

    it('preserves manually edited times when applying (does not floor to day boundaries)', async () => {
      // Mid-day times, clearly distinct from the 00:00:00 / 23:59:59 day
      // boundaries, simulate the user editing the time in the input after
      // selecting days in the calendar.
      const editedStart = feb2026(11, 9, 15, 42, 0);
      const editedEnd = feb2026(13, 17, 48, 8, 0);

      mockUseDateRangePickerContext.mockReturnValue(
        makeContext([DATE_TYPE_ABSOLUTE, DATE_TYPE_ABSOLUTE], editedStart, editedEnd)
      );
      renderWithEuiTheme(<CalendarPanel />);

      await user.click(screen.getByRole('checkbox', { name: 'Save as preset' }));
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(applyRange).toHaveBeenCalledWith();

      // The edited times are preserved when saving as a preset, not floored
      expect(onPresetSave).toHaveBeenCalledWith(
        expect.objectContaining({
          start: editedStart.toISOString(),
          end: editedEnd.toISOString(),
        })
      );
    });
  });

  describe('back navigation', () => {
    it('restores original text when going back', async () => {
      const originalText = 'Last 15 minutes';

      mockUseDateRangePickerContext.mockReturnValue({
        ...makeContext([DATE_TYPE_RELATIVE, DATE_TYPE_NOW]),
        text: originalText,
      });

      renderWithEuiTheme(<CalendarPanel />);

      setText.mockClear();

      await user.click(screen.getByTestId('back-button'));

      expect(setText).toHaveBeenCalledWith(originalText);
    });
  });
});
