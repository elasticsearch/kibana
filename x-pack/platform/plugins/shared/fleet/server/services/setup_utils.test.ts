/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { awaitIfPending } from './setup_utils';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('awaitIfPending', () => {
  it('first promise called blocks others', async () => {
    const fnA = jest.fn().mockImplementation(async () => {});
    const fnB = jest.fn().mockImplementation(async () => {});
    const fnC = jest.fn().mockImplementation(async () => {});
    const fnD = jest.fn().mockImplementation(async () => {});
    const promises = [
      awaitIfPending(fnA),
      awaitIfPending(fnB),
      awaitIfPending(fnC),
      awaitIfPending(fnD),
    ];
    await Promise.all(promises);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(0);
    expect(fnC).toHaveBeenCalledTimes(0);
    expect(fnD).toHaveBeenCalledTimes(0);
  });

  describe('first promise created, not necessarily first fulfilled, sets value for all in queue', () => {
    it('succeeds', async () => {
      const fnA = jest.fn().mockImplementation(async () => {
        await sleep(1000);
        return 'called first';
      });
      const fnB = jest.fn().mockImplementation(async () => 'called second');
      const fnC = jest.fn().mockImplementation(async () => 'called third');
      const fnD = jest.fn().mockImplementation(async () => 'called fourth');
      const promises = [
        awaitIfPending(fnA),
        awaitIfPending(fnB),
        awaitIfPending(fnC),
        awaitIfPending(fnD),
      ];

      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(0);
      expect(fnC).toHaveBeenCalledTimes(0);
      expect(fnD).toHaveBeenCalledTimes(0);
      await expect(Promise.all(promises)).resolves.toEqual([
        'called first',
        'called first',
        'called first',
        'called first',
      ]);
    });

    it('throws', async () => {
      const expectedError = new Error('error is called first');
      const fnA = jest.fn().mockImplementation(async () => {
        await sleep(1000);
        throw expectedError;
      });
      const fnB = jest.fn().mockImplementation(async () => 'called second');
      const fnC = jest.fn().mockImplementation(async () => 'called third');
      const fnD = jest.fn().mockImplementation(async () => 'called fourth');
      const promises = [
        awaitIfPending(fnA),
        awaitIfPending(fnB),
        awaitIfPending(fnC),
        awaitIfPending(fnD),
      ];

      await expect(Promise.all(promises)).rejects.toThrow(expectedError);
      await expect(Promise.allSettled(promises)).resolves.toEqual([
        { status: 'rejected', reason: expectedError },
        { status: 'rejected', reason: expectedError },
        { status: 'rejected', reason: expectedError },
        { status: 'rejected', reason: expectedError },
      ]);

      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(0);
      expect(fnC).toHaveBeenCalledTimes(0);
      expect(fnD).toHaveBeenCalledTimes(0);
    });
  });

  it('does not retain resolved value in module-level status after batch completes', async () => {
    // Each new batch should execute the provided function and not reuse the previous result.
    // This ensures the module-level `status` promise is cleared after resolution so the GC
    // can reclaim any large objects (e.g. ResponseError with ES connection metadata) that were
    // part of the resolved value.
    const firstResult = { large: 'object' };
    const secondResult = { different: 'object' };
    const fnFirst = jest.fn().mockResolvedValue(firstResult);
    const fnSecond = jest.fn().mockResolvedValue(secondResult);

    const result1 = await awaitIfPending(fnFirst);
    expect(result1).toBe(firstResult);
    expect(fnFirst).toHaveBeenCalledTimes(1);

    // After the first batch completes, a new call must run the new function — not reuse the old promise.
    const result2 = await awaitIfPending(fnSecond);
    expect(result2).toBe(secondResult);
    expect(fnSecond).toHaveBeenCalledTimes(1);
  });

  it('does not block other calls after batch is fulfilled. can call again for a new result', async () => {
    const fnA = jest
      .fn()
      .mockImplementationOnce(async () => 'fnA first')
      .mockImplementationOnce(async () => 'fnA second')
      .mockImplementation(async () => 'fnA default/2+');
    const fnB = jest.fn().mockImplementation(async () => {});
    const fnC = jest.fn().mockImplementation(async () => {});
    const fnD = jest.fn().mockImplementation(async () => {});
    let promises = [
      awaitIfPending(fnA),
      awaitIfPending(fnB),
      awaitIfPending(fnC),
      awaitIfPending(fnD),
    ];
    let results = await Promise.all(promises);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(0);
    expect(fnC).toHaveBeenCalledTimes(0);
    expect(fnD).toHaveBeenCalledTimes(0);
    expect(results).toEqual(['fnA first', 'fnA first', 'fnA first', 'fnA first']);

    promises = [awaitIfPending(fnA), awaitIfPending(fnB), awaitIfPending(fnC), awaitIfPending(fnD)];
    results = await Promise.all(promises);
    expect(fnA).toHaveBeenCalledTimes(2);
    expect(fnB).toHaveBeenCalledTimes(0);
    expect(fnC).toHaveBeenCalledTimes(0);
    expect(fnD).toHaveBeenCalledTimes(0);
    expect(results).toEqual(['fnA second', 'fnA second', 'fnA second', 'fnA second']);

    promises = [awaitIfPending(fnA), awaitIfPending(fnB), awaitIfPending(fnC), awaitIfPending(fnD)];
    results = await Promise.all(promises);
    expect(fnA).toHaveBeenCalledTimes(3);
    expect(fnB).toHaveBeenCalledTimes(0);
    expect(fnC).toHaveBeenCalledTimes(0);
    expect(fnD).toHaveBeenCalledTimes(0);
    expect(results).toEqual([
      'fnA default/2+',
      'fnA default/2+',
      'fnA default/2+',
      'fnA default/2+',
    ]);

    promises = [awaitIfPending(fnA), awaitIfPending(fnB), awaitIfPending(fnC), awaitIfPending(fnD)];
    results = await Promise.all(promises);
    expect(fnA).toHaveBeenCalledTimes(4);
    expect(fnB).toHaveBeenCalledTimes(0);
    expect(fnC).toHaveBeenCalledTimes(0);
    expect(fnD).toHaveBeenCalledTimes(0);
    expect(results).toEqual([
      'fnA default/2+',
      'fnA default/2+',
      'fnA default/2+',
      'fnA default/2+',
    ]);
  });
});
