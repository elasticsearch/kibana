/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChangeHistoryTelemetryEventTypes } from './types';
import { createChangeHistoryTelemetryReporter } from './create_change_history_telemetry_reporter';

const testScope = {
  module: 'stack',
  dataset: 'workflows',
  objectType: 'workflow',
};

describe('createChangeHistoryTelemetryReporter', () => {
  it('reports events with scope fields and eventName merged', () => {
    const reportEvent = jest.fn();
    const telemetry = createChangeHistoryTelemetryReporter({
      analytics: { reportEvent },
      scope: testScope,
    });

    telemetry.reportOpened();
    telemetry.reportChangeSelected({
      hasSequence: true,
      selectionSource: 'user_click',
    });
    telemetry.reportDiffViewed({ comparisonType: 'vs_previous', versionDistance: 1 });

    expect(reportEvent).toHaveBeenCalledTimes(3);
    expect(reportEvent).toHaveBeenNthCalledWith(1, ChangeHistoryTelemetryEventTypes.Opened, {
      eventName: 'Change history opened',
      ...testScope,
    });
    expect(reportEvent).toHaveBeenNthCalledWith(
      2,
      ChangeHistoryTelemetryEventTypes.ChangeSelected,
      {
        eventName: 'Change history change selected',
        ...testScope,
        hasSequence: true,
        selectionSource: 'user_click',
      }
    );
    expect(reportEvent).toHaveBeenNthCalledWith(3, ChangeHistoryTelemetryEventTypes.DiffViewed, {
      eventName: 'Change history diff viewed',
      ...testScope,
      comparisonType: 'vs_previous',
      versionDistance: 1,
    });
  });

  it('is a no-op when analytics is omitted', () => {
    const telemetry = createChangeHistoryTelemetryReporter({ scope: testScope });

    expect(() => telemetry.reportOpened()).not.toThrow();
  });

  it('is a no-op when enabled is false', () => {
    const reportEvent = jest.fn();
    const telemetry = createChangeHistoryTelemetryReporter({
      analytics: { reportEvent },
      scope: testScope,
      enabled: false,
    });

    telemetry.reportOpened();

    expect(reportEvent).not.toHaveBeenCalled();
  });

  it('does not throw when reportEvent fails', () => {
    const reportEvent = jest.fn().mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    const telemetry = createChangeHistoryTelemetryReporter({
      analytics: { reportEvent },
      scope: testScope,
    });

    expect(() => telemetry.reportRestoreFailed({ errorCode: 'RESTORE_CONFLICT' })).not.toThrow();
  });
});
