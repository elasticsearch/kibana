/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * The real mocha types conflict with the global jest types, because
 * globals are terrible. So instead of using any for everything this
 * tries to mock out simple versions of the Mocha types
 */

import type { EventEmitter } from 'events';

export interface Suite extends Runnable {
  _beforeAll: Runnable[];
  _beforeEach: Runnable[];
  _afterEach: Runnable[];
  _afterAll: Runnable[];

  currentTest?: Test;
  suites: Suite[];
  tests: Test[];
  title: string;
  fullTitle(): string;
  file: string;
  parent?: Suite;
  eachTest: (cb: (test: Test) => void) => void;
  root: boolean;
  suiteTag: string;
}

export interface Test extends Runnable {
  fullTitle(): string;
  title: string;
  file?: string;
  parent?: Suite;
  isPassed: () => boolean;
  pending?: boolean;
  err?: Error;
}

export interface Runnable {
  isFailed(): boolean;
  isPending(): boolean;
  duration?: number;
  titlePath(): string[];
  file?: string;
  title: string;
  parent?: Suite;
}

interface Stats {
  suites: number;
  tests: number;
  passes: number;
  pending: number;
  failures: number;
  start?: Date;
  end?: Date;
  duration?: number;
}

export interface Runner extends EventEmitter {
  abort(): void;
  failures: number;
  on(event: 'fail', listener: (test: Test, err: Error) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  uncaught: (error: Error) => void;
  stats?: Stats;
}

export interface Mocha {
  run(cb: () => void): Runner;
}
