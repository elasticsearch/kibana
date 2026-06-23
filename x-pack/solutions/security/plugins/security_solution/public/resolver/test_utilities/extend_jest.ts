/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MatcherHintOptions } from 'jest-matcher-utils';

/**
 * Typescript won't allow global namespace stuff unless you're in a module.
 * This wouldn't otherwise be a module. The code runs as soon as it's imported.
 * This is done this way because the `declare` will be active on import, so in
 * order to be correct, the code that the `declare` declares needs to be available on import as well.
 */
export {};

declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace jest {
    interface Matchers<R, T> {
      toYieldEqualTo(expectedYield: T extends AsyncIterable<infer E> ? E : never): Promise<R>;
      toYieldObjectEqualTo(expectedYield: unknown): Promise<R>;
    }
  }
}

expect.extend({
  /**
   * A custom matcher that takes an async generator and compares each value it yields to an expected value.
   * If any yielded value deep-equals the expected value, the matcher will pass.
   * If the generator ends with none of the yielded values matching, it will fail.
   */
  async toYieldEqualTo<T>(
    this: jest.MatcherContext,
    receivedIterable: AsyncIterable<T>,
    expected: T
  ): Promise<{ pass: boolean; message: () => string }> {
    // Used in printing out the pass or fail message
    const matcherName = 'toYieldEqualTo';
    const options: MatcherHintOptions = {
      comment: 'deep equality with any yielded value',
      isNot: this.isNot,
      promise: this.promise,
    };
    // The last value received: Used in printing the message
    const received: T[] = [];

    // Set to true if the test passes.
    let lastCheckPassed: boolean = false;

    // Async iterate over the iterable
    for await (const next of receivedIterable) {
      // keep track of all received values. Used in pass and fail messages
      received.push(next);
      // Use deep equals to compare the value to the expected value
      if (this.equals(next, expected)) {
        lastCheckPassed = true;
        break;
      }
    }

    // Use `pass` as set in the above loop (or initialized to `false`)
    // See https://jestjs.io/docs/en/expect#custom-matchers-api and https://jestjs.io/docs/en/expect#thisutils
    const message = lastCheckPassed
      ? () =>
          `${this.utils.matcherHint(matcherName, undefined, undefined, options)}\n\n` +
          `Expected: not ${this.utils.printExpected(expected)}\n${
            this.utils.stringify(expected) !== this.utils.stringify(received[received.length - 1])
              ? `Received:     ${this.utils.printReceived(received[received.length - 1])}`
              : ''
          }`
      : () =>
          `${this.utils.matcherHint(matcherName, undefined, undefined, options)}\n\nCompared ${
            received.length
          } yields.\n\n${received
            .map(
              (next, index) =>
                `yield ${index + 1}:\n\n${this.utils.printDiffOrStringify(
                  expected,
                  next,
                  'Expected',
                  'Received',
                  Boolean(this.expand)
                )}`
            )
            .join(`\n\n`)}`;

    return { message, pass: lastCheckPassed };
  },
  /**
   * A custom matcher that takes an async generator and compares each value it yields to an expected value.
   * This uses the same equality logic as `toMatchObject`.
   * If any yielded value equals the expected value, the matcher will pass.
   * If the generator ends with none of the yielded values matching, it will fail.
   */
  async toYieldObjectEqualTo<T>(
    this: jest.MatcherContext,
    receivedIterable: AsyncIterable<T>,
    expected: T
  ): Promise<{ pass: boolean; message: () => string }> {
    // Used in printing out the pass or fail message
    const matcherName = 'toYieldObjectEqualTo';
    const options: MatcherHintOptions = {
      comment: 'subset equality with any yielded value',
      isNot: this.isNot,
      promise: this.promise,
    };
    // The last value received: Used in printing the message
    const received: T[] = [];

    // Set to true if the test passes.
    let pass: boolean = false;

    // Async iterate over the iterable
    for await (const next of receivedIterable) {
      // keep track of all received values. Used in pass and fail messages
      received.push(next);
      // Use deep equals to compare the value to the expected value
      if ((this.equals(next, expected), [this.utils.iterableEquality, this.utils.subsetEquality])) {
        // If the value is equal, break
        pass = true;
        break;
      }
    }

    // Use `pass` as set in the above loop (or initialized to `false`)
    // See https://jestjs.io/docs/en/expect#custom-matchers-api and https://jestjs.io/docs/en/expect#thisutils
    const message = pass
      ? () =>
          `${this.utils.matcherHint(matcherName, undefined, undefined, options)}\n\n` +
          `Expected: not ${this.utils.printExpected(expected)}\n${
            this.utils.stringify(expected) !== this.utils.stringify(received[received.length - 1])
              ? `Received:     ${this.utils.printReceived(received[received.length - 1])}`
              : ''
          }`
      : () =>
          `${this.utils.matcherHint(matcherName, undefined, undefined, options)}\n\nCompared ${
            received.length
          } yields.\n\n${received
            .map(
              (next, index) =>
                `yield ${index + 1}:\n\n${this.utils.printDiffOrStringify(
                  expected,
                  next,
                  'Expected',
                  'Received',
                  Boolean(this.expand)
                )}`
            )
            .join(`\n\n`)}`;

    return { message, pass };
  },
});
