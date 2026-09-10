/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionBudget } from './execution_budget';

describe('ExecutionBudget', () => {
  it('admits queued operations fairly and never exceeds the workflow limit', async () => {
    const budget = new ExecutionBudget(1);
    const signal = new AbortController().signal;
    const releaseFirst = await budget.acquire(signal);
    const order: number[] = [];
    const second = budget.acquire(signal).then((release) => {
      order.push(2);
      return release;
    });
    const third = budget.acquire(signal).then((release) => {
      order.push(3);
      return release;
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    releaseFirst();
    const releaseSecond = await second;
    expect(order).toEqual([2]);
    releaseFirst();
    await Promise.resolve();
    expect(order).toEqual([2]);
    releaseSecond();
    const releaseThird = await third;
    expect(order).toEqual([2, 3]);
    releaseThird();
  });

  it('removes cancelled work from the queue without consuming capacity', async () => {
    const budget = new ExecutionBudget(1);
    const controller = new AbortController();
    const release = await budget.acquire(new AbortController().signal);
    const queued = budget.acquire(controller.signal);
    const failure = expect(queued).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await failure;
    release();
    const next = await budget.acquire(new AbortController().signal);
    next();
  });
});
