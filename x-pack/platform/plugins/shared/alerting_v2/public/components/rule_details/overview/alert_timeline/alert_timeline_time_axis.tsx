/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const TARGET_TICK_COUNT = 7;

interface Tick {
  ms: number;
  label: string;
}

interface StepDef {
  ms: number;
  /** 'second' = snap to second; 'minute' = snap to local minute; 'hour' = snap to local hour; 'day' = snap to local midnight. */
  unit: 'second' | 'minute' | 'hour' | 'day';
}

// Ordered smallest → largest. Picked so adjacent steps are nice multiples.
const STEPS: StepDef[] = [
  { ms: 10 * SECOND_MS, unit: 'second' },
  { ms: 30 * SECOND_MS, unit: 'second' },
  { ms: MINUTE_MS, unit: 'minute' },
  { ms: 2 * MINUTE_MS, unit: 'minute' },
  { ms: 5 * MINUTE_MS, unit: 'minute' },
  { ms: 15 * MINUTE_MS, unit: 'minute' },
  { ms: 30 * MINUTE_MS, unit: 'minute' },
  { ms: HOUR_MS, unit: 'hour' },
  { ms: 3 * HOUR_MS, unit: 'hour' },
  { ms: 6 * HOUR_MS, unit: 'hour' },
  { ms: 12 * HOUR_MS, unit: 'hour' },
  { ms: DAY_MS, unit: 'day' },
  { ms: 2 * DAY_MS, unit: 'day' },
  { ms: 7 * DAY_MS, unit: 'day' },
  { ms: 14 * DAY_MS, unit: 'day' },
  { ms: 30 * DAY_MS, unit: 'day' },
];

const pickStep = (spanMs: number): StepDef => {
  for (const step of STEPS) {
    if (spanMs / step.ms <= TARGET_TICK_COUNT + 2) return step;
  }
  return STEPS[STEPS.length - 1];
};

const snapForward = (ms: number, step: StepDef): number => {
  const d = new Date(ms);
  if (step.unit === 'day') {
    d.setHours(0, 0, 0, 0);
  } else if (step.unit === 'hour') {
    d.setMinutes(0, 0, 0);
  } else if (step.unit === 'minute') {
    d.setSeconds(0, 0);
  } else {
    // second — snap to millisecond boundary
    d.setMilliseconds(0);
  }
  let cursor = d.getTime();
  if (step.unit === 'day') {
    const stepDays = Math.round(step.ms / DAY_MS);
    while (cursor < ms) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + stepDays);
      cursor = next.getTime();
    }
  } else {
    while (cursor < ms) cursor += step.ms;
  }
  return cursor;
};

const buildTicks = (
  windowStartMs: number,
  windowEndMs: number,
  locale: string,
  timeZone?: string
): Tick[] => {
  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowEndMs <= windowStartMs
  )
    return [];

  const span = windowEndMs - windowStartMs;
  const step = pickStep(span);

  const showDate = step.unit === 'day' || span > DAY_MS;
  const showTime = step.unit !== 'day';
  const showSeconds = step.unit === 'second';
  const resolvedTz = timeZone && timeZone !== 'Browser' ? timeZone : undefined;
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: resolvedTz,
    month: showDate ? 'short' : undefined,
    day: showDate ? 'numeric' : undefined,
    hour: showTime ? '2-digit' : undefined,
    minute: showTime ? '2-digit' : undefined,
    second: showSeconds ? '2-digit' : undefined,
    hour12: false,
  });

  const stepDays = step.unit === 'day' ? Math.round(step.ms / DAY_MS) : 0;

  const ticks: Tick[] = [];
  let cursor = snapForward(windowStartMs, step);
  let idx = 0;
  while (cursor <= windowEndMs && idx++ < 200) {
    ticks.push({ ms: cursor, label: formatter.format(new Date(cursor)) });
    if (step.unit === 'day') {
      const next = new Date(cursor);
      next.setDate(next.getDate() + stepDays);
      cursor = next.getTime();
    } else {
      cursor += step.ms;
    }
  }
  return ticks;
};

export interface AlertTimelineTimeAxisProps {
  windowStartMs: number;
  windowEndMs: number;
  /** Kibana `dateFormat:tz` setting. Pass `'Browser'` or omit to use the browser's local timezone. */
  timeZone?: string;
}

/**
 * Top-of-chart date axis. Renders one subdued label per tick inside the
 * window, positioned by absolute percentage offset against the time domain
 * shared with the bars below.
 */
export const AlertTimelineTimeAxis: React.FC<AlertTimelineTimeAxisProps> = ({
  windowStartMs,
  windowEndMs,
  timeZone,
}) => {
  const { euiTheme } = useEuiTheme();
  const ticks = useMemo(
    () => buildTicks(windowStartMs, windowEndMs, i18n.getLocale(), timeZone),
    [windowStartMs, windowEndMs, timeZone]
  );
  const span = windowEndMs - windowStartMs;

  return (
    <div
      css={css`
        position: relative;
        height: ${euiTheme.size.l};
        padding-top: ${euiTheme.size.s};
        border-top: 1px solid ${euiTheme.colors.lightShade};
      `}
      data-test-subj="alertTimelineTimeAxis"
    >
      {ticks.map((tick) => {
        const pct = ((tick.ms - windowStartMs) / span) * 100;
        if (pct > 90) return null;
        return (
          <div
            key={tick.ms}
            css={css`
              position: absolute;
              top: 0;
              padding-right: ${euiTheme.size.s};
              white-space: nowrap;
            `}
            style={{ left: `${pct}%` }}
          >
            <EuiText size="xs" color="subdued">
              {tick.label}
            </EuiText>
          </div>
        );
      })}
    </div>
  );
};
