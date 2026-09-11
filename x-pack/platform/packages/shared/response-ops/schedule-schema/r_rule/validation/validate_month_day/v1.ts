/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Validates a single BYMONTHDAY value where 1 to 31 counts forward from the start of the month and
 * -1 is the last day of it. RFC 5545 also allows -31 to -2, but the recurring schedule form cannot
 * express those, so accepting them would let API clients store schedules the edit UI silently
 * rewrites.
 */
export const validateMonthDay = (value: number, fieldName: string) => {
  if (!Number.isInteger(value) || value === 0) {
    return `${fieldName} must be an integer between 1 and 31, or -1 for the last day of the month.`;
  }
};
