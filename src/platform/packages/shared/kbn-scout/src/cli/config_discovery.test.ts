/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FlagsReader } from '@kbn/dev-cli-runner';
import type { ScoutTestableModuleWithConfigs } from '@kbn/scout-reporting/src/registry';
import type { ToolingLog } from '@kbn/tooling-log';
import { findPackageForPath } from '@kbn/repo-packages';
import fs from 'fs';
import {
  filterModulesByScoutCiConfig,
  getScoutCiExcludedConfigs,
} from '../tests_discovery/search_configs';
import { getServerRunFlagsFromTags } from '../tests_discovery/tag_utils';
import type { ModuleDiscoveryInfo } from './config_discovery';
import { runDiscoverPlaywrightConfigs } from './config_discovery';

// Module-level object to store mock modules that the jest.mock can access
export const mockTestableModules: { modules: ScoutTestableModuleWithConfigs[] } = {
  modules: [],
};

// Mock fs before any imports that might use it
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    readFileSync: jest.fn((path: string, encoding?: string) => {
      // Return valid JSON for package.json files (used by @kbn/repo-info during initialization)
      if (typeof path === 'string' && path.endsWith('package.json')) {
        return JSON.stringify({ name: 'kibana', version: '1.0.0' });
      }
      // For other files, return empty string by default
      return '';
    }),
    existsSync: jest.fn(() => false),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

jest.mock('@kbn/repo-packages', () => ({
  findPackageForPath: jest.fn(),
}));

jest.mock('@kbn/repo-info', () => ({
  REPO_ROOT: '/mock/repo/root',
}));

jest.mock('@kbn/scout-info', () => ({
  ...jest.requireActual('@kbn/scout-info'),
  SCOUT_PLAYWRIGHT_CONFIGS_PATH: '/path/to/scout_playwright_configs.json',
}));

jest.mock('../tests_discovery/search_configs', () => ({
  filterModulesByScoutCiConfig: jest.fn(),
  getScoutCiExcludedConfigs: jest.fn(),
}));

jest.mock('@kbn/scout-reporting/src/registry', () => {
  // Access the module-level store
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const testModule = require('./config_discovery.test');
  return {
    ...jest.requireActual('@kbn/scout-reporting/src/registry'),
    testableModules: {
      get allIncludingConfigs() {
        return testModule.mockTestableModules.modules;
      },
    },
  };
});

jest.mock('../servers/configs', () => ({
  getScoutPlaywrightConfigs: jest.fn(),
}));

describe('runDiscoverPlaywrightConfigs', () => {
  let flagsReader: jest.Mocked<FlagsReader>;
  let log: jest.Mocked<ToolingLog>;

  const mockFilteredModules: ModuleDiscoveryInfo[] = [
    {
      name: 'pluginA',
      group: 'groupA',
      type: 'plugin',
      configs: [
        {
          path: 'x-pack/platform/plugins/private/pluginA/test/scout/ui/playwright.config.ts',
          hasTests: true,
          tags: [
            '@local-stateful-classic',
            '@cloud-stateful-classic',
            '@cloud-serverless-observability_complete',
          ],
          serverRunFlags: [
            '--arch stateful --domain classic',
            '--arch serverless --domain observability_complete',
          ],
          usesParallelWorkers: false,
        },
      ],
    },
  ];

  beforeAll(() => {
    flagsReader = {
      enum: jest.fn(),
      arrayOfStrings: jest.fn(),
      boolean: jest.fn(),
      string: jest.fn(),
    } as any;

    log = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      warning: jest.fn(),
    } as any;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-setup fs mocks after clearing
    (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (typeof path === 'string' && path.endsWith('package.json')) {
        return JSON.stringify({ name: 'kibana', version: '1.0.0' });
      }
      // For yaml files (used by search_configs)
      if (typeof path === 'string' && path.endsWith('.yml')) {
        return 'mock yaml content';
      }
      return '';
    });
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(jest.fn());
    (fs.writeFileSync as jest.Mock).mockImplementation(jest.fn());

    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);
    flagsReader.arrayOfStrings.mockReturnValue([]);
    flagsReader.string.mockImplementation(() => '');

    (findPackageForPath as jest.Mock).mockReset();

    (filterModulesByScoutCiConfig as jest.Mock).mockReturnValue(mockFilteredModules);
    (getScoutCiExcludedConfigs as jest.Mock).mockReturnValue([]);

    // Default mock modules
    mockTestableModules.modules = [
      {
        name: 'pluginA',
        group: 'groupA',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginA',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginA/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginA/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'abc123',
              tests: [
                {
                  id: 'test1',
                  title: 'Test 1',
                  expectedStatus: 'passed',
                  location: { file: 'test1.spec.ts', line: 1, column: 1 },
                  tags: [
                    '@local-stateful-classic',
                    '@cloud-stateful-classic',
                    '@cloud-serverless-observability_complete',
                  ],
                },
                {
                  id: 'test2',
                  title: 'Test 2',
                  expectedStatus: 'passed',
                  location: { file: 'test2.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-security_complete'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
          {
            path: 'x-pack/platform/plugins/private/pluginA/test/scout/ui/parallel.playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginA/test/scout/ui/parallel.playwright.config.ts',
              exists: true,
              sha1: 'def456',
              tests: [
                {
                  id: 'test3',
                  title: 'Test 3',
                  expectedStatus: 'passed',
                  location: { file: 'test3.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-search'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
      {
        name: 'pluginB',
        group: 'groupB',
        type: 'plugin' as const,
        visibility: 'shared' as const,
        root: 'x-pack/platform/plugins/shared/pluginB',
        configs: [
          {
            path: 'x-pack/platform/plugins/shared/pluginB/test/scout/api/playwright.config.ts',
            category: 'api',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/shared/pluginB/test/scout/api/playwright.config.ts',
              exists: true,
              sha1: 'ghi789',
              tests: [
                {
                  id: 'test4',
                  title: 'Test 4',
                  expectedStatus: 'passed',
                  location: { file: 'test4.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-workplaceai'], // Only serverless, not in tags.deploymentAgnostic
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
      {
        name: 'packageA',
        group: 'groupC',
        type: 'package' as const,
        visibility: 'shared' as const,
        root: 'src/platform/packages/shared/packageA',
        configs: [
          {
            path: 'src/platform/packages/shared/packageA/test/scout/api/playwright.config.ts',
            category: 'api',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'src/platform/packages/shared/packageA/test/scout/api/playwright.config.ts',
              exists: true,
              sha1: 'jkl012',
              tests: [
                {
                  id: 'test5',
                  title: 'Test 5',
                  expectedStatus: 'passed',
                  location: { file: 'test5.spec.ts', line: 1, column: 1 },
                  tags: [
                    '@local-stateful-classic',
                    '@cloud-stateful-classic',
                    '@cloud-serverless-observability_complete',
                  ],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];
  });

  it('validates configs when "validate" is true', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockImplementation((flag) => {
      if (flag === 'save') return false;
      if (flag === 'validate') return true;
      return false;
    });

    runDiscoverPlaywrightConfigs(flagsReader, log);

    expect(filterModulesByScoutCiConfig).toHaveBeenCalled();
    const callArgs = (filterModulesByScoutCiConfig as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toBe(log);
    expect(Array.isArray(callArgs[1])).toBe(true);
  });

  it('filters configs based on target tags for "all" target (tags.deploymentAgnostic)', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginA has local/cloud-stateful-classic, serverless-observability_complete, serverless-security_complete, serverless-search which are in tags.deploymentAgnostic
    // pluginB has serverless-workplaceai which is NOT in tags.deploymentAgnostic, it should be excluded
    // packageA has local/cloud-stateful-classic and serverless-observability_complete which are in tags.deploymentAgnostic

    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find((call) =>
      call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    expect(foundMessage![0]).toContain('1 plugin(s)'); // pluginA only (pluginB filtered out)
    expect(foundMessage![0]).toContain('1 package(s)'); // packageA
  });

  it('filters configs based on target tags for "mki" target (@cloud-serverless-*)', () => {
    flagsReader.enum.mockReturnValue('mki');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginA has @cloud-serverless-observability_complete, @cloud-serverless-security_complete, @cloud-serverless-search
    // pluginB has @cloud-serverless-workplaceai
    // packageA has @cloud-serverless-observability_complete

    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find((call) =>
      call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    // All modules should be included for mki target
    expect(foundMessage![0]).toContain('2 plugin(s)');
    expect(foundMessage![0]).toContain('1 package(s)');
  });

  it('filters configs based on target tags for "ech" target (@cloud-stateful-*)', () => {
    flagsReader.enum.mockReturnValue('ech');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginA has @cloud-stateful-classic which matches ech target
    // pluginB has no cloud-stateful tags, it should be excluded
    // packageA has @cloud-stateful-classic which matches ech target

    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find((call) =>
      call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    expect(foundMessage![0]).toContain('1 plugin(s)'); // pluginA only
    expect(foundMessage![0]).toContain('1 package(s)'); // packageA
  });

  it('filters configs based on target tags for "local" target (@local-*)', () => {
    flagsReader.enum.mockReturnValue('local');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginA config1 has @local-stateful-classic which matches @local-*
    // pluginA parallel has @cloud-serverless-search which does NOT match @local-*
    // pluginB has @cloud-serverless-workplaceai which does NOT match @local-*
    // packageA has @local-stateful-classic which matches @local-*

    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find((call) =>
      call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    expect(foundMessage![0]).toContain('1 plugin(s)'); // pluginA only (config1 matches, parallel does not)
    expect(foundMessage![0]).toContain('1 package(s)'); // packageA

    // Verify only @local-* tags are kept
    const configLogCall = infoCalls.find((call) =>
      call[0].includes('/pluginA/test/scout/ui/playwright.config.ts')
    );
    expect(configLogCall).toBeDefined();
    expect(configLogCall![0]).toContain('@local-stateful-classic');
    expect(configLogCall![0]).not.toContain('@cloud-stateful-classic');
    expect(configLogCall![0]).not.toContain('@cloud-serverless-observability_complete');
  });

  it('filters configs based on target tags for "local-stateful-only" target (@local-stateful-*)', () => {
    flagsReader.enum.mockReturnValue('local-stateful-only');
    flagsReader.boolean.mockReturnValue(false);

    // Add a module with @local-serverless-search to verify it gets excluded
    mockTestableModules.modules.push({
      name: 'pluginLocalServerless',
      group: 'groupD',
      type: 'plugin' as const,
      visibility: 'private' as const,
      root: 'x-pack/platform/plugins/private/pluginLocalServerless',
      configs: [
        {
          path: 'x-pack/platform/plugins/private/pluginLocalServerless/test/scout/ui/playwright.config.ts',
          category: 'ui',
          type: 'playwright',
          namespace: undefined,
          manifest: {
            path: 'x-pack/platform/plugins/private/pluginLocalServerless/test/scout/ui/playwright.config.ts',
            exists: true,
            sha1: 'local789',
            tests: [
              {
                id: 'localServerlessTest',
                title: 'Local Serverless Test',
                expectedStatus: 'passed',
                location: { file: 'test.spec.ts', line: 1, column: 1 },
                tags: ['@local-serverless-search'],
              },
            ],
          },
          server: {
            configSet: 'default',
          },
        },
      ],
    });

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginA config1 has @local-stateful-classic which matches @local-stateful-*
    // pluginA parallel has @cloud-serverless-search which does NOT match
    // pluginB has @cloud-serverless-workplaceai which does NOT match
    // pluginLocalServerless has @local-serverless-search which does NOT match @local-stateful-*
    // packageA has @local-stateful-classic which matches @local-stateful-*

    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find((call) =>
      call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    expect(foundMessage![0]).toContain('1 plugin(s)'); // pluginA only
    expect(foundMessage![0]).toContain('1 package(s)'); // packageA

    // Verify only @local-stateful-* tags are kept
    const configLogCall = infoCalls.find((call) =>
      call[0].includes('/pluginA/test/scout/ui/playwright.config.ts')
    );
    expect(configLogCall).toBeDefined();
    expect(configLogCall![0]).toContain('@local-stateful-classic');
    expect(configLogCall![0]).not.toContain('@cloud-stateful-classic');
    expect(configLogCall![0]).not.toContain('@cloud-serverless');
    expect(configLogCall![0]).not.toContain('@local-serverless');

    // pluginLocalServerless should be excluded
    const localServerlessLog = infoCalls.find((call) => call[0].includes('pluginLocalServerless'));
    expect(localServerlessLog).toBeUndefined();
  });

  it('includes custom-server configs alongside defaults when "include-custom-servers" is true', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockImplementation((flag) => flag === 'include-custom-servers');

    mockTestableModules.modules = [
      {
        name: 'pluginCustom',
        group: 'groupCustom',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginCustom',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginCustom/test/scout_custom/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginCustom/test/scout_custom/ui/playwright.config.ts',
              exists: true,
              sha1: 'custom123',
              tests: [
                {
                  id: 'customTest1',
                  title: 'Custom Test 1',
                  expectedStatus: 'passed',
                  location: { file: 'custom.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic'],
                },
              ],
            },
            server: {
              configSet: 'custom',
            },
          },
          {
            path: 'x-pack/platform/plugins/private/pluginCustom/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginCustom/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'normal456',
              tests: [
                {
                  id: 'normalTest1',
                  title: 'Normal Test 1',
                  expectedStatus: 'passed',
                  location: { file: 'normal.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    const infoCalls = log.info.mock.calls;
    const configLogs = infoCalls.filter((call) => call[0].startsWith('- '));
    expect(configLogs.length).toBeGreaterThan(0);
    expect(configLogs.some((call) => call[0].includes('/test/scout_custom/'))).toBe(true);
    expect(
      configLogs.some((call) =>
        call[0].includes('/pluginCustom/test/scout/ui/playwright.config.ts')
      )
    ).toBe(true);
  });

  it('excludes configs listed in scout_ci_config.yml when running in CI', () => {
    const originalCi = process.env.CI;
    process.env.CI = 'true';

    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockImplementation((flag) => flag === 'include-custom-servers');

    const excludedConfigPath =
      'x-pack/solutions/security/plugins/cloud_security_posture/test/scout_cspm_agentless/ui/parallel.playwright.config.ts';

    (getScoutCiExcludedConfigs as jest.Mock).mockReturnValue([excludedConfigPath]);

    mockTestableModules.modules = [
      {
        name: 'pluginCspm',
        group: 'security',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/solutions/security/plugins/cloud_security_posture',
        configs: [
          {
            path: excludedConfigPath,
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/solutions/security/plugins/cloud_security_posture/test/scout_cspm_agentless/.meta/ui/parallel.json',
              exists: true,
              sha1: 'exclude123',
              tests: [
                {
                  id: 'excludedTest',
                  title: 'Excluded Test',
                  expectedStatus: 'passed',
                  location: { file: 'excluded.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic'],
                },
              ],
            },
            server: {
              configSet: 'cspm_agentless',
            },
          },
          {
            path: 'x-pack/solutions/security/plugins/cloud_security_posture/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/solutions/security/plugins/cloud_security_posture/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'include456',
              tests: [
                {
                  id: 'includedTest',
                  title: 'Included Test',
                  expectedStatus: 'passed',
                  location: { file: 'included.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    const infoCalls = log.info.mock.calls;
    const configLogs = infoCalls.filter((call) => call[0].startsWith('- '));
    expect(configLogs.some((call) => call[0].includes(excludedConfigPath))).toBe(false);
    expect(configLogs.some((call) => call[0].includes('/test/scout/ui/playwright.config.ts'))).toBe(
      true
    );

    process.env.CI = originalCi;
  });

  it('filters config tags to only include cross tags', () => {
    flagsReader.enum.mockReturnValue('ech'); // @cloud-stateful-* tags only
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // Find the log call that shows config details
    const infoCalls = log.info.mock.calls;
    const configLogCall = infoCalls.find((call) =>
      call[0].includes('/pluginA/test/scout/ui/playwright.config.ts')
    );

    expect(configLogCall).toBeDefined();
    // pluginA config1 has tags ['@local-stateful-classic', '@cloud-stateful-classic', '@cloud-serverless-observability_complete', '@cloud-serverless-security_complete'],
    // but after filtering for ech (@cloud-stateful-*), only [@cloud-stateful-classic] should remain
    expect(configLogCall![0]).toContain('tags: [@cloud-stateful-classic]');
    expect(configLogCall![0]).not.toContain('@local-stateful-classic');
    expect(configLogCall![0]).not.toContain('@cloud-serverless-observability_complete');
    expect(configLogCall![0]).not.toContain('@cloud-serverless-security_complete');
  });

  it('logs found configs with tags when they exist and "save" flag is false', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    const infoCalls = log.info.mock.calls;
    expect(infoCalls.length).toBeGreaterThan(0);
    expect(infoCalls.some((call) => call[0].includes('Found Playwright config files'))).toBe(true);

    // Check that config logs include tags
    const configLogs = infoCalls.filter((call) => call[0].startsWith('- '));
    expect(configLogs.length).toBeGreaterThan(0);
    configLogs.forEach((call) => {
      expect(call[0]).toContain('tags: [');
    });
  });

  it('logs "No Playwright config files found" when no configs match target tags', () => {
    flagsReader.enum.mockReturnValue('ech'); // @cloud-stateful-* tags only
    flagsReader.boolean.mockReturnValue(false);

    // Set up modules with no matching tags
    mockTestableModules.modules = [
      {
        name: 'pluginNoMatch',
        group: 'groupX',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginNoMatch',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginNoMatch/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginNoMatch/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'mno345',
              tests: [
                {
                  id: 'testNoMatch',
                  title: 'Test No Match',
                  expectedStatus: 'passed',
                  location: { file: 'test.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-workplaceai'], // Not in ESS_ONLY
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    expect(log.info).toHaveBeenCalledWith('No Playwright config files found');
  });

  it('validates and saves filtered modules when "--save" is set', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockImplementation((flag) => {
      if (flag === 'save') return true;
      if (flag === 'validate') return false;
      return false;
    });

    runDiscoverPlaywrightConfigs(flagsReader, log);

    expect(filterModulesByScoutCiConfig).toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();

    const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
    expect(writeCall[0]).toBe('/path/to/scout_playwright_configs.json');
    const savedData = JSON.parse(writeCall[1]);
    expect(Array.isArray(savedData)).toBe(true);

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('Scout configs saved for CI (full suite)')
    );
  });

  it('filters out modules with no matching configs after tag filtering', () => {
    flagsReader.enum.mockReturnValue('ech'); // @cloud-stateful-* tags only
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // pluginB has @cloud-serverless-workplaceai which doesn't match @cloud-stateful-*, it should be filtered out
    const infoCalls = log.info.mock.calls;
    const moduleLogs = infoCalls.filter(
      (call) => call[0].includes('] plugin:') || call[0].includes('] package:')
    );

    // Should not contain pluginB
    const pluginBLog = moduleLogs.find((call) => call[0].includes('pluginB'));
    expect(pluginBLog).toBeUndefined();
  });

  it('handles configs with no passed tests correctly', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    // Set up a module with a config that has no passed tests
    mockTestableModules.modules = [
      {
        name: 'pluginNoTests',
        group: 'groupY',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginNoTests',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginNoTests/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginNoTests/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'pqr678',
              tests: [
                {
                  id: 'testFailed',
                  title: 'Test Failed',
                  expectedStatus: 'failed',
                  location: { file: 'test.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // Configs with no passed tests should not be included (no matching tags from passed tests)
    // Since there are no passed tests, collectUniqueTags returns empty tags array,
    // which means no configs match targetTags, resulting in filteredModulesWithTests being empty
    const infoCalls = log.info.mock.calls;
    const foundMessage = infoCalls.find(
      (call) =>
        call[0].includes('No Playwright config files found') ||
        call[0].includes('Found Playwright config files')
    );
    expect(foundMessage).toBeDefined();
    // When no modules have passed tests, the message should indicate no configs were found
    expect(foundMessage![0]).toBe('No Playwright config files found');
  });

  it('only collects tags from passed spec files', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    // Set up a module with mixed test statuses and file types
    mockTestableModules.modules = [
      {
        name: 'pluginMixedTests',
        group: 'groupZ',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginMixedTests',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginMixedTests/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginMixedTests/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'stu901',
              tests: [
                {
                  id: 'test1',
                  title: 'Test 1',
                  expectedStatus: 'passed',
                  location: { file: 'test1.spec.ts', line: 1, column: 1 },
                  tags: ['@local-stateful-classic', '@cloud-serverless-observability_complete'], // Should be included
                },
                {
                  id: 'test2',
                  title: 'Test 2',
                  expectedStatus: 'failed',
                  location: { file: 'test2.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-security_complete'], // Should NOT be included (failed)
                },
                {
                  id: 'test3',
                  title: 'Test 3',
                  expectedStatus: 'passed',
                  location: { file: 'test3.ts', line: 1, column: 1 }, // Not a .spec.ts file
                  tags: ['@cloud-serverless-search'], // Should NOT be included (not .spec.ts)
                },
                {
                  id: 'test4',
                  title: 'Test 4',
                  expectedStatus: 'passed',
                  location: { file: 'test4.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-observability_logs_essentials'], // Should be included
                },
                {
                  id: 'test5',
                  title: 'Test 5',
                  expectedStatus: 'passed',
                  location: { file: 'test5.spec.ts', line: 1, column: 1 },
                  tags: [], // No tags - should not cause errors
                },
                {
                  id: 'test6',
                  title: 'Test 6',
                  expectedStatus: 'passed',
                  location: { file: '', line: 0, column: 0 }, // No file location - should not be included
                  tags: ['@cloud-serverless-observability_complete'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // Find the log call that shows config details
    const infoCalls = log.info.mock.calls;
    const configLogCall = infoCalls.find((call) =>
      call[0].includes('/pluginMixedTests/test/scout/ui/playwright.config.ts')
    );

    expect(configLogCall).toBeDefined();
    // For target 'all', only tags in deploymentAgnostic are shown (filtered by filterModulesByTargetTags)
    expect(configLogCall![0]).toContain('@local-stateful-classic');
    expect(configLogCall![0]).toContain('@cloud-serverless-observability_complete');
    // Should NOT contain tags from failed tests or non-spec files
    expect(configLogCall![0]).not.toContain('@cloud-serverless-security_complete');
    expect(configLogCall![0]).not.toContain('@cloud-serverless-search');
  });

  it('correctly identifies parallel worker configs', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // The parallel config should be identified
    const infoCalls = log.info.mock.calls;
    const parallelConfigLog = infoCalls.find((call) =>
      call[0].includes('parallel.playwright.config.ts')
    );
    expect(parallelConfigLog).toBeDefined();
  });

  it('computes "serverRunFlags" correctly from tags', () => {
    flagsReader.enum.mockReturnValue('all');
    flagsReader.boolean.mockReturnValue(false);

    // Set up a module with various tags to test serverRunFlags computation
    mockTestableModules.modules = [
      {
        name: 'pluginTestModes',
        group: 'groupTest',
        type: 'plugin' as const,
        visibility: 'private' as const,
        root: 'x-pack/platform/plugins/private/pluginTestModes',
        configs: [
          {
            path: 'x-pack/platform/plugins/private/pluginTestModes/test/scout/ui/playwright.config.ts',
            category: 'ui',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginTestModes/test/scout/ui/playwright.config.ts',
              exists: true,
              sha1: 'vwx234',
              tests: [
                {
                  id: 'testModes1',
                  title: 'Test Modes 1',
                  expectedStatus: 'passed',
                  location: { file: 'test1.spec.ts', line: 1, column: 1 },
                  tags: [
                    '@local-stateful-classic',
                    '@cloud-serverless-search',
                    '@cloud-serverless-security_complete',
                  ],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
          {
            path: 'x-pack/platform/plugins/private/pluginTestModes/test/scout/api/playwright.config.ts',
            category: 'api',
            type: 'playwright',
            namespace: undefined,
            manifest: {
              path: 'x-pack/platform/plugins/private/pluginTestModes/test/scout/api/playwright.config.ts',
              exists: true,
              sha1: 'yza567',
              tests: [
                {
                  id: 'testModes2',
                  title: 'Test Modes 2',
                  expectedStatus: 'passed',
                  location: { file: 'test2.spec.ts', line: 1, column: 1 },
                  tags: ['@cloud-serverless-observability_complete'],
                },
              ],
            },
            server: {
              configSet: 'default',
            },
          },
        ],
      },
    ];

    runDiscoverPlaywrightConfigs(flagsReader, log);

    // Verify that serverRunFlags are computed and included in the output
    // The function should compute serverRunFlags from tags automatically
    const infoCalls = log.info.mock.calls;
    const config1Log = infoCalls.find((call) => call[0].includes('/ui/playwright.config.ts'));
    const config2Log = infoCalls.find((call) => call[0].includes('/api/playwright.config.ts'));

    expect(config1Log).toBeDefined();
    expect(config2Log).toBeDefined();
    // config1 should have stateful-classic, serverless-search, serverless-security_complete tags
    // config2 should have serverless-observability_complete tag
    // The actual serverRunFlags computation happens in the function, so we just verify the configs are processed
  });

  describe('"--flatten" flag', () => {
    beforeEach(() => {
      // Set up modules with different groups and serverRunFlags for flatten testing
      mockTestableModules.modules = [
        {
          name: 'pluginSearch',
          group: 'search',
          type: 'plugin' as const,
          visibility: 'private' as const,
          root: 'x-pack/platform/plugins/private/pluginSearch',
          configs: [
            {
              path: 'x-pack/platform/plugins/private/pluginSearch/test/scout/ui/playwright.config.ts',
              category: 'ui',
              type: 'playwright',
              namespace: undefined,
              manifest: {
                path: 'x-pack/platform/plugins/private/pluginSearch/test/scout/ui/playwright.config.ts',
                exists: true,
                sha1: 'bcd234',
                tests: [
                  {
                    id: 'flattenTest1',
                    title: 'Flatten Test 1',
                    expectedStatus: 'passed',
                    location: { file: 'test1.spec.ts', line: 1, column: 1 },
                    tags: ['@local-stateful-classic', '@cloud-serverless-search'],
                  },
                ],
              },
              server: {
                configSet: 'default',
              },
            },
            {
              path: 'x-pack/platform/plugins/private/pluginSearch/test/scout/api/playwright.config.ts',
              category: 'api',
              type: 'playwright',
              namespace: undefined,
              manifest: {
                path: 'x-pack/platform/plugins/private/pluginSearch/test/scout/api/playwright.config.ts',
                exists: true,
                sha1: 'cde345',
                tests: [
                  {
                    id: 'flattenTest2',
                    title: 'Flatten Test 2',
                    expectedStatus: 'passed',
                    location: { file: 'test2.spec.ts', line: 1, column: 1 },
                    tags: ['@cloud-serverless-search'],
                  },
                ],
              },
              server: {
                configSet: 'default',
              },
            },
          ],
        },
        {
          name: 'pluginPlatform',
          group: 'platform',
          type: 'plugin' as const,
          visibility: 'private' as const,
          root: 'x-pack/platform/plugins/private/pluginPlatform',
          configs: [
            {
              path: 'x-pack/platform/plugins/private/pluginPlatform/test/scout/ui/playwright.config.ts',
              category: 'ui',
              type: 'playwright',
              namespace: undefined,
              manifest: {
                path: 'x-pack/platform/plugins/private/pluginPlatform/test/scout/ui/playwright.config.ts',
                exists: true,
                sha1: 'def456',
                tests: [
                  {
                    id: 'flattenTest3',
                    title: 'Flatten Test 3',
                    expectedStatus: 'passed',
                    location: { file: 'test3.spec.ts', line: 1, column: 1 },
                    tags: ['@local-stateful-classic'],
                  },
                ],
              },
              server: {
                configSet: 'default',
              },
            },
          ],
        },
        {
          name: 'pluginOblt',
          group: 'observability',
          type: 'plugin' as const,
          visibility: 'private' as const,
          root: 'x-pack/solutions/observability/plugins/pluginOblt',
          configs: [
            {
              path: 'x-pack/solutions/observability/plugins/pluginOblt/test/scout/ui/playwright.config.ts',
              category: 'ui',
              type: 'playwright',
              namespace: undefined,
              manifest: {
                path: 'x-pack/solutions/observability/plugins/pluginOblt/test/scout/ui/playwright.config.ts',
                exists: true,
                sha1: 'efg567',
                tests: [
                  {
                    id: 'flattenTest4',
                    title: 'Flatten Test 4',
                    expectedStatus: 'passed',
                    location: { file: 'test4.spec.ts', line: 1, column: 1 },
                    tags: ['@cloud-serverless-observability_complete'],
                  },
                ],
              },
              server: {
                configSet: 'default',
              },
            },
          ],
        },
      ];
    });

    it('logs flattened structure when "--flatten" is set without "--save"', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockImplementation((flag) => {
        if (flag === 'flatten') return true;
        return false;
      });

      runDiscoverPlaywrightConfigs(flagsReader, log);

      // Should log flattened structure
      const infoCalls = log.info.mock.calls;
      const flattenedLog = infoCalls.find((call) => call[0].includes('flattened config group(s)'));
      expect(flattenedLog).toBeDefined();

      // Should log individual groups
      const groupLogs = infoCalls.filter(
        (call) => call[0].includes('serverless') || call[0].includes('stateful')
      );
      expect(groupLogs.length).toBeGreaterThan(0);
    });

    it('saves flattened format when "--flatten" and "--save" are set', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockImplementation((flag) => {
        if (flag === 'flatten') return true;
        if (flag === 'save') return true;
        return false;
      });

      (filterModulesByScoutCiConfig as jest.Mock).mockReturnValue(
        mockTestableModules.modules.map((m) => ({
          name: m.name,
          group: m.group,
          type: m.type,
          visibility: m.visibility,
          configs: m.configs.map((c) => {
            const tags = c.manifest.tests[0].tags;
            return {
              path: c.path,
              hasTests: true,
              tags,
              serverRunFlags: getServerRunFlagsFromTags(tags),
              usesParallelWorkers: false,
            };
          }),
        }))
      );

      runDiscoverPlaywrightConfigs(flagsReader, log);

      expect(filterModulesByScoutCiConfig).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toBe('/path/to/scout_playwright_configs.json');
      const savedData = JSON.parse(writeCall[1]);

      // Should be an array of flattened groups
      expect(Array.isArray(savedData)).toBe(true);
      expect(savedData.length).toBeGreaterThan(0);

      // Verify structure of flattened groups (testTarget.arch, testTarget.domain, scoutCommand with --location cloud)
      savedData.forEach((group: any) => {
        expect(group).toHaveProperty('testTarget');
        expect(group.testTarget).toHaveProperty('arch');
        expect(group.testTarget).toHaveProperty('domain');
        expect(group).toHaveProperty('group');
        expect(group).toHaveProperty('scoutCommand');
        expect(group).toHaveProperty('configs');
        expect(Array.isArray(group.configs)).toBe(true);
        expect(['serverless', 'stateful']).toContain(group.testTarget.arch);
        expect(group.scoutCommand).toMatch(
          /^node scripts\/scout run-tests --location cloud --arch (stateful|serverless) --domain \w+$/
        );
      });

      // Verify log message
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('Scout configs flattened and saved')
      );
    });

    it('groups configs correctly by mode, group, and scout command', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockImplementation((flag) => {
        if (flag === 'flatten') return true;
        if (flag === 'save') return true;
        return false;
      });

      (filterModulesByScoutCiConfig as jest.Mock).mockReturnValue(
        mockTestableModules.modules.map((m) => ({
          name: m.name,
          group: m.group,
          type: m.type,
          visibility: m.visibility,
          configs: m.configs.map((c) => {
            const tags = c.manifest.tests[0].tags;
            return {
              path: c.path,
              hasTests: true,
              tags,
              serverRunFlags: getServerRunFlagsFromTags(tags),
              usesParallelWorkers: false,
            };
          }),
        }))
      );

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      const statefulScoutCmd =
        'node scripts/scout run-tests --location cloud --arch stateful --domain classic';

      // Find stateful group for 'search'
      // For stateful (ECH), domain is based on group: 'search' => 'search'
      const statefulSearchGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'stateful' &&
          g.group === 'search' &&
          g.scoutCommand === statefulScoutCmd
      );
      expect(statefulSearchGroup).toBeDefined();
      expect(statefulSearchGroup.testTarget.domain).toBe('search');
      expect(statefulSearchGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginSearch/test/scout/ui/playwright.config.ts'
      );

      // Find stateful group for 'platform'
      // For stateful (ECH), domain is based on group: 'platform' => 'classic'
      const statefulPlatformGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'stateful' &&
          g.group === 'platform' &&
          g.scoutCommand === statefulScoutCmd
      );
      expect(statefulPlatformGroup).toBeDefined();
      expect(statefulPlatformGroup.testTarget.domain).toBe('classic');
      expect(statefulPlatformGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginPlatform/test/scout/ui/playwright.config.ts'
      );

      // Find serverless group for 'search'
      const serverlessSearchScoutCmd =
        'node scripts/scout run-tests --location cloud --arch serverless --domain search';
      const serverlessSearchGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'serverless' &&
          g.group === 'search' &&
          g.scoutCommand === serverlessSearchScoutCmd
      );
      expect(serverlessSearchGroup).toBeDefined();
      expect(serverlessSearchGroup.testTarget.domain).toBe('search');
      expect(serverlessSearchGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginSearch/test/scout/ui/playwright.config.ts'
      );
      expect(serverlessSearchGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginSearch/test/scout/api/playwright.config.ts'
      );

      // Find serverless group for 'observability'
      const serverlessObltScoutCmd =
        'node scripts/scout run-tests --location cloud --arch serverless --domain observability_complete';
      const serverlessObltGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'serverless' &&
          g.group === 'observability' &&
          g.scoutCommand === serverlessObltScoutCmd
      );
      expect(serverlessObltGroup).toBeDefined();
      expect(serverlessObltGroup.testTarget.domain).toBe('observability_complete');
      expect(serverlessObltGroup.configs).toContain(
        'x-pack/solutions/observability/plugins/pluginOblt/test/scout/ui/playwright.config.ts'
      );
    });

    it('handles configs with multiple "serverRunFlags" correctly', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockImplementation((flag) => {
        if (flag === 'flatten') return true;
        if (flag === 'save') return true;
        return false;
      });

      // Set up a module with a config that has multiple serverRunFlags
      mockTestableModules.modules = [
        {
          name: 'pluginMultiMode',
          group: 'test',
          type: 'plugin' as const,
          visibility: 'private' as const,
          root: 'x-pack/platform/plugins/private/pluginMultiMode',
          configs: [
            {
              path: 'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts',
              category: 'ui',
              type: 'playwright',
              namespace: undefined,
              manifest: {
                path: 'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts',
                exists: true,
                sha1: 'fgh678',
                tests: [
                  {
                    id: 'multiModeTest',
                    title: 'Multi Mode Test',
                    expectedStatus: 'passed',
                    location: { file: 'test.spec.ts', line: 1, column: 1 },
                    tags: [
                      '@local-stateful-classic',
                      '@cloud-serverless-search',
                      '@cloud-serverless-observability_complete',
                    ],
                  },
                ],
              },
              server: {
                configSet: 'default',
              },
            },
          ],
        },
      ];

      (filterModulesByScoutCiConfig as jest.Mock).mockReturnValue([
        {
          name: 'pluginMultiMode',
          group: 'platform',
          type: 'plugin',
          visibility: 'private',
          configs: [
            {
              path: 'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts',
              hasTests: true,
              tags: [
                '@local-stateful-classic',
                '@cloud-serverless-search',
                '@cloud-serverless-observability_complete',
              ],
              serverRunFlags: [
                '--arch stateful --domain classic',
                '--arch serverless --domain search',
                '--arch serverless --domain observability_complete',
              ],
              usesParallelWorkers: false,
            },
          ],
        },
      ]);

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      const statefulScoutCmd =
        'node scripts/scout run-tests --location cloud --arch stateful --domain classic';
      const serverlessSearchScoutCmd =
        'node scripts/scout run-tests --location cloud --arch serverless --domain search';
      const serverlessObltScoutCmd =
        'node scripts/scout run-tests --location cloud --arch serverless --domain observability_complete';

      // The same config should appear in multiple groups
      const statefulGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'stateful' &&
          g.group === 'platform' &&
          g.scoutCommand === statefulScoutCmd
      );
      expect(statefulGroup).toBeDefined();
      expect(statefulGroup.testTarget.domain).toBe('classic');
      expect(statefulGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts'
      );

      const serverlessEsGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'serverless' &&
          g.group === 'platform' &&
          g.scoutCommand === serverlessSearchScoutCmd
      );
      expect(serverlessEsGroup).toBeDefined();
      expect(serverlessEsGroup.testTarget.domain).toBe('search');
      expect(serverlessEsGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts'
      );

      const serverlessObltGroup = savedData.find(
        (g: any) =>
          g.testTarget?.arch === 'serverless' &&
          g.group === 'platform' &&
          g.scoutCommand === serverlessObltScoutCmd
      );
      expect(serverlessObltGroup).toBeDefined();
      expect(serverlessObltGroup.testTarget.domain).toBe('observability_complete');
      expect(serverlessObltGroup.configs).toContain(
        'x-pack/platform/plugins/private/pluginMultiMode/test/scout/ui/playwright.config.ts'
      );
    });
  });

  describe('"--testing-scope" flag', () => {
    const TESTING_SCOPE_PATH = '/mock/testing_scope.json';

    const setupTestingScope = (scope: Record<string, unknown>) => {
      (fs.readFileSync as jest.Mock).mockImplementation((readPath: string) => {
        if (readPath === TESTING_SCOPE_PATH) {
          return JSON.stringify(scope);
        }
        if (typeof readPath === 'string' && readPath.endsWith('package.json')) {
          return JSON.stringify({ name: 'kibana', version: '1.0.0' });
        }
        if (typeof readPath === 'string' && readPath.endsWith('.yml')) {
          return 'mock yaml content';
        }
        return '';
      });
    };

    beforeEach(() => {
      (findPackageForPath as jest.Mock).mockImplementation((_root: string, absPath: string) => {
        if (absPath.includes('/pluginA/')) return { id: '@kbn/pluginA' };
        if (absPath.includes('/pluginB/')) return { id: '@kbn/pluginB' };
        if (absPath.includes('/packageA/')) return { id: '@kbn/packageA' };
        return undefined;
      });
    });

    it('routes kind=full/critical-files to a full suite run (warning preserved upstream, no "limited to" message here)', () => {
      flagsReader.enum.mockReturnValue('mki');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation((name: string) =>
        name === 'testing-scope' ? TESTING_SCOPE_PATH : ''
      );
      setupTestingScope({
        kind: 'full',
        reason: 'critical-files',
        affectedModules: ['@kbn/scout'],
      });

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const infoCalls = log.info.mock.calls;
      // No filtering applied: every module passes through to the target-tag step.
      expect(infoCalls.some((call) => String(call[0]).includes('limited to'))).toBe(false);
    });

    it('routes kind=tests-only to the configs fast path using affectedConfigs', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation((name: string) =>
        name === 'testing-scope' ? TESTING_SCOPE_PATH : ''
      );
      setupTestingScope({
        kind: 'tests-only',
        affectedModules: ['@kbn/pluginA'],
        affectedConfigs: [
          'x-pack/platform/plugins/private/pluginA/test/scout/ui/playwright.config.ts',
        ],
      });

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const infoCalls = log.info.mock.calls;
      expect(
        infoCalls.some((call) => String(call[0]).includes('limited to affected configs'))
      ).toBe(true);
    });

    it('routes kind=dependency-tree to the affected-modules filter', () => {
      flagsReader.enum.mockReturnValue('mki');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation((name: string) =>
        name === 'testing-scope' ? TESTING_SCOPE_PATH : ''
      );
      setupTestingScope({
        kind: 'dependency-tree',
        affectedModules: ['@kbn/pluginA'],
      });

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const infoCalls = log.info.mock.calls;
      expect(
        infoCalls.some((call) => String(call[0]).includes('limited to affected modules'))
      ).toBe(true);
    });

    it('marks isAffected on every module from scope.affectedModules even when kind=full', () => {
      flagsReader.enum.mockReturnValue('mki');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation((name: string) =>
        name === 'testing-scope' ? TESTING_SCOPE_PATH : ''
      );
      setupTestingScope({
        kind: 'full',
        reason: 'selective-disabled',
        affectedModules: ['@kbn/pluginA'],
      });

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const infoCalls = log.info.mock.calls;
      // Full-suite run: pluginA, pluginB, and packageA all included.
      const foundMessage = infoCalls.find((call) =>
        String(call[0]).includes('Found Playwright config files')
      );
      expect(foundMessage).toBeDefined();
      expect(foundMessage![0]).toContain('2 plugin(s)');
      expect(foundMessage![0]).toContain('1 package(s)');
      // Marking ran: the "Affected modules: ..." line appears.
      expect(infoCalls.some((call) => String(call[0]).includes('Affected modules:'))).toBe(true);
    });

    it('runs the full suite without marking when --testing-scope is omitted', () => {
      flagsReader.enum.mockReturnValue('mki');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation(() => '');

      runDiscoverPlaywrightConfigs(flagsReader, log);

      const infoCalls = log.info.mock.calls;
      // Marking did NOT run.
      expect(infoCalls.some((call) => String(call[0]).includes('Affected modules:'))).toBe(false);
      // Full-suite log is emitted.
      expect(infoCalls.some((call) => String(call[0]).includes('no testing-scope provided'))).toBe(
        true
      );
    });

    it('throws when the testing-scope file is missing required fields', () => {
      flagsReader.enum.mockReturnValue('all');
      flagsReader.boolean.mockReturnValue(false);
      flagsReader.string.mockImplementation((name: string) =>
        name === 'testing-scope' ? TESTING_SCOPE_PATH : ''
      );
      setupTestingScope({ kind: 'full' }); // missing affectedModules

      expect(() => runDiscoverPlaywrightConfigs(flagsReader, log)).toThrow(/testing-scope file/i);
    });
  });
});
