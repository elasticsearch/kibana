/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, {
  type KeyboardEvent,
  type ChangeEvent,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';

import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiFieldText,
  EuiFormControlButton,
  EuiFormControlLayout,
  EuiToolTip,
  keys,
  useEuiTheme,
} from '@elastic/eui';

import { FOCUSABLE_SELECTOR } from './constants';
import {
  findCorrespondingInputPart,
  getInputScrollLeftToCenter,
  isRelativeToNow,
  resolveInitialFocus,
} from './utils';
import { DateRangePickerAutoRefreshButton } from './date_range_picker_auto_refresh_button';
import { useDateRangePickerContext } from './date_range_picker_context';
import { useSelectTextPartsWithArrowKeys } from './hooks/use_select_text_parts_with_arrow_keys';
import { useInputHintText } from './hooks/use_input_hint_text';
import { inputControlTexts } from './translations';
import { DateRangeValueDisplay } from './date_range_value_display';
import { applyPartModification } from './parse/modify_range_parts';
import type { RangePart } from './parse/parse_range_parts';
import { parseDisplayParts, parseInputParts } from './parse/parse_range_parts';

/**
 * The control portion of the DateRangePicker: displays a button when idle
 * and a text input when editing. Reads all state from context.
 */
export function DateRangePickerControl() {
  const {
    text,
    setText,
    applyRange,
    isInvalid,
    isEditing,
    setIsEditing,
    compressed,
    collapsed,
    displayText,
    isRounded,
    displayFullFormattedText,
    displayShortDuration,
    inputRef,
    buttonRef,
    panelRef,
    panelId,
    initialFocus,
    onInputChange,
    width,
    disabled,
    readOnly,
    isLoading,
    settings,
    hasAutoRefresh,
    autoRefreshSecondsRemaining,
    toggleAutoRefresh,
    timeRange,
    transformOptions,
  } = useDateRangePickerContext();
  const { locale } = transformOptions;
  const { euiTheme } = useEuiTheme();
  const hintText = useInputHintText(text);
  const hintTextPrefix = inputControlTexts.hintTextPrefix;
  // Kept out of `displayText` so it neither becomes a clickable part nor a saved preset label
  const roundedSuffix = isRounded ? inputControlTexts.roundedSuffix : null;
  const accessibleDisplayText = roundedSuffix ? `${displayText} ${roundedSuffix}` : displayText;

  const controlRef = useRef<HTMLDivElement>(null);
  const wasEditingRef = useRef(false);
  const wasClearedRef = useRef(false);
  const clickedDisplayPartRef = useRef<RangePart | null>(null);

  /** Focus the button when transitioning from editing to idle. */
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      wasClearedRef.current = false;
      buttonRef.current?.focus();
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, buttonRef]);

  useSelectTextPartsWithArrowKeys({
    inputRef,
    isActive: isEditing && !wasClearedRef.current,
    initialSelection: 'none',
    rangeType: timeRange.type,
    locale,
    onModifyPart: ({ text: currentText, part, parts, action }) => {
      const newText = applyPartModification(currentText, part, action, parts, locale);
      if (newText === undefined) return undefined;
      setText(newText);
      onInputChange?.(newText);
      return newText;
    },
  });

  const onButtonClick = () => {
    setIsEditing(true);
  };

  const handleDisplayPartClick = (part: RangePart) => {
    clickedDisplayPartRef.current = part;
  };

  /** Handle selecting specific parts when focusing the input */
  useLayoutEffect(() => {
    if (!isEditing || !inputRef.current) return;

    const clickedPart = clickedDisplayPartRef.current;
    clickedDisplayPartRef.current = null;

    if (!clickedPart) return;

    const inputParts = parseInputParts(text, timeRange.type, locale).filter(
      (part) => part.navigable
    );
    const displayParts = parseDisplayParts(displayText, locale);
    const target = findCorrespondingInputPart(inputParts, clickedPart, displayParts);

    if (target) {
      const input = inputRef.current;
      // Optimistic `setSelectionRange` call, might remove after testing is not needed
      input.setSelectionRange(target.start, target.end);
      const requestId = requestAnimationFrame(() => {
        input.setSelectionRange(target.start, target.end);
        input.scrollLeft = getInputScrollLeftToCenter(input, target.start, target.end);
      });
      return () => cancelAnimationFrame(requestId);
    }
  }, [displayText, inputRef, isEditing, text, timeRange.type, locale]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    if (nextValue === '') wasClearedRef.current = true;
    setText(nextValue);
    onInputChange?.(nextValue);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === keys.ENTER && isEditing && text) {
      // Prevent Enter's keyup firing `onButtonClick`
      event.preventDefault();
      applyRange();
    }
    if (event.key === keys.ESCAPE && isEditing) {
      setIsEditing(false);
    }
    if ((event.key === keys.ARROW_DOWN || event.key === keys.ARROW_UP) && isEditing) {
      event.preventDefault();
      resolveInitialFocus(panelRef, initialFocus)?.focus();
    }
  };

  const onInputClear = () => {
    setText('');
    onInputChange?.('');
    inputRef.current?.focus();
  };

  /** Exit editing mode when Tab leaves the control in either direction. */
  const onControlKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== keys.TAB || !isEditing) return;

      const control = controlRef.current;
      if (!control) return;

      const tabbables = Array.from(control.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (tabbables.length === 0) return;

      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const isAtBoundary = event.shiftKey
        ? document.activeElement === first
        : document.activeElement === last;

      if (isAtBoundary) {
        event.preventDefault();
        setIsEditing(false);
      }
    },
    [isEditing, setIsEditing]
  );

  const rangeIsRelativeToNow = isRelativeToNow(timeRange);
  // Hide the badge when not collapsed and the range is relative-to-now,
  // because the label (e.g. "Last 15 minutes") already conveys the duration.
  const hideBadge = rangeIsRelativeToNow && !collapsed;

  // The CSS custom properties are not set by this component,
  // allowing consumers to override the widths; the rem values are defaults.
  const wrapperRestrictedStyles = css`
    inline-size: var(--kbnDateRangePickerWidthRestricted, 21.25rem);
  `;
  // `29rem` might seem too large, but it fits a
  // string like "Jun 15, 2026, 00:00:00 to Jun 17, 2026, 23:59:59"
  const wrapperAutoInputStyles = css`
    inline-size: var(--kbnDateRangePickerInputWidthAuto, 29rem);
  `;
  const tooltipStyles = css`
    max-inline-size: min(58ch, 90vw);
  `;
  const roundedSuffixStyles = css`
    color: ${euiTheme.colors.textSubdued};
    white-space: nowrap;
    margin-inline-end: auto;
  `;
  const inputStyles = css`
    &::selection {
      color: ${euiTheme.colors.textPrimary};
      background-color: ${euiTheme.colors.backgroundLightPrimary};
    }
  `;
  // Temporary until a fix lands in EUI
  const disabledIconOverrideStyles = css`
    .euiFormControlLayoutIcons {
      color: ${euiTheme.colors.textDisabled};
    }
  `;

  return (
    <div
      ref={controlRef}
      onKeyDown={onControlKeyDown}
      css={[
        width === 'restricted'
          ? wrapperRestrictedStyles
          : width === 'auto' && isEditing
          ? wrapperAutoInputStyles
          : undefined,
        disabled && disabledIconOverrideStyles,
      ]}
      data-test-subj="dateRangePickerControlWrapper"
    >
      <EuiFormControlLayout
        icon="calendar"
        compressed={compressed}
        isInvalid={isInvalid}
        isDisabled={disabled}
        readOnly={readOnly}
        isLoading={isLoading}
        fullWidth={width !== 'auto'}
        clear={isEditing && text !== '' ? { onClick: onInputClear } : undefined}
        append={
          hasAutoRefresh && settings.autoRefresh?.isEnabled ? (
            <DateRangePickerAutoRefreshButton
              isPaused={settings.autoRefresh.isPaused}
              intervalMs={settings.autoRefresh.intervalMs}
              secondsRemaining={autoRefreshSecondsRemaining}
              onClick={toggleAutoRefresh}
              disabled={disabled}
            />
          ) : undefined
        }
      >
        {isEditing ? (
          <EuiFieldText
            data-test-subj="dateRangePickerInput"
            role="combobox"
            aria-expanded={isEditing}
            aria-controls={panelId}
            aria-haspopup="dialog"
            autoFocus
            inputRef={inputRef}
            controlOnly
            value={text}
            isInvalid={isInvalid}
            disabled={disabled || readOnly}
            fullWidth={width !== 'auto'}
            onChange={handleInputChange}
            onKeyDown={onInputKeyDown}
            compressed={compressed}
            placeholder={`${hintTextPrefix} "${hintText}"`}
            css={inputStyles}
          />
        ) : (
          <EuiToolTip
            content={
              !disabled && displayFullFormattedText !== displayText
                ? displayFullFormattedText
                : undefined
            }
            display="block"
            css={tooltipStyles}
            offset={euiTheme.base * 0.75}
          >
            <EuiFormControlButton
              css={css`
                /* TODO super fragile selector, we need to find out why
                   is this <span> there at all in EuiFormControlButton */
                .euiButtonEmpty__content > span {
                  display: flex;
                  flex-grow: 1;
                  align-items: center;
                  justify-content: space-between;
                  gap: ${euiTheme.size.xs};
                  max-inline-size: 100%;
                }
              `}
              data-test-subj="dateRangePickerControlButton"
              data-date-range={`${timeRange.start} to ${timeRange.end}`}
              data-refresh-interval={settings.autoRefresh?.intervalMs}
              data-refresh-interval-unit={settings.autoRefresh?.intervalDisplayUnit}
              data-refresh-paused={settings.autoRefresh?.isPaused}
              buttonRef={buttonRef}
              aria-label={collapsed ? accessibleDisplayText : undefined}
              onClick={onButtonClick}
              isInvalid={isInvalid}
              disabled={disabled || readOnly}
              compressed={compressed}
            >
              {!collapsed && (
                <DateRangeValueDisplay
                  displayText={displayText}
                  onPartClick={handleDisplayPartClick}
                  disabled={disabled || readOnly}
                  locale={locale}
                />
              )}
              {!collapsed && roundedSuffix && (
                <>
                  {' '}
                  <span css={roundedSuffixStyles} data-test-subj="dateRangePickerRoundedSuffix">
                    {roundedSuffix}
                  </span>
                </>
              )}
              {!hideBadge && (
                <EuiBadge data-test-subj="dateRangePickerDurationBadge">
                  {displayShortDuration ?? '--'}
                </EuiBadge>
              )}
            </EuiFormControlButton>
          </EuiToolTip>
        )}
      </EuiFormControlLayout>
    </div>
  );
}
