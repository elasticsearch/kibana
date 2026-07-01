/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type PropsWithChildren,
  type RefObject,
  type MutableRefObject,
} from 'react';

import { useGeneratedHtmlId } from '@elastic/eui';

import { useAutoRefresh } from './hooks/use_auto_refresh';
import type {
  TimeRangeBounds,
  TimeRangeBoundsOption,
  TimeRange,
  InitialFocus,
  CalendarOptions,
  DateRangePickerSettings,
} from './types';
import { DATE_RANGE_INPUT_DELIMITER } from './constants';
import { textToTimeRange } from './parse';
import { prettifyValue } from './parse/prettify_value';
import {
  durationToDisplayShortText,
  timeRangeToDisplayText,
  timeRangeToFullFormattedText,
} from './format';
import type { DateRangePickerProps, DateRangePickerOnChangeProps } from './date_range_picker';
import type { TimeWindowButtonsConfig } from './date_range_picker_time_window_buttons';

// TODO agree on the final list
const DEFAULT_PRESETS: TimeRangeBoundsOption[] = [{ start: 'now/d', end: 'now/d', label: 'Today' }];

/** Public context value exposed to consumers via `useDateRangePickerContext`. */
export interface DateRangePickerContextValue {
  /** Current input text */
  text: string;
  /** Whether the current input is invalid */
  isInvalid: boolean;
  /** Update the input text */
  setText: (value: string) => void;
  /**
   * Apply the current text (or an explicit range) as the selected time range.
   * When called with a `TimeRangeBounds`, sets text to that range; otherwise applies current text.
   * Pass an optional `textOverride` to control the input value instead of generating it from the bounds.
   * Calls parent `onChange` and exits editing mode.
   */
  applyRange: (range?: TimeRangeBounds, textOverride?: string) => void;
}

/** Internal context value used by sub-components. */
interface DateRangePickerInternalContextValue extends DateRangePickerContextValue {
  /** Whether the picker is in editing mode (input focused, panel open) or idle. */
  isEditing: boolean;
  /** Toggle editing mode; restores previous text when exiting without applying. */
  setIsEditing: (value: boolean) => void;
  /** Whether to use EUI compressed form styling. */
  compressed: boolean;
  /** Controls whether the idle-state control collapses its text label. */
  collapsed: boolean;
  /** Predefined time range options shown in the Presets section. */
  presets: TimeRangeBoundsOption[];
  /** Recently used time ranges shown in the Recent section. */
  recent: TimeRangeBoundsOption[];
  /** Human-readable display text for the current time range (shown when idle). */
  displayText: string;
  /** Full formatted text including absolute dates, used for tooltips. */
  displayFullFormattedText: string;
  /** Short duration label (e.g., "15m"), or `null` if duration cannot be computed. */
  displayShortDuration: string | null;
  /** Ref to the text input element for focus management. */
  inputRef: RefObject<HTMLInputElement>;
  /** Ref to the trigger button for focus restoration. */
  buttonRef: RefObject<HTMLButtonElement>;
  /** Ref to the popover panel for click-outside detection. */
  panelRef: MutableRefObject<HTMLElement | null>;
  /** Generated HTML id for the dialog panel, used for ARIA `aria-controls`. */
  panelId: string;
  /** Optional initial focus target for the dialog panel. */
  initialFocus?: InitialFocus;
  /** Parsed time range derived from the current text input. */
  timeRange: TimeRange;
  /** Resolved time window buttons config, or `false` when disabled. */
  timeWindowButtonsConfig: TimeWindowButtonsConfig | false;
  /** Called when the user wants to save the current input time range as a preset. */
  onPresetSave?: (option: TimeRangeBoundsOption) => void;
  /** Called when the user wants to delete a saved preset. */
  onPresetDelete?: (option: TimeRangeBoundsOption) => void;
  /**
   * Called when the editing input text changes.
   * @beta
   */
  onInputChange?: (value: string) => void;
  /** Horizontal sizing behavior of the picker. */
  width: NonNullable<DateRangePickerProps['width']>;
  /** Whether the picker is disabled. */
  disabled: boolean;
  /** Whether a loading spinner is shown inside the form control. */
  isLoading: boolean;
  /** Calendar-specific options (e.g. first day of week). */
  calendarOptions?: CalendarOptions;
  /** Current picker settings (e.g. rounding, refresh). */
  settings: DateRangePickerSettings;
  /** Called when the user changes a setting in the settings panel. */
  onSettingsChange: (settings: DateRangePickerSettings) => void;
  /**
   * A valid time zone name from the IANA database, e.g. "America/Los_Angeles".
   * Displayed informally in the panel footer.
   */
  timeZone?: string;
  /** Seconds until the next auto-refresh. While paused, this value is frozen at the last countdown value. `null` when auto-refresh is disabled or the interval is invalid. */
  autoRefreshSecondsRemaining: number | null;
  /** Toggles `settings.autoRefresh.isPaused` (play/pause on the input append). No-op when `settings.autoRefresh` is not set. */
  toggleAutoRefresh: () => void;
  /** Whether an `onRefresh` callback was provided; used to gate auto-refresh UI without exposing the function. */
  hasAutoRefresh: boolean;
  /** Prepends the Kibana server basePath to a URL path. Identity function when not provided. */
  prependBasePath: (path: string) => string;
  /** Whether the current user can access the Advanced Settings management page. */
  canAccessAdvancedSettings: boolean;
}

const DateRangePickerContext = createContext<DateRangePickerInternalContextValue | null>(null);

/**
 * Hook to access the DateRangePicker context.
 * Must be used within a `DateRangePickerProvider`.
 */
export function useDateRangePickerContext(): DateRangePickerInternalContextValue {
  const context = useContext(DateRangePickerContext);
  if (!context) {
    throw new Error('useDateRangePickerContext must be used within a DateRangePickerProvider');
  }
  return context;
}

/**
 * Provider component that owns all DateRangePicker state.
 */
export function DateRangePickerProvider({
  children,
  value,
  defaultValue,
  onChange,
  dateFormat,
  isInvalid = false,
  disabled = false,
  isLoading = false,
  compressed = true,
  collapsed = false,
  showTimeWindowButtons = false,
  presets = DEFAULT_PRESETS,
  recent = [],
  onPresetSave,
  onPresetDelete,
  onInputChange,
  width = 'auto',
  calendarOptions,
  settings = { roundRelativeTime: true },
  onSettingsChange,
  timeZone,
  onRefresh,
  refreshEpoch,
  prependBasePath: prependBasePathProp,
  canAccessAdvancedSettings = false,
}: PropsWithChildren<DateRangePickerProps>) {
  const prependBasePath = useCallback(
    (path: string) => (prependBasePathProp ? prependBasePathProp(path) : path),
    [prependBasePathProp]
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelId = useGeneratedHtmlId({ prefix: 'dateRangePickerPanel' });
  const lastValidText = useRef('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const timePrecision = settings.timePrecision ?? 's';
  const [text, setText] = useState<string>(() =>
    prettifyValue(value ?? defaultValue ?? '', { presets })
  );
  const timeRange: TimeRange = useMemo(
    () =>
      textToTimeRange(text, { presets, dateFormat, roundRelativeTime: settings.roundRelativeTime }),
    [text, presets, dateFormat, settings.roundRelativeTime]
  );
  const displayText = useMemo(
    () => timeRangeToDisplayText(timeRange, { timePrecision }),
    [timeRange, timePrecision]
  );
  const displayFullFormattedText = useMemo(
    () => timeRangeToFullFormattedText(timeRange, { timePrecision: 'ms' }),
    [timeRange]
  );
  const duration =
    timeRange.startDate && timeRange.endDate
      ? { startDate: timeRange.startDate, endDate: timeRange.endDate }
      : null;
  const displayShortDuration = duration
    ? durationToDisplayShortText(duration.startDate, duration.endDate)
    : null;

  useEffect(() => {
    if (typeof value === 'string' && !isEditingRef.current) {
      setText(prettifyValue(value, { presets }));
    }
  }, [value, presets]);

  const timeWindowButtonsConfig: TimeWindowButtonsConfig | false = useMemo(
    () =>
      showTimeWindowButtons === false
        ? false
        : showTimeWindowButtons === true
        ? {}
        : showTimeWindowButtons,
    [showTimeWindowButtons]
  );

  const setIsEditingWithRestore = useCallback(
    (editing: boolean) => {
      if (editing && text) {
        lastValidText.current = text;
      }
      if (!editing) {
        if (typeof value === 'string') {
          setText(prettifyValue(value, { presets }));
        } else if (lastValidText.current) {
          setText(lastValidText.current);
        }
        lastValidText.current = '';
      }
      setIsEditing(editing);
    },
    [text, value, presets]
  );

  const hasAutoRefresh = !!onRefresh;

  const refreshTimerPaused =
    !onRefresh ||
    !settings.autoRefresh ||
    !settings.autoRefresh.isEnabled ||
    settings.autoRefresh.isPaused;

  const { secondsRemaining: autoRefreshSecondsRemaining } = useAutoRefresh({
    isPaused: refreshTimerPaused,
    intervalMs: settings.autoRefresh?.isEnabled ? settings.autoRefresh.intervalMs : 0,
    onRefresh,
    refreshEpoch,
  });

  const toggleAutoRefresh = useCallback(() => {
    if (!settings.autoRefresh) return;

    onSettingsChange({
      ...settings,
      autoRefresh: {
        ...settings.autoRefresh,
        isPaused: !settings.autoRefresh.isPaused,
      },
    });
  }, [settings, onSettingsChange]);

  /** Apply a range: parse it, call `onChange`, and exit editing mode. */
  const applyRange = useCallback(
    (range?: TimeRangeBounds, textOverride?: string) => {
      let rangeToApply: TimeRange;

      if (range) {
        const rangeText =
          textOverride ?? `${range.start} ${DATE_RANGE_INPUT_DELIMITER} ${range.end}`;
        rangeToApply = textToTimeRange(rangeText, {
          presets,
          dateFormat,
          roundRelativeTime: settings.roundRelativeTime,
        });
        setText(rangeText);
      } else {
        rangeToApply = timeRange;
      }

      // When the caller provides absolute bounds (no datemath), preserve them
      // as-is so UTC ISO strings from calendar / time window buttons aren't
      // re-parsed into a different format. Datemath bounds (containing "now")
      // go through the parser which may apply rounding.
      const preserveBounds = range && !range.start.includes('now') && !range.end.includes('now');
      onChange({
        start: preserveBounds ? range.start : rangeToApply.start,
        end: preserveBounds ? range.end : rangeToApply.end,
        startDate: rangeToApply.startDate,
        endDate: rangeToApply.endDate,
        value: rangeToApply.value,
        isInvalid: rangeToApply.isInvalid,
      } satisfies DateRangePickerOnChangeProps);
      setIsEditing(false);
    },
    [onChange, timeRange, presets, dateFormat, settings.roundRelativeTime]
  );

  const contextValue = useMemo<DateRangePickerInternalContextValue>(
    () => ({
      text,
      isInvalid,
      setText,
      applyRange,
      isEditing,
      setIsEditing: setIsEditingWithRestore,
      compressed,
      collapsed,
      displayText,
      displayFullFormattedText,
      displayShortDuration,
      inputRef,
      buttonRef,
      panelRef,
      panelId,
      timeRange,
      timeWindowButtonsConfig,
      presets,
      recent,
      onPresetSave,
      onPresetDelete,
      onInputChange,
      width,
      disabled,
      isLoading,
      calendarOptions,
      settings,
      onSettingsChange,
      timeZone,
      autoRefreshSecondsRemaining,
      toggleAutoRefresh,
      hasAutoRefresh,
      prependBasePath,
      canAccessAdvancedSettings,
    }),
    [
      text,
      isInvalid,
      applyRange,
      isEditing,
      setIsEditingWithRestore,
      compressed,
      collapsed,
      displayText,
      displayFullFormattedText,
      displayShortDuration,
      panelId,
      timeRange,
      timeWindowButtonsConfig,
      presets,
      recent,
      onPresetSave,
      onPresetDelete,
      onInputChange,
      width,
      disabled,
      isLoading,
      calendarOptions,
      settings,
      onSettingsChange,
      timeZone,
      autoRefreshSecondsRemaining,
      toggleAutoRefresh,
      hasAutoRefresh,
      prependBasePath,
      canAccessAdvancedSettings,
    ]
  );

  return (
    <DateRangePickerContext.Provider value={contextValue}>
      {children}
    </DateRangePickerContext.Provider>
  );
}
