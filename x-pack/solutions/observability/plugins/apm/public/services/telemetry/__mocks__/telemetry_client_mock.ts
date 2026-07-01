/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ITelemetryClient } from '../types';

export const mockTelemetryClient: ITelemetryClient = {
  reportSearchQuerySubmitted: jest.fn(),
  reportSloOverviewFlyoutViewed: jest.fn(),
  reportSloOverviewFlyoutSearchQueried: jest.fn(),
  reportSloOverviewFlyoutStatusFiltered: jest.fn(),
  reportSloInfoShown: jest.fn(),
  reportServiceMapDagreLayoutFallback: jest.fn(),
  reportServiceMapAddedToDashboard: jest.fn(),
  reportMetricsCalloutDateRangeSelected: jest.fn(),
  reportMetricsCalloutLoaded: jest.fn(),
  reportServiceFlyoutViewed: jest.fn(),
};
