/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Slot-boundary math for the recurrence pickers. The start-date / stop-after
 * `EuiDatePicker`s present time in 30-minute increments (`timeIntervals={30}`),
 * so the default value, the picker `minTime`, and the submit-time validator all
 * need to agree on where those 30-minute slots fall. These pure helpers are the
 * single source of that math (see `design.md` D6).
 */

export const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;

/**
 * Round a date UP to the next 30-minute boundary. A date already on a boundary
 * is returned unchanged. Seconds / milliseconds below a boundary count as "not
 * yet on the boundary" and round up.
 */
export const roundUpTo30Min = (date: Date): Date => {
  const ms = date.getTime();

  return new Date(Math.ceil(ms / SLOT_MS) * SLOT_MS);
};

/**
 * Floor a date DOWN to the start of its 30-minute slot. Used by the submit-time
 * validator: a start date is only "past" once its entire 30-minute window has
 * elapsed, i.e. it is before `floorTo30Min(now)` (design D5).
 */
export const floorTo30Min = (date: Date): Date => {
  const ms = date.getTime();

  return new Date(Math.floor(ms / SLOT_MS) * SLOT_MS);
};
