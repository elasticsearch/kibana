/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { startTaskTimer, startEventLoopMonitoring } from './task_events';

const DelayIterations = 4;
const DelayMillis = 250;
const DelayTotal = DelayIterations * DelayMillis;

async function basicNonBlockingDelay(millis: number) {
  await new Promise((resolve) => setTimeout(resolve, millis));
}

async function nonBlockingDelay(millis: number) {
  // can't just use basicNonBlockingDelay because:
  // https://github.com/nodejs/node/issues/26578
  const end = Date.now() + millis;

  while (Date.now() <= end) {
    await basicNonBlockingDelay(millis);
  }
}

async function blockingDelay(millis: number) {
  // get task in async queue
  await nonBlockingDelay(0);

  const end = Date.now() + millis;

  // eslint-disable-next-line no-empty
  while (Date.now() <= end) {}
}

async function nonBlockingTask() {
  for (let i = 0; i < DelayIterations; i++) {
    await nonBlockingDelay(DelayMillis);
  }
}

async function blockingTask() {
  for (let i = 0; i < DelayIterations; i++) {
    await blockingDelay(DelayMillis);
  }
}

describe('task_events', () => {
  test('startTaskTimer', async () => {
    const stopTaskTimer = startTaskTimer();
    await nonBlockingTask();
    const result = stopTaskTimer();
    expect(result.stop - result.start).not.toBeLessThan(DelayTotal);
    expect(result.eventLoopBlockMs).toBe(undefined);
  });

  describe('startEventLoopMonitoring', () => {
    test('non-blocking', async () => {
      const stopMonitoring = startEventLoopMonitoring({
        monitor: true,
        warn_threshold: 5000,
      });
      await nonBlockingTask();
      const eventLoopBlockMs = stopMonitoring();
      expect(eventLoopBlockMs).toBeLessThan(DelayMillis);
    });

    test('blocking', async () => {
      const stopMonitoring = startEventLoopMonitoring({
        monitor: true,
        warn_threshold: 5000,
      });
      await blockingTask();
      const eventLoopBlockMs = stopMonitoring();
      expect(eventLoopBlockMs).not.toBeLessThan(DelayMillis);
    });

    test('not monitoring', async () => {
      const stopMonitoring = startEventLoopMonitoring({
        monitor: false,
        warn_threshold: 5000,
      });
      await blockingTask();
      const eventLoopBlockMs = stopMonitoring();
      expect(eventLoopBlockMs).toBe(0);
    });
  });
});
