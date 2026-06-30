/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { changeHistoryTelemetryEventNames } from './event_names';
import { changeHistoryTelemetryEventSchemas } from './schemas';
import { changeHistoryTelemetryEvents } from './events';
import { ChangeHistoryTelemetryEventTypes } from './types';

describe('changeHistoryTelemetryEvents', () => {
  it('exports one registerable event per ChangeHistoryTelemetryEventTypes value', () => {
    const eventTypeValues = Object.values(ChangeHistoryTelemetryEventTypes);

    expect(changeHistoryTelemetryEvents).toHaveLength(eventTypeValues.length);
    expect(changeHistoryTelemetryEvents.map(({ eventType }) => eventType).sort()).toEqual(
      [...eventTypeValues].sort()
    );
  });

  it('uses change_history_* event type ids', () => {
    for (const { eventType } of changeHistoryTelemetryEvents) {
      expect(eventType).toMatch(/^change_history_/);
    }
  });

  it('includes scope fields on every schema', () => {
    for (const eventType of Object.values(ChangeHistoryTelemetryEventTypes)) {
      const schema = changeHistoryTelemetryEventSchemas[eventType];

      expect(schema.module).toBeDefined();
      expect(schema.dataset).toBeDefined();
      expect(schema.objectType).toBeDefined();
      expect(schema.eventName).toBeDefined();
    }
  });

  it('defines a human-readable eventName label for every event type', () => {
    for (const eventType of Object.values(ChangeHistoryTelemetryEventTypes)) {
      expect(changeHistoryTelemetryEventNames[eventType]).toBeTruthy();
    }
  });
});
