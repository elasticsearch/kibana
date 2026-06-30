/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics, type AnalyticsClient } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import { changeHistoryTelemetryEvents } from './events';
import { registerChangeHistoryTelemetryEvents } from './register_change_history_telemetry_events';
import { ChangeHistoryTelemetryEventTypes } from './types';

describe('registerChangeHistoryTelemetryEvents', () => {
  let analyticsClient: AnalyticsClient;

  beforeEach(() => {
    analyticsClient = createAnalytics({
      isDev: true,
      logger: loggerMock.create(),
    });
  });

  it('registers every change-history event type', () => {
    const registerEventType = jest.spyOn(analyticsClient, 'registerEventType');

    registerChangeHistoryTelemetryEvents(analyticsClient);

    expect(registerEventType).toHaveBeenCalledTimes(changeHistoryTelemetryEvents.length);
    expect(registerEventType).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: ChangeHistoryTelemetryEventTypes.Opened,
      })
    );
  });

  it('does not throw when called twice', () => {
    registerChangeHistoryTelemetryEvents(analyticsClient);

    expect(() => registerChangeHistoryTelemetryEvents(analyticsClient)).not.toThrow();
  });

  it('rethrows unexpected registration errors', () => {
    const registerEventType = jest
      .spyOn(analyticsClient, 'registerEventType')
      .mockImplementation(() => {
        throw new Error('Unexpected registration failure');
      });

    expect(() => registerChangeHistoryTelemetryEvents(analyticsClient)).toThrow(
      'Unexpected registration failure'
    );

    registerEventType.mockRestore();
  });
});
