/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SignificantEventsAppLocatorDefinition } from './significant_events_app_locator';

describe('SignificantEventsAppLocatorDefinition', () => {
  const locator = new SignificantEventsAppLocatorDefinition();

  it('defaults to the streams tab with no query params', async () => {
    const location = await locator.getLocation({});

    expect(location).toEqual({
      app: 'significantEvents',
      path: '/streams',
      state: {},
    });
  });

  it('builds a path for a specific tab', async () => {
    const { path } = await locator.getLocation({ tab: 'settings' });

    expect(path).toBe('/settings');
  });

  it('builds a path for the cortex tab', async () => {
    const { path } = await locator.getLocation({ tab: 'cortex' });

    expect(path).toBe('/cortex');
  });

  it('serializes scalar query params', async () => {
    const { path } = await locator.getLocation({
      tab: 'significant_events',
      rangeFrom: 'now-24h',
      rangeTo: 'now',
      selectedEvent: 'event-1',
    });

    expect(path).toBe('/significant_events?rangeFrom=now-24h&rangeTo=now&selectedEvent=event-1');
  });

  it('serializes array query params as repeated keys', async () => {
    const { path } = await locator.getLocation({
      tab: 'knowledge_indicators',
      stream: ['logs', 'logs.nginx'],
    });

    expect(path).toBe('/knowledge_indicators?stream=logs&stream=logs.nginx');
  });

  it('omits undefined params', async () => {
    const { path } = await locator.getLocation({
      tab: 'queries',
      search: undefined,
    });

    expect(path).toBe('/queries');
  });
});
