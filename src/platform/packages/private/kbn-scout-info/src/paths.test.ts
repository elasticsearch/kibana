/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { REPO_ROOT } from '@kbn/repo-info';
import {
  TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB,
  SCOUT_CONFIG_PATH_GLOB,
  SCOUT_CONFIG_PATH_REGEX,
  SCOUT_CONFIG_MANIFEST_PATH_GLOB,
  SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX,
  SCOUT_UNIFIED_CONFIG_PATH_REGEX,
  TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX,
  SCOUT_TESTS_ONLY_IGNORE_PATTERNS,
  SCOUT_TESTS_ONLY_SCOPE_GLOBS,
} from './paths';

describe('Scout path globs', () => {
  describe('TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB', () => {
    const shouldMatch = [
      'src/platform/plugins/shared/my_plugin/test/scout',
      'src/platform/plugins/private/my_plugin/test/scout',
      'src/platform/packages/shared/my_package/test/scout',
      'src/platform/packages/private/my_package/test/scout',
      'src/core/packages/my_package/test/scout',
      'src/core/test/scout',
      'src/core/test/scout_custom',
      'x-pack/platform/plugins/shared/my_plugin/test/scout',
      'x-pack/solutions/security/plugins/my_plugin/test/scout',
      'x-pack/solutions/observability/plugins/my_plugin/test/scout',
      'src/platform/plugins/shared/my_plugin/test/scout_custom',
      'x-pack/solutions/security/plugins/my_plugin/test/scout_uiam_local',
      'examples/hello_world/test/scout',
      'examples/hello_world/test/scout_examples',
      'x-pack/examples/hello_world/test/scout',
      'x-pack/examples/hello_world/test/scout_examples',
    ];

    const shouldNotMatch = [
      'random/path/test/scout',
      'src/platform/plugins/shared/my_plugin/src/scout',
      'not_examples/hello_world/test/scout',
    ];

    it.each(shouldMatch)('matches: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB)).toBe(true);
    });

    it.each(shouldNotMatch)('does not match: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB)).toBe(false);
    });
  });

  describe('SCOUT_CONFIG_PATH_GLOB', () => {
    const shouldMatch = [
      'src/platform/plugins/shared/my_plugin/test/scout/api/playwright.config.ts',
      'src/platform/plugins/shared/my_plugin/test/scout/ui/playwright.config.ts',
      'src/platform/plugins/shared/my_plugin/test/scout/api/parallel.playwright.config.ts',
      'x-pack/solutions/security/plugins/my_plugin/test/scout/api/playwright.config.ts',
      'x-pack/solutions/security/plugins/my_plugin/test/scout_custom/ui/playwright.config.ts',
      'src/core/packages/my_package/test/scout/api/playwright.config.ts',
      'src/core/test/scout/api/playwright.config.ts',
      'src/core/test/scout_custom/api/playwright.config.ts',
      'examples/hello_world/test/scout_examples/api/playwright.config.ts',
      'examples/hello_world/test/scout_examples/ui/playwright.config.ts',
      'x-pack/examples/hello_world/test/scout_examples/api/playwright.config.ts',
      'x-pack/examples/hello_world/test/scout/ui/parallel.playwright.config.ts',
    ];

    const shouldNotMatch = [
      'examples/hello_world/test/scout_examples/api/jest.config.ts',
      'random/path/test/scout/api/playwright.config.ts',
      'src/platform/plugins/shared/my_plugin/test/scout/api/not_playwright.config.ts',
    ];

    it.each(shouldMatch)('matches: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, SCOUT_CONFIG_PATH_GLOB)).toBe(true);
    });

    it.each(shouldNotMatch)('does not match: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, SCOUT_CONFIG_PATH_GLOB)).toBe(false);
    });
  });

  describe('SCOUT_CONFIG_MANIFEST_PATH_GLOB', () => {
    const shouldMatch = [
      'src/platform/plugins/shared/my_plugin/test/scout/.meta/api/standard.json',
      'src/platform/plugins/shared/my_plugin/test/scout/.meta/ui/parallel.json',
      'x-pack/solutions/security/plugins/my_plugin/test/scout/.meta/api/standard.json',
      'examples/hello_world/test/scout_examples/.meta/api/standard.json',
      'x-pack/examples/hello_world/test/scout_examples/.meta/ui/standard.json',
    ];

    const shouldNotMatch = [
      'random/path/.meta/api/standard.json',
      'examples/hello_world/test/scout_examples/.meta/other/standard.json',
    ];

    it.each(shouldMatch)('matches: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, SCOUT_CONFIG_MANIFEST_PATH_GLOB)).toBe(true);
    });

    it.each(shouldNotMatch)('does not match: %s', (testPath) => {
      expect(picomatch.isMatch(testPath, SCOUT_CONFIG_MANIFEST_PATH_GLOB)).toBe(false);
    });
  });
});

describe('Scout path regexes', () => {
  describe('TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX', () => {
    it('matches platform plugin paths with correct groups', () => {
      const match = 'src/platform/plugins/shared/my_plugin/test/scout'.match(
        TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBe('platform');
      expect(match![2]).toBeUndefined();
      expect(match![3]).toBe('plugins');
      expect(match![4]).toBe('shared');
      expect(match![5]).toBe('my_plugin');
      expect(match![6]).toBeUndefined();
    });

    it('matches solution plugin paths with correct groups', () => {
      const match = 'x-pack/solutions/security/plugins/my_plugin/test/scout'.match(
        TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBeUndefined();
      expect(match![2]).toBe('security');
      expect(match![3]).toBe('plugins');
    });

    it('captures custom config set names', () => {
      const match = 'src/platform/plugins/shared/my_plugin/test/scout_uiam_local'.match(
        TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![6]).toBe('uiam_local');
    });

    it('does not match examples/ paths', () => {
      expect(TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX.test('examples/hello_world/test/scout')).toBe(
        false
      );
    });
  });

  describe('SCOUT_CONFIG_PATH_REGEX', () => {
    it('matches standard playwright config', () => {
      const match =
        'src/platform/plugins/shared/my_plugin/test/scout/api/playwright.config.ts'.match(
          SCOUT_CONFIG_PATH_REGEX
        );
      expect(match).not.toBeNull();
      expect(match![7]).toBe('api');
      expect(match![8]).toBe('');
    });

    it('matches named playwright config', () => {
      const match =
        'src/platform/plugins/shared/my_plugin/test/scout/ui/parallel.playwright.config.ts'.match(
          SCOUT_CONFIG_PATH_REGEX
        );
      expect(match).not.toBeNull();
      expect(match![7]).toBe('ui');
      expect(match![8]).toBe('parallel');
    });

    it('does not match examples/ paths', () => {
      expect(
        SCOUT_CONFIG_PATH_REGEX.test(
          'examples/hello_world/test/scout_examples/api/playwright.config.ts'
        )
      ).toBe(false);
    });
  });

  describe('SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX', () => {
    it('matches examples/ plugin config with custom config set', () => {
      const match = 'examples/hello_world/test/scout_examples/api/playwright.config.ts'.match(
        SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBe('examples');
      expect(match![2]).toBe('hello_world');
      expect(match![3]).toBe('examples');
      expect(match![4]).toBe('api');
      expect(match![5]).toBe('');
    });

    it('matches x-pack/examples/ plugin config', () => {
      const match = 'x-pack/examples/hello_world/test/scout_examples/ui/playwright.config.ts'.match(
        SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBe('x-pack/examples');
      expect(match![2]).toBe('hello_world');
      expect(match![3]).toBe('examples');
      expect(match![4]).toBe('ui');
    });

    it('matches examples/ with bare scout/ (no custom config set)', () => {
      const match = 'examples/hello_world/test/scout/api/playwright.config.ts'.match(
        SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX
      );
      expect(match).not.toBeNull();
      expect(match![1]).toBe('examples');
      expect(match![3]).toBeUndefined();
    });

    it('matches named playwright config under examples/', () => {
      const match =
        'examples/hello_world/test/scout_examples/api/parallel.playwright.config.ts'.match(
          SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX
        );
      expect(match).not.toBeNull();
      expect(match![5]).toBe('parallel');
    });

    it('does not match platform plugin paths', () => {
      expect(
        SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX.test(
          'src/platform/plugins/shared/my_plugin/test/scout/api/playwright.config.ts'
        )
      ).toBe(false);
    });
  });

  describe('SCOUT_UNIFIED_CONFIG_PATH_REGEX', () => {
    it('matches platform plugin path with correct named groups', () => {
      const match =
        'src/platform/plugins/shared/my_plugin/test/scout/api/playwright.config.ts'.match(
          SCOUT_UNIFIED_CONFIG_PATH_REGEX
        );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          examplesRoot: undefined,
          examplePlugin: undefined,
          platformOrCore: 'platform',
          solution: undefined,
          moduleKind: 'plugins',
          moduleVisibility: 'shared',
          moduleName: 'my_plugin',
          serverConfigSet: undefined,
          testCategory: 'api',
          testConfigType: '',
        })
      );
    });

    it('matches core package path with correct named groups', () => {
      const match = 'src/core/packages/my_package/test/scout/api/playwright.config.ts'.match(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX
      );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          platformOrCore: 'core',
          moduleKind: 'packages',
          moduleName: 'my_package',
          testCategory: 'api',
        })
      );
    });

    it('matches src/core root path (no sub-package) with correct named groups', () => {
      const match = 'src/core/test/scout/api/playwright.config.ts'.match(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX
      );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          coreRoot: 'src/core',
          platformOrCore: undefined,
          moduleKind: undefined,
          moduleName: undefined,
          serverConfigSet: undefined,
          testCategory: 'api',
          testConfigType: '',
        })
      );
    });

    it('matches src/core root path with custom server config set', () => {
      const match = 'src/core/test/scout_custom/api/playwright.config.ts'.match(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX
      );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          coreRoot: 'src/core',
          serverConfigSet: 'custom',
          testCategory: 'api',
        })
      );
    });

    it('matches solution plugin path with correct named groups', () => {
      const match =
        'x-pack/solutions/security/plugins/my_plugin/test/scout/ui/parallel.playwright.config.ts'.match(
          SCOUT_UNIFIED_CONFIG_PATH_REGEX
        );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          examplesRoot: undefined,
          platformOrCore: undefined,
          solution: 'security',
          moduleKind: 'plugins',
          moduleVisibility: '',
          moduleName: 'my_plugin',
          testCategory: 'ui',
          testConfigType: 'parallel',
        })
      );
    });

    it('matches custom server config set', () => {
      const match =
        'src/platform/plugins/shared/my_plugin/test/scout_uiam_local/api/playwright.config.ts'.match(
          SCOUT_UNIFIED_CONFIG_PATH_REGEX
        );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          serverConfigSet: 'uiam_local',
          testCategory: 'api',
        })
      );
    });

    it('matches nested module names (e.g. vis_types/timelion)', () => {
      const match =
        'src/platform/plugins/private/vis_types/timelion/test/scout/ui/playwright.config.ts'.match(
          SCOUT_UNIFIED_CONFIG_PATH_REGEX
        );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          moduleName: 'vis_types/timelion',
          moduleVisibility: 'private',
        })
      );
    });

    it('matches examples/ path with correct named groups', () => {
      const match = 'examples/hello_world/test/scout_examples/api/playwright.config.ts'.match(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX
      );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          examplesRoot: 'examples',
          examplePlugin: 'hello_world',
          platformOrCore: undefined,
          solution: undefined,
          moduleKind: undefined,
          moduleName: undefined,
          serverConfigSet: 'examples',
          testCategory: 'api',
          testConfigType: '',
        })
      );
    });

    it('matches x-pack/examples/ path with correct named groups', () => {
      const match =
        'x-pack/examples/hello_world/test/scout_examples/ui/parallel.playwright.config.ts'.match(
          SCOUT_UNIFIED_CONFIG_PATH_REGEX
        );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          examplesRoot: 'x-pack/examples',
          examplePlugin: 'hello_world',
          serverConfigSet: 'examples',
          testCategory: 'ui',
          testConfigType: 'parallel',
        })
      );
    });

    it('matches examples/ with bare scout/ (no config set)', () => {
      const match = 'examples/hello_world/test/scout/api/playwright.config.ts'.match(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX
      );
      expect(match?.groups).toEqual(
        expect.objectContaining({
          examplesRoot: 'examples',
          examplePlugin: 'hello_world',
          serverConfigSet: undefined,
          testCategory: 'api',
        })
      );
    });

    it('does not match random paths', () => {
      expect(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX.test('random/path/test/scout/api/playwright.config.ts')
      ).toBe(false);
    });

    it('does not match non-playwright configs', () => {
      expect(
        SCOUT_UNIFIED_CONFIG_PATH_REGEX.test(
          'src/platform/plugins/shared/my_plugin/test/scout/api/jest.config.ts'
        )
      ).toBe(false);
    });
  });
});

/**
 * `selective_scout.ts` (under `.buildkite/pipeline-utils/`) can't import from
 * `@kbn/*` packages, so it keeps its own copy of these patterns. This test
 * reads that file and checks each pattern is still present, so the two
 * copies stay in sync.
 */
describe('Scout tests-only patterns duplicated in pipeline-utils/selective_scout', () => {
  const duplicatePath = path.resolve(
    REPO_ROOT,
    '.buildkite/pipeline-utils/ci-stats/pick_test_group_run_order/selective_scout.ts'
  );
  const duplicateSource = fs.readFileSync(duplicatePath, 'utf-8');

  // Match the pattern whether it's written with single or double quotes,
  // so reformatting selective_scout.ts can't accidentally break this test.
  const containsPatternLiteral = (source: string, pattern: string): boolean =>
    source.includes(`'${pattern}'`) || source.includes(`"${pattern}"`);

  it.each(SCOUT_TESTS_ONLY_IGNORE_PATTERNS)(
    'selective_scout.ts contains ignore pattern verbatim: %s',
    (pattern) => {
      expect(containsPatternLiteral(duplicateSource, pattern)).toBe(true);
    }
  );

  it.each(SCOUT_TESTS_ONLY_SCOPE_GLOBS)(
    'selective_scout.ts contains scope glob verbatim: %s',
    (pattern) => {
      expect(containsPatternLiteral(duplicateSource, pattern)).toBe(true);
    }
  );
});
