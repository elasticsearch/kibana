/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DeferredInitService } from './deferred_init_service';

describe('DeferredInitService', () => {
  let http: { get: jest.Mock };
  let service: DeferredInitService;

  beforeEach(() => {
    jest.useFakeTimers();
    http = { get: jest.fn() };
    service = new DeferredInitService();
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  it('polls the status endpoint for the given plugin id and emits status changes', async () => {
    http.get
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'idle' })
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'initializing' })
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'available' });

    const emissions: unknown[] = [];
    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe((status) => emissions.push(status));

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    expect(http.get).toHaveBeenCalledWith('/internal/core/deferred_init/pluginA');
    expect(emissions).toEqual([
      { status: 'idle', error: undefined, attempts: undefined },
      { status: 'initializing', error: undefined, attempts: undefined },
      { status: 'available', error: undefined, attempts: undefined },
    ]);

    subscription.unsubscribe();
  });

  it('stops polling once available, since the status is terminal', async () => {
    http.get
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'initializing' })
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'available' });

    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe();

    await jest.advanceTimersByTimeAsync(0); // initializing
    await jest.advanceTimersByTimeAsync(1000); // available -> the shared observable completes
    expect(http.get).toHaveBeenCalledTimes(2);

    // Once available, further timer ticks must not keep hitting the endpoint for the app's
    // entire mounted lifetime.
    await jest.advanceTimersByTimeAsync(5000);
    expect(http.get).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });

  it('carries the error message and attempt count through when failed', async () => {
    http.get.mockResolvedValue({
      pluginId: 'pluginA',
      status: 'failed',
      error: { message: 'boom' },
      attempts: 2,
    });

    const emissions: unknown[] = [];
    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe((status) => emissions.push(status));

    await jest.advanceTimersByTimeAsync(0);

    expect(emissions).toEqual([{ status: 'failed', error: { message: 'boom' }, attempts: 2 }]);

    subscription.unsubscribe();
  });

  it('does not re-emit when polling the same failed status repeatedly', async () => {
    http.get.mockResolvedValue({
      pluginId: 'pluginA',
      status: 'failed',
      error: { message: 'boom' },
      attempts: 1,
    });

    const emissions: unknown[] = [];
    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe((status) => emissions.push(status));

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    expect(emissions).toHaveLength(1);

    subscription.unsubscribe();
  });

  it('shares a single poll loop across multiple subscribers to the same plugin id', async () => {
    http.get.mockResolvedValue({ pluginId: 'pluginA', status: 'available' });

    const { getStatus$ } = service.start({ http: http as any });
    const subA = getStatus$('pluginA').subscribe();
    const subB = getStatus$('pluginA').subscribe();

    await jest.advanceTimersByTimeAsync(0);

    expect(http.get).toHaveBeenCalledTimes(1);

    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('swallows a transient fetch error and keeps polling on the next tick', async () => {
    http.get
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ pluginId: 'pluginA', status: 'available' });

    const emissions: unknown[] = [];
    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe((status) => emissions.push(status));

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);

    expect(emissions).toEqual([{ status: 'available', error: undefined, attempts: undefined }]);

    subscription.unsubscribe();
  });

  it('refresh() forces an immediate re-check outside the normal poll cadence', async () => {
    http.get.mockResolvedValue({ pluginId: 'pluginA', status: 'failed' });

    const { getStatus$, refresh } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(http.get).toHaveBeenCalledTimes(1);

    refresh('pluginA');
    await jest.advanceTimersByTimeAsync(0);
    expect(http.get).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });

  it('stop() completes the shared observable so no further emissions occur', async () => {
    http.get.mockResolvedValue({ pluginId: 'pluginA', status: 'initializing' });

    const emissions: unknown[] = [];
    const { getStatus$ } = service.start({ http: http as any });
    const subscription = getStatus$('pluginA').subscribe((status) => emissions.push(status));
    await jest.advanceTimersByTimeAsync(0);

    service.stop();
    await jest.advanceTimersByTimeAsync(5000);

    expect(emissions).toEqual([{ status: 'initializing', error: undefined, attempts: undefined }]);
    subscription.unsubscribe();
  });
});
