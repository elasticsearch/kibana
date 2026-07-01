/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutTestConfig, ScoutTestConfigStatsEntry } from '@kbn/scout-reporting';
import { ScoutTestConfigStats } from '@kbn/scout-reporting';
import { ScoutTestTarget } from '@kbn/scout-info';
import type { ToolingLog } from '@kbn/tooling-log';
import { findPackageForPath } from '@kbn/repo-packages';
import {
  msToHuman,
  identifyTestLoads,
  buildTrack,
  type ScoutCIConfig,
  type ScoutCITestLoad,
} from './create_test_tracks';

jest.mock('@kbn/scout-reporting', () => {
  const actual = jest.requireActual('@kbn/scout-reporting');
  return {
    ...actual,
    testConfigs: {
      get all(): ScoutTestConfig[] {
        return mockTestConfigs;
      },
    },
  };
});

jest.mock('@kbn/repo-packages', () => ({
  findPackageForPath: jest.fn(),
}));

const mockFindPackageForPath = findPackageForPath as jest.Mock;

let mockTestConfigs: ScoutTestConfig[] = [];

const createMockLog = (): ToolingLog =>
  ({
    info: jest.fn(),
    warning: jest.fn(),
    debug: jest.fn(),
    write: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  } as unknown as ToolingLog);

const createMockConfig = (overrides: Partial<ScoutTestConfig> = {}): ScoutTestConfig => ({
  path: 'plugin/test/scout/ui/config.playwright.config.ts',
  category: 'ui',
  type: 'standard',
  namespace: undefined,
  module: {
    name: 'test-plugin',
    group: 'platform',
    type: 'plugin',
    visibility: 'shared',
    root: 'plugin',
  },
  manifest: {
    path: 'plugin/test/scout/.meta/ui/standard.json',
    exists: true,
    sha1: 'abc123',
    tests: [
      {
        id: 'test-1',
        title: 'Test 1',
        expectedStatus: 'passed',
        tags: ['@local-stateful-classic'],
        location: { file: 'test.spec.ts', line: 1, column: 1 },
      },
    ],
  },
  server: { configSet: 'default' },
  ...overrides,
});

const createStatsEntry = (
  configPath: string,
  testTarget: ScoutTestTarget,
  estimate: number
): ScoutTestConfigStatsEntry =>
  ({
    path: configPath,
    test_target: testTarget,
    runCount: 10,
    runtime: {
      avg: estimate,
      median: estimate,
      pc95th: estimate,
      pc99th: estimate,
      max: estimate,
      estimate,
    },
  } as ScoutTestConfigStatsEntry);

describe('msToHuman', () => {
  it('returns "0s" for zero', () => {
    expect(msToHuman(0)).toBe('0s');
  });

  it('returns seconds for values under 60s', () => {
    expect(msToHuman(45000)).toBe('45s');
  });

  it('returns minutes and seconds', () => {
    expect(msToHuman(125000)).toBe('2m 5s');
  });

  it('returns hours, minutes, and seconds', () => {
    expect(msToHuman(3661000)).toBe('1h 1m 1s');
  });

  it('returns only hours when minutes and seconds are 0', () => {
    expect(msToHuman(3600000)).toBe('1h');
  });

  it('handles negative values with a prefix', () => {
    expect(msToHuman(-60000)).toBe('-1m');
  });

  it('returns sub-second string for values between 10ms and 999ms', () => {
    expect(msToHuman(500)).toBe('0.50s');
  });

  it('returns "0s" for values under 10ms', () => {
    expect(msToHuman(5)).toBe('0s');
  });

  it('omits zero-valued components', () => {
    expect(msToHuman(7200000)).toBe('2h');
  });
});

describe('identifyTestLoads', () => {
  const testTarget = new ScoutTestTarget('local', 'stateful', 'classic');
  let log: ToolingLog;

  beforeEach(() => {
    log = createMockLog();
    mockTestConfigs = [];
  });

  it('filters out excluded configs', () => {
    const config = createMockConfig({ path: 'excluded/config.ts' });
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: ['excluded/config.ts'],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(0);
  });

  it('filters configs by test target Playwright tag', () => {
    const matchingConfig = createMockConfig({
      path: 'matching/config.ts',
      manifest: {
        path: 'matching/.meta/ui/standard.json',
        exists: true,
        sha1: 'abc',
        tests: [
          {
            id: 't1',
            title: 'Test',
            expectedStatus: 'passed',
            tags: ['@local-stateful-classic'],
            location: { file: 'test.spec.ts', line: 1, column: 1 },
          },
        ],
      },
    });

    const nonMatchingConfig = createMockConfig({
      path: 'non-matching/config.ts',
      manifest: {
        path: 'non-matching/.meta/ui/standard.json',
        exists: true,
        sha1: 'def',
        tests: [
          {
            id: 't2',
            title: 'Test',
            expectedStatus: 'passed',
            tags: ['@local-serverless-search'],
            location: { file: 'test.spec.ts', line: 1, column: 1 },
          },
        ],
      },
    });

    mockTestConfigs = [matchingConfig, nonMatchingConfig];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].config.path).toBe('matching/config.ts');
  });

  it('marks plugins as disabled when in the disabled list', () => {
    const config = createMockConfig({
      module: {
        name: 'disabled-plugin',
        group: 'platform',
        type: 'plugin',
        visibility: 'shared',
        root: 'plugin',
      },
    });
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: ['disabled-plugin'] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].enabled).toBe(false);
  });

  it('marks plugins as enabled when not in the disabled list', () => {
    const config = createMockConfig();
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].enabled).toBe(true);
  });

  it('marks packages as disabled when in the disabled list', () => {
    const config = createMockConfig({
      module: {
        name: 'disabled-package',
        group: 'platform',
        type: 'package',
        visibility: 'shared',
        root: 'packages/disabled-package',
      },
    });
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: ['disabled-package'] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].enabled).toBe(false);
  });

  it('matches stats by path and test target tag', () => {
    const config = createMockConfig({ path: 'plugin/config.ts' });
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const statsEntry = createStatsEntry('plugin/config.ts', testTarget, 5000);

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [statsEntry],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].stats).toBeDefined();
    expect(loads[0].stats!.path).toBe('plugin/config.ts');
  });

  it('returns undefined stats when no stats match', () => {
    const config = createMockConfig({ path: 'plugin/config.ts' });
    mockTestConfigs = [config];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(1);
    expect(loads[0].stats).toBeUndefined();
  });

  describe('testing-scope filter', () => {
    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };
    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    beforeEach(() => {
      mockFindPackageForPath.mockReset();
    });

    describe('null filter (full scope)', () => {
      it('includes all configs and never resolves module IDs', () => {
        const config = createMockConfig({ path: 'plugin/config.ts' });
        mockTestConfigs = [config];

        const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
        expect(loads).toHaveLength(1);
        expect(mockFindPackageForPath).not.toHaveBeenCalled();
      });
    });

    describe('kind: "modules" (dependency-tree scope)', () => {
      it('includes configs whose resolved module ID is in the filter set', () => {
        const config = createMockConfig({ path: 'plugin/config.ts' });
        mockTestConfigs = [config];
        mockFindPackageForPath.mockReturnValue({ id: '@kbn/test-plugin' });

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'modules', ids: new Set(['@kbn/test-plugin']) },
          log
        );
        expect(loads).toHaveLength(1);
      });

      it('excludes configs whose resolved module ID is not in the filter set', () => {
        const config = createMockConfig({ path: 'plugin/config.ts' });
        mockTestConfigs = [config];
        mockFindPackageForPath.mockReturnValue({ id: '@kbn/other-plugin' });

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'modules', ids: new Set(['@kbn/test-plugin']) },
          log
        );
        expect(loads).toHaveLength(0);
      });

      it('excludes configs that cannot be resolved to a module ID', () => {
        const config = createMockConfig({ path: 'plugin/config.ts' });
        mockTestConfigs = [config];
        mockFindPackageForPath.mockReturnValue(undefined);

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'modules', ids: new Set(['@kbn/test-plugin']) },
          log
        );
        expect(loads).toHaveLength(0);
      });

      it('includes all configs when ids set is empty', () => {
        const config = createMockConfig({ path: 'plugin/config.ts' });
        mockTestConfigs = [config];

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'modules', ids: new Set() },
          log
        );
        expect(loads).toHaveLength(1);
        expect(mockFindPackageForPath).not.toHaveBeenCalled();
      });
    });

    describe('kind: "configs" (tests-only scope)', () => {
      it('includes only configs whose path is in the affected paths set', () => {
        const affected = createMockConfig({ path: 'plugin-a/test/scout/ui/playwright.config.ts' });
        const other = createMockConfig({ path: 'plugin-b/test/scout/ui/playwright.config.ts' });
        mockTestConfigs = [affected, other];

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'configs', paths: new Set([affected.path]) },
          log
        );
        expect(loads).toHaveLength(1);
        expect(loads[0].config.path).toBe(affected.path);
        expect(mockFindPackageForPath).not.toHaveBeenCalled();
      });

      it('excludes everything when affected paths set is empty', () => {
        mockTestConfigs = [createMockConfig({ path: 'plugin/config.ts' })];

        const loads = identifyTestLoads(
          ciConfig,
          stats,
          testTarget,
          { kind: 'configs', paths: new Set() },
          log
        );
        expect(loads).toHaveLength(0);
      });
    });
  });

  it('returns empty array and logs warning when no configs match', () => {
    mockTestConfigs = [];

    const ciConfig: ScoutCIConfig = {
      plugins: { enabled: [], disabled: [] },
      packages: { enabled: [], disabled: [] },
      excluded_configs: [],
    };

    const stats = new ScoutTestConfigStats({
      lastUpdated: new Date(),
      lookbackDays: 3,
      buildkite: {},
      configs: [],
    });

    const loads = identifyTestLoads(ciConfig, stats, testTarget, null, log);
    expect(loads).toHaveLength(0);
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('No test loads discovered'));
  });
});

describe('buildTrack', () => {
  const testTarget = new ScoutTestTarget('local', 'stateful', 'classic');
  let log: ToolingLog;

  beforeEach(() => {
    log = createMockLog();
  });

  const createTestLoad = (
    path: string,
    estimate: number,
    type: string = 'standard',
    stats?: ScoutTestConfigStatsEntry
  ): ScoutCITestLoad => ({
    config: createMockConfig({ path, type, server: { configSet: 'default' } }),
    enabled: true,
    stats: stats || createStatsEntry(path, testTarget, estimate),
  });

  it('sets testTarget metadata on the track', () => {
    const track = buildTrack(100, 0, testTarget, [], log);
    expect(track.metadata.testTarget).toBe(testTarget);
  });

  it('uses full lane capacity minus setup duration as estimate for loads without stats', () => {
    const load: ScoutCITestLoad = {
      config: createMockConfig({ path: 'no-stats/config.ts' }),
      enabled: true,
      stats: undefined,
    };

    const track = buildTrack(100, 20, testTarget, [load], log);
    expect(track.lanes[0].loads[0].stats.runtime.estimate).toBe(80);
  });

  it('sets agentQueue to n2-8-spot when lane has a parallel config', () => {
    const load = createTestLoad('parallel/config.ts', 5000, 'parallel');
    const track = buildTrack(100000, 0, testTarget, [load], log);
    expect(track.lanes[0].metadata.buildkite.agentQueue).toBe('n2-8-spot');
  });

  it('sets agentQueue to n2-4-spot when lane has only standard configs', () => {
    const load = createTestLoad('standard/config.ts', 5000, 'standard');
    const track = buildTrack(100000, 0, testTarget, [load], log);
    expect(track.lanes[0].metadata.buildkite.agentQueue).toBe('n2-4-spot');
  });

  it('distributes loads across multiple lanes when capacity is exceeded', () => {
    const loadA = createTestLoad('config-a.ts', 8000);
    const loadB = createTestLoad('config-b.ts', 8000);

    const track = buildTrack(10000, 0, testTarget, [loadA, loadB], log);
    expect(track.laneCount).toBe(2);
  });

  it('sorts loads by runtime estimate in descending order before assignment', () => {
    const loadSmall = createTestLoad('small.ts', 1000);
    const loadLarge = createTestLoad('large.ts', 9000);
    const loadMedium = createTestLoad('medium.ts', 5000);

    const track = buildTrack(10000, 0, testTarget, [loadSmall, loadLarge, loadMedium], log);

    // largest load should be assigned first, all fitting in one lane (1000+5000+9000=15000 > 10000)
    // so we expect 2 lanes: lane 1 gets [large, small], lane 2 gets [medium]
    expect(track.laneCount).toBe(2);
    expect(track.lanes[0].loads[0].id).toBe('large.ts');
  });
});
