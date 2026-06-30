/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { changeHistoryTelemetryEvents } from '@kbn/change-history-ui/src/telemetry/events';
import { ChangeHistoryTelemetryEventTypes } from '@kbn/change-history-ui/src/telemetry/types';
import { analyticsServiceMock } from '@kbn/core/public/mocks';
import { workflowsTelemetryEvents } from './events/workflows';
import { TelemetryService } from './telemetry_service';

describe('TelemetryService', () => {
  it('registers workflow and change history event types', async () => {
    const analytics = analyticsServiceMock.createAnalyticsServiceSetup();
    const service = new TelemetryService();

    service.setup({ analytics });

    await new Promise((resolve) => setImmediate(resolve));

    const expectedEventCount =
      workflowsTelemetryEvents.length + changeHistoryTelemetryEvents.length;

    expect(analytics.registerEventType).toHaveBeenCalledTimes(expectedEventCount);
    expect(analytics.registerEventType).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: ChangeHistoryTelemetryEventTypes.Opened,
      })
    );
  });
});
