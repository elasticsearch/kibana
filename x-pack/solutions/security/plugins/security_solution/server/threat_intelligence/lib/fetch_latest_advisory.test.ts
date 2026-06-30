/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAdvisoryStaleForDashboard } from './fetch_latest_advisory';

describe('isAdvisoryStaleForDashboard', () => {
  const base = {
    advisoryCategories: [] as string[],
    advisoryRegions: [] as string[],
    advisoryTimeFrom: '2026-04-01T00:00:00.000Z',
    advisoryTimeTo: '2026-05-01T00:00:00.000Z',
    advisoryReportIds: ['r1', 'r2', 'r3', 'r4'],
    dashboardCategories: [] as string[],
    dashboardRegions: [] as string[],
    dashboardFrom: '2026-04-15T00:00:00.000Z',
    dashboardTo: '2026-05-15T00:00:00.000Z',
    scopedReportIds: ['r1', 'r2', 'r3', 'r4'],
  };

  it('returns false when filters and report overlap match', () => {
    expect(isAdvisoryStaleForDashboard(base)).toBe(false);
  });

  it('returns true when dashboard categories differ', () => {
    expect(
      isAdvisoryStaleForDashboard({
        ...base,
        advisoryCategories: ['malware'],
        dashboardCategories: ['phishing'],
      })
    ).toBe(true);
  });

  it('returns true when report overlap is low', () => {
    expect(
      isAdvisoryStaleForDashboard({
        ...base,
        scopedReportIds: ['other'],
      })
    ).toBe(true);
  });

  it('returns true when time ranges do not overlap', () => {
    expect(
      isAdvisoryStaleForDashboard({
        ...base,
        advisoryTimeFrom: '2026-01-01T00:00:00.000Z',
        advisoryTimeTo: '2026-01-31T00:00:00.000Z',
        dashboardFrom: '2026-06-01T00:00:00.000Z',
        dashboardTo: '2026-06-30T00:00:00.000Z',
      })
    ).toBe(true);
  });
});
