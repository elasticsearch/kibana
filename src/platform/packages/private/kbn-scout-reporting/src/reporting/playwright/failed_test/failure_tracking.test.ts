/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ToolingLog } from '@kbn/tooling-log';
import type { TestFailure } from '../../report/failed_test/test_failure';
import { ScoutFailureTracker } from './failure_tracking';

const createMockLog = (): ToolingLog =>
  ({
    info: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  } as unknown as ToolingLog);

const createMockFailure = (overrides: Partial<TestFailure> = {}): TestFailure => ({
  id: 'test-id-1',
  suite: 'My Suite',
  title: 'should work',
  target: 'local',
  command: 'node scripts/playwright test',
  location: 'path/to/file.spec.ts:1:1',
  owner: ['@elastic/kibana-scout'],
  duration: 1000,
  error: { message: 'boom', stack_trace: 'stack' },
  attachments: [],
  ...overrides,
});

describe('ScoutFailureTracker', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-failure-tracker-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const readTrackingFile = (tracker: ScoutFailureTracker): TestFailure[] => {
    const filePath = tracker.getTrackingFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  };

  it('writes every tracked failure when no exclusion set is given', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-1');
    tracker.addFailure(createMockFailure({ id: 'a' }));
    tracker.addFailure(createMockFailure({ id: 'b' }));

    tracker.save();

    expect(readTrackingFile(tracker).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('keeps only the last attempt when a test fails on more than one attempt', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-1b');
    tracker.addFailure(createMockFailure({ id: 'flaky-or-hard', duration: 100 }));
    tracker.addFailure(createMockFailure({ id: 'flaky-or-hard', duration: 200 }));

    tracker.save();

    const written = readTrackingFile(tracker);
    expect(written).toHaveLength(1);
    expect(written[0].duration).toBe(200);
  });

  it('drops entries whose id is in excludeTestIds, keeping the rest', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-2');
    tracker.addFailure(createMockFailure({ id: 'flaky-test' }));
    tracker.addFailure(createMockFailure({ id: 'hard-failure' }));

    tracker.save({ excludeTestIds: new Set(['flaky-test']) });

    expect(readTrackingFile(tracker).map((f) => f.id)).toEqual(['hard-failure']);
  });

  it('an empty exclusion set is a no-op', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-3');
    tracker.addFailure(createMockFailure({ id: 'a' }));
    tracker.addFailure(createMockFailure({ id: 'b' }));

    tracker.save({ excludeTestIds: new Set() });

    expect(readTrackingFile(tracker).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('does not write a file when every failure is excluded', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-4');
    tracker.addFailure(createMockFailure({ id: 'flaky-test' }));

    tracker.save({ excludeTestIds: new Set(['flaky-test']) });

    expect(fs.existsSync(tracker.getTrackingFilePath())).toBe(false);
  });

  it('writes runner errors to a sidecar named after the tracking file run id', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-5');

    tracker.saveRunnerErrors({ status: 'failed', errors: ['global teardown threw'] });

    const sidecar = path.join(tempDir, 'scout-runner-errors-run-5.json');
    expect(JSON.parse(fs.readFileSync(sidecar, 'utf-8'))).toEqual({
      status: 'failed',
      errors: ['global teardown threw'],
    });
    // The NDJSON consumed by the GitHub issue reporter must not pick them up.
    expect(fs.existsSync(tracker.getTrackingFilePath())).toBe(false);
  });

  it('does not write a sidecar when there are no runner errors', () => {
    const tracker = new ScoutFailureTracker(createMockLog(), tempDir, 'run-6');

    tracker.saveRunnerErrors({ status: 'passed', errors: [] });

    expect(fs.existsSync(path.join(tempDir, 'scout-runner-errors-run-6.json'))).toBe(false);
  });
});
