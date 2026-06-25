/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiCheckboxGroup,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiRadioGroup,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiCheckboxGroupOption, EuiRadioGroupOption } from '@elastic/eui';
import type { WeekdayStr } from '@kbn/rrule';
import {
  AT_LEAST_ONE_DAY_ERROR,
  DAYS_OF_WEEK_LABEL,
  DAY_FR,
  DAY_MO,
  DAY_SA,
  DAY_SU,
  DAY_TH,
  DAY_TU,
  DAY_WE,
  FREQUENCY_CUSTOM,
  FREQUENCY_DAILY,
  FREQUENCY_LABEL,
  REPEAT_EVERY_LABEL,
  UNIT_WEEKS,
} from './translations';
import type { FrequencyMode, RecurrenceFormState } from './types';
import { clampInt, WEEKDAY_TOKENS } from './types';

export interface FrequencySelectorProps {
  value: RecurrenceFormState;
  onChange: (next: RecurrenceFormState) => void;
  disabled?: boolean;
  /** Validation flag — surfaces the "select at least one day" error in Custom. */
  weekdaysError?: boolean;
  /** Test-only override; product code uses an instance-scoped `useGeneratedHtmlId` (see below). */
  idPrefix?: string;
}

// Daily + Custom (weekly) only for the initial release. To re-enable the other
// frequencies, add entries here plus the matching `FrequencyMode` tokens in `./types`.
interface FrequencyOptionTemplate {
  suffix: string;
  label: string;
  mode: FrequencyMode;
}
const FREQUENCY_OPTION_TEMPLATES: FrequencyOptionTemplate[] = [
  { suffix: 'daily', label: FREQUENCY_DAILY, mode: 'daily' },
  { suffix: 'custom', label: FREQUENCY_CUSTOM, mode: 'custom' },
];

const WEEKDAY_LABEL: Record<WeekdayStr, string> = {
  MO: DAY_MO,
  TU: DAY_TU,
  WE: DAY_WE,
  TH: DAY_TH,
  FR: DAY_FR,
  SA: DAY_SA,
  SU: DAY_SU,
};

const isFrequencyMode = (value: string): value is FrequencyMode =>
  FREQUENCY_OPTION_TEMPLATES.some((opt) => opt.mode === value);

export const FrequencySelector = ({
  value,
  onChange,
  disabled,
  weekdaysError,
  idPrefix,
}: FrequencySelectorProps) => {
  // Instance-scoped so a pack form + open query flyout on the same page don't
  // share radio/checkbox ids (a shared id makes `<label htmlFor>` toggle the wrong one).
  const generatedIdPrefix = useGeneratedHtmlId({ prefix: 'osquery-frequency-selector' });
  const basePrefix = idPrefix ?? generatedIdPrefix;
  const frequencyIdPrefix = `${basePrefix}-option`;
  const weekdayIdPrefix = `${basePrefix}-weekday`;

  // `EuiRadioGroup` / `EuiCheckboxGroup` hard-code `flex-direction: column` and
  // expose no horizontal prop, so overriding their flex via the `css` prop is
  // the only supported way to lay the options out in a row.
  const { euiTheme } = useEuiTheme();
  const horizontalGroupCss = useMemo(
    () => ({ flexDirection: 'row', flexWrap: 'wrap', gap: euiTheme.size.base } as const),
    [euiTheme.size.base]
  );

  const frequencyOptions = useMemo<Array<EuiRadioGroupOption & { mode: FrequencyMode }>>(
    () =>
      FREQUENCY_OPTION_TEMPLATES.map(({ suffix, label, mode }) => ({
        id: `${frequencyIdPrefix}-${suffix}`,
        label,
        mode,
      })),
    [frequencyIdPrefix]
  );

  const optionIdForMode = useCallback(
    (mode: FrequencyMode): string =>
      frequencyOptions.find((opt) => opt.mode === mode)?.id ?? frequencyOptions[0].id,
    [frequencyOptions]
  );

  const modeForOptionId = useCallback(
    (id: string): FrequencyMode | undefined => frequencyOptions.find((opt) => opt.id === id)?.mode,
    [frequencyOptions]
  );

  const handleFrequencyChange = useCallback(
    (optionId: string) => {
      const next = modeForOptionId(optionId);
      if (!next || !isFrequencyMode(next) || next === value.frequency) return;

      // Changing the frequency SHALL clear `_unknown` parts so the new
      // RRULE shape is not silently contaminated by parts that only made
      // sense under the previous frequency.
      onChange({
        ...value,
        frequency: next,
        _unknown: undefined,
      });
    },
    [modeForOptionId, onChange, value]
  );

  const handleIntervalChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(event.target.value);
      const next = clampInt(raw, 1, 9999, value.interval);
      onChange({ ...value, interval: next });
    },
    [onChange, value]
  );

  const tokenForWeekdayId = useCallback(
    (id: string): WeekdayStr | undefined => {
      const suffix = id.startsWith(`${weekdayIdPrefix}-`)
        ? id.slice(weekdayIdPrefix.length + 1)
        : id;

      return (WEEKDAY_TOKENS as readonly string[]).includes(suffix)
        ? (suffix as WeekdayStr)
        : undefined;
    },
    [weekdayIdPrefix]
  );

  const handleWeekdayToggle = useCallback(
    (id: string) => {
      const token = tokenForWeekdayId(id);
      if (!token) return;
      const selected = new Set(value.byweekday);
      if (selected.has(token)) {
        selected.delete(token);
      } else {
        selected.add(token);
      }

      const ordered = WEEKDAY_TOKENS.filter((day) => selected.has(day));
      onChange({ ...value, byweekday: ordered });
    },
    [onChange, tokenForWeekdayId, value]
  );

  const weekdayOptions = useMemo<EuiCheckboxGroupOption[]>(
    () =>
      WEEKDAY_TOKENS.map((token) => ({
        id: `${weekdayIdPrefix}-${token}`,
        label: WEEKDAY_LABEL[token],
        disabled,
      })),
    [disabled, weekdayIdPrefix]
  );

  const weekdayIdToSelectedMap = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const token of WEEKDAY_TOKENS) {
      map[`${weekdayIdPrefix}-${token}`] = value.byweekday.includes(token);
    }

    return map;
  }, [value.byweekday, weekdayIdPrefix]);

  const everyUnitLabel: string | null = value.frequency === 'custom' ? UNIT_WEEKS : null;

  return (
    <EuiFlexGroup direction="column" gutterSize="m" data-test-subj="osquery-frequency-selector">
      <EuiFlexItem>
        <EuiFormRow label={FREQUENCY_LABEL} fullWidth>
          <EuiRadioGroup
            css={horizontalGroupCss}
            options={frequencyOptions.map(({ id, label, mode }) => ({
              id,
              label,
              disabled: disabled || mode === undefined,
            }))}
            idSelected={optionIdForMode(value.frequency)}
            onChange={handleFrequencyChange}
            data-test-subj="osquery-frequency-selector-mode"
          />
        </EuiFormRow>
      </EuiFlexItem>

      {value.frequency === 'custom' ? (
        <EuiFlexItem>
          <EuiPanel color="subdued" hasShadow={false} hasBorder={false} paddingSize="m">
            <EuiFormRow
              label={DAYS_OF_WEEK_LABEL}
              isInvalid={!!weekdaysError}
              error={weekdaysError ? AT_LEAST_ONE_DAY_ERROR : undefined}
              fullWidth
            >
              <EuiCheckboxGroup
                css={horizontalGroupCss}
                options={weekdayOptions}
                idToSelectedMap={weekdayIdToSelectedMap}
                onChange={handleWeekdayToggle}
                data-test-subj="osquery-frequency-selector-weekdays"
              />
            </EuiFormRow>
            {everyUnitLabel ? (
              <EuiFormRow label={REPEAT_EVERY_LABEL} fullWidth>
                <EuiFieldNumber
                  fullWidth
                  min={1}
                  step={1}
                  value={value.interval}
                  onChange={handleIntervalChange}
                  disabled={disabled}
                  append={everyUnitLabel}
                  data-test-subj="osquery-frequency-selector-every"
                />
              </EuiFormRow>
            ) : null}
          </EuiPanel>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
};
