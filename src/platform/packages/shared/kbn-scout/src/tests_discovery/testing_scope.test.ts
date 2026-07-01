/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ToolingLog } from '@kbn/tooling-log';

import {
  criticalScoutFilesTouched,
  deriveScoutConfigsForFile,
  deriveScoutConfigsForFiles,
  isScoutTestsOnlyDiff,
  readScoutTestingScope,
  resolveScoutTestingScope,
  serializeScoutTestingScope,
  writeScoutTestingScope,
} from './testing_scope';
import type { ScoutTestingScope } from './testing_scope';
import type { CodeChanges } from './code_changes';

describe('isScoutTestsOnlyDiff', () => {
  it('returns false for an empty diff', () => {
    expect(isScoutTestsOnlyDiff([])).toBe(false);
  });

  it('returns false when the diff contains only noise files (no real signal)', () => {
    expect(isScoutTestsOnlyDiff(['README.md', 'docs/CHANGELOG.md'])).toBe(false);
  });

  it('returns true when every non-noise file is in a Scout test scope', () => {
    const files = [
      'pkg/test/scout/ui/tests/a.spec.ts',
      'pkg/test/scout/ui/fixtures/page_objects/foo.ts',
      'pkg/README.md', // noise — ignored
    ];
    expect(isScoutTestsOnlyDiff(files)).toBe(true);
  });

  it('returns false when at least one non-noise file is outside Scout scope', () => {
    const files = ['pkg/test/scout/ui/tests/a.spec.ts', 'pkg/public/foo.ts'];
    expect(isScoutTestsOnlyDiff(files)).toBe(false);
  });

  it('matches custom scout_<server> scopes', () => {
    expect(isScoutTestsOnlyDiff(['pkg/test/scout_search_sessions/api/tests/a.spec.ts'])).toBe(true);
  });

  it('matches .meta/ paths under both default and custom scopes', () => {
    expect(
      isScoutTestsOnlyDiff([
        'pkg/test/scout/.meta/ui/standard.json',
        'pkg/test/scout_examples/.meta/api/standard.json',
      ])
    ).toBe(true);
  });

  it('matches area-scoped spec files', () => {
    expect(
      isScoutTestsOnlyDiff([
        'pkg/test/scout/detection_engine/ui/parallel_tests/foo.spec.ts',
        'pkg/test/scout/entity_analytics/ui/parallel_tests/bar.spec.ts',
      ])
    ).toBe(true);
  });

  it('matches area-scoped .meta/ paths', () => {
    expect(isScoutTestsOnlyDiff(['pkg/test/scout/detection_engine/.meta/ui/parallel.json'])).toBe(
      true
    );
  });
});

describe('criticalScoutFilesTouched', () => {
  it('returns false for empty input', () => {
    expect(criticalScoutFilesTouched([])).toBe(false);
  });

  it('returns true for changes in @kbn/scout package', () => {
    expect(
      criticalScoutFilesTouched(['src/platform/packages/shared/kbn-scout/src/runner/index.ts'])
    ).toBe(true);
  });

  it('returns true for top-level dependency files', () => {
    expect(criticalScoutFilesTouched(['package.json'])).toBe(true);
    expect(criticalScoutFilesTouched(['yarn.lock'])).toBe(true);
  });

  it('returns true for buildkite Scout step changes', () => {
    expect(
      criticalScoutFilesTouched(['.buildkite/scripts/steps/test/scout/test_run_builder.sh'])
    ).toBe(true);
  });

  it('returns false for changes outside the critical list', () => {
    expect(
      criticalScoutFilesTouched([
        'src/platform/plugins/shared/foo/public/index.ts',
        'README.md',
        'pkg/test/scout/ui/tests/a.spec.ts',
      ])
    ).toBe(false);
  });
});

describe('deriveScoutConfigsForFile', () => {
  let tmpRoot: string;

  const touch = (rel: string) => {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-affected-resolver-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns [] for paths outside any Scout scope', () => {
    expect(deriveScoutConfigsForFile('src/core/server/foo.ts', tmpRoot)).toEqual([]);
    expect(deriveScoutConfigsForFile('test/scout/foo.ts', tmpRoot)).toEqual([]);
  });

  it('maps a single-thread spec to playwright.config.ts', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    expect(deriveScoutConfigsForFile('pkg/test/scout/ui/tests/a.spec.ts', tmpRoot)).toEqual([
      'pkg/test/scout/ui/playwright.config.ts',
    ]);
  });

  it('maps a parallel spec to parallel.playwright.config.ts', () => {
    touch('pkg/test/scout/ui/parallel.playwright.config.ts');
    expect(
      deriveScoutConfigsForFile('pkg/test/scout/ui/parallel_tests/a.spec.ts', tmpRoot)
    ).toEqual(['pkg/test/scout/ui/parallel.playwright.config.ts']);
  });

  it('maps shared scope files (fixtures/page_objects/helpers) to both configs when both exist', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    touch('pkg/test/scout/ui/parallel.playwright.config.ts');

    const configs = deriveScoutConfigsForFile(
      'pkg/test/scout/ui/fixtures/page_objects/foo.ts',
      tmpRoot
    );
    expect(configs.sort()).toEqual([
      'pkg/test/scout/ui/parallel.playwright.config.ts',
      'pkg/test/scout/ui/playwright.config.ts',
    ]);
  });

  it('drops configs that do not exist on disk', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    // No parallel config exists.
    const configs = deriveScoutConfigsForFile('pkg/test/scout/ui/helpers.ts', tmpRoot);
    expect(configs).toEqual(['pkg/test/scout/ui/playwright.config.ts']);
  });

  it('never crosses ui ↔ api scopes', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    touch('pkg/test/scout/api/playwright.config.ts');

    const uiChange = deriveScoutConfigsForFile('pkg/test/scout/ui/fixtures/foo.ts', tmpRoot);
    expect(uiChange.every((c) => c.includes('/ui/'))).toBe(true);

    const apiChange = deriveScoutConfigsForFile('pkg/test/scout/api/helpers.ts', tmpRoot);
    expect(apiChange.every((c) => c.includes('/api/'))).toBe(true);
  });

  it('never crosses scout ↔ scout_<custom> scopes', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    touch('pkg/test/scout_custom/ui/playwright.config.ts');

    expect(deriveScoutConfigsForFile('pkg/test/scout/ui/tests/a.spec.ts', tmpRoot)).toEqual([
      'pkg/test/scout/ui/playwright.config.ts',
    ]);
    expect(deriveScoutConfigsForFile('pkg/test/scout_custom/ui/tests/a.spec.ts', tmpRoot)).toEqual([
      'pkg/test/scout_custom/ui/playwright.config.ts',
    ]);
  });

  it('handles custom-server scopes (test/scout_<custom>) symmetrically', () => {
    touch('pkg/test/scout_oas_schema/ui/playwright.config.ts');
    expect(
      deriveScoutConfigsForFile('pkg/test/scout_oas_schema/ui/tests/a.spec.ts', tmpRoot)
    ).toEqual(['pkg/test/scout_oas_schema/ui/playwright.config.ts']);
  });

  it('maps .meta/(ui|api) manifests to the matching scope', () => {
    touch('pkg/test/scout/api/playwright.config.ts');
    touch('pkg/test/scout/api/parallel.playwright.config.ts');

    const configs = deriveScoutConfigsForFile('pkg/test/scout/.meta/api/standard.json', tmpRoot);
    expect(configs.sort()).toEqual([
      'pkg/test/scout/api/parallel.playwright.config.ts',
      'pkg/test/scout/api/playwright.config.ts',
    ]);
  });

  it('maps .meta under custom-server scopes too', () => {
    touch('pkg/test/scout_examples/ui/playwright.config.ts');
    const configs = deriveScoutConfigsForFile(
      'pkg/test/scout_examples/.meta/ui/standard.json',
      tmpRoot
    );
    expect(configs).toEqual(['pkg/test/scout_examples/ui/playwright.config.ts']);
  });

  it('maps an edit to the playwright config itself to that single config', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    touch('pkg/test/scout/ui/parallel.playwright.config.ts');

    const configs = deriveScoutConfigsForFile('pkg/test/scout/ui/playwright.config.ts', tmpRoot);
    expect(configs.sort()).toEqual([
      'pkg/test/scout/ui/parallel.playwright.config.ts',
      'pkg/test/scout/ui/playwright.config.ts',
    ]);
  });

  it('handles deeply-nested package roots', () => {
    touch('x-pack/solutions/observability/plugins/foo/test/scout/ui/playwright.config.ts');
    expect(
      deriveScoutConfigsForFile(
        'x-pack/solutions/observability/plugins/foo/test/scout/ui/tests/a.spec.ts',
        tmpRoot
      )
    ).toEqual(['x-pack/solutions/observability/plugins/foo/test/scout/ui/playwright.config.ts']);
  });

  it('maps an area parallel spec to the area parallel config', () => {
    touch('pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts');
    expect(
      deriveScoutConfigsForFile(
        'pkg/test/scout/detection_engine/ui/parallel_tests/a.spec.ts',
        tmpRoot
      )
    ).toEqual(['pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts']);
  });

  it('maps an area sequential spec to the area playwright.config.ts', () => {
    touch('pkg/test/scout/detection_engine/ui/playwright.config.ts');
    expect(
      deriveScoutConfigsForFile('pkg/test/scout/detection_engine/ui/tests/a.spec.ts', tmpRoot)
    ).toEqual(['pkg/test/scout/detection_engine/ui/playwright.config.ts']);
  });

  it('maps area shared fixtures to all area-scoped configs that exist', () => {
    touch('pkg/test/scout/detection_engine/ui/playwright.config.ts');
    touch('pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts');

    const configs = deriveScoutConfigsForFile(
      'pkg/test/scout/detection_engine/ui/fixtures/page_objects/foo.ts',
      tmpRoot
    );
    expect(configs.sort()).toEqual([
      'pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts',
      'pkg/test/scout/detection_engine/ui/playwright.config.ts',
    ]);
  });

  it('maps area .meta/ manifests to the area-scoped configs', () => {
    touch('pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts');
    const configs = deriveScoutConfigsForFile(
      'pkg/test/scout/detection_engine/.meta/ui/parallel.json',
      tmpRoot
    );
    expect(configs).toEqual(['pkg/test/scout/detection_engine/ui/parallel.playwright.config.ts']);
  });

  it('never crosses area scopes — area A change does not affect area B config', () => {
    touch('pkg/test/scout/detection_engine/ui/playwright.config.ts');
    touch('pkg/test/scout/entity_analytics/ui/playwright.config.ts');

    const de = deriveScoutConfigsForFile(
      'pkg/test/scout/detection_engine/ui/tests/a.spec.ts',
      tmpRoot
    );
    expect(de).toEqual(['pkg/test/scout/detection_engine/ui/playwright.config.ts']);

    const ea = deriveScoutConfigsForFile(
      'pkg/test/scout/entity_analytics/ui/tests/b.spec.ts',
      tmpRoot
    );
    expect(ea).toEqual(['pkg/test/scout/entity_analytics/ui/playwright.config.ts']);
  });

  it('non-area spec is not matched to area configs', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    touch('pkg/test/scout/detection_engine/ui/playwright.config.ts');

    expect(deriveScoutConfigsForFile('pkg/test/scout/ui/tests/a.spec.ts', tmpRoot)).toEqual([
      'pkg/test/scout/ui/playwright.config.ts',
    ]);
  });
});

describe('deriveScoutConfigsForFiles', () => {
  let tmpRoot: string;

  const touch = (rel: string) => {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-affected-resolver-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('unions configs across multiple files and dedupes', () => {
    touch('a/test/scout/ui/playwright.config.ts');
    touch('a/test/scout/api/playwright.config.ts');
    touch('b/test/scout_custom/ui/playwright.config.ts');

    const result = deriveScoutConfigsForFiles(
      [
        'a/test/scout/ui/tests/x.spec.ts',
        'a/test/scout/ui/tests/y.spec.ts', // dedupes with previous
        'a/test/scout/api/helpers.ts',
        'b/test/scout_custom/ui/parallel_tests/z.spec.ts', // no parallel config -> dropped
      ],
      tmpRoot
    );

    expect([...result].sort()).toEqual([
      'a/test/scout/api/playwright.config.ts',
      'a/test/scout/ui/playwright.config.ts',
    ]);
  });

  it('returns an empty set when no file maps to a Scout scope', () => {
    expect(deriveScoutConfigsForFiles(['src/foo.ts', 'README.md'], tmpRoot).size).toBe(0);
  });
});

describe('resolveScoutTestingScope', () => {
  let tmpRoot: string;
  let log: ToolingLog;
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;

  const touch = (rel: string) => {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  };

  const codeChanges = (changedFiles: string[], affectedModules: string[] = []): CodeChanges => ({
    mergeBase: 'abc123',
    changedFiles,
    affectedModules,
  });

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-testing-scope-'));
    log = new ToolingLog({ level: 'verbose', writeTo: process.stdout });
    infoSpy = jest.spyOn(log, 'info').mockImplementation(jest.fn());
    warningSpy = jest.spyOn(log, 'warning').mockImplementation(jest.fn());
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('returns full/selective-disabled when selectiveTesting is false', () => {
    const scope = resolveScoutTestingScope(codeChanges(['some/file.ts']), false, log, tmpRoot);
    expect(scope).toEqual({ kind: 'full', reason: 'selective-disabled' });
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('returns full/selective-disabled when codeChanges is null', () => {
    const scope = resolveScoutTestingScope(null, true, log, tmpRoot);
    expect(scope).toEqual({ kind: 'full', reason: 'selective-disabled' });
  });

  it('returns full/critical-files when a critical Scout file is touched', () => {
    const scope = resolveScoutTestingScope(
      codeChanges(['src/platform/packages/shared/kbn-scout/src/runner/index.ts']),
      true,
      log,
      tmpRoot
    );
    expect(scope).toEqual({ kind: 'full', reason: 'critical-files' });
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('critical Scout files touched')
    );
  });

  it('returns tests-only with the affected configs when the diff is purely Scout tests', () => {
    touch('pkg/test/scout/ui/playwright.config.ts');
    const scope = resolveScoutTestingScope(
      codeChanges(['pkg/test/scout/ui/tests/foo.spec.ts']),
      true,
      log,
      tmpRoot
    );
    expect(scope.kind).toBe('tests-only');
    if (scope.kind === 'tests-only') {
      expect([...scope.affectedConfigPaths]).toEqual(['pkg/test/scout/ui/playwright.config.ts']);
    }
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('tests-only fast path'));
  });

  it('returns dependency-tree when the diff mixes Scout tests and source files', () => {
    const scope = resolveScoutTestingScope(
      codeChanges(
        ['pkg/test/scout/ui/tests/foo.spec.ts', 'pkg/public/foo.ts'],
        ['@kbn/foo', '@kbn/bar']
      ),
      true,
      log,
      tmpRoot
    );
    expect(scope.kind).toBe('dependency-tree');
    if (scope.kind === 'dependency-tree') {
      expect([...scope.affectedModuleIds].sort()).toEqual(['@kbn/bar', '@kbn/foo']);
    }
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('dependency-tree mode'));
  });

  it('priorities critical-files over tests-only', () => {
    // A diff that is BOTH a Scout-tests-only diff AND touches a critical file
    // should fall through to critical-files (full suite).
    const scope = resolveScoutTestingScope(
      codeChanges([
        'pkg/test/scout/ui/tests/foo.spec.ts',
        'src/platform/packages/shared/kbn-scout/src/runner/index.ts',
      ]),
      true,
      log,
      tmpRoot
    );
    expect(scope).toEqual({ kind: 'full', reason: 'critical-files' });
  });
});

describe('serializeScoutTestingScope', () => {
  it('serialises a full/selective-disabled scope with sorted affectedModules', () => {
    const scope: ScoutTestingScope = { kind: 'full', reason: 'selective-disabled' };
    expect(serializeScoutTestingScope(scope, new Set(['@kbn/b', '@kbn/a']))).toEqual({
      kind: 'full',
      reason: 'selective-disabled',
      affectedModules: ['@kbn/a', '@kbn/b'],
    });
  });

  it('serialises a full/critical-files scope including affectedModules', () => {
    const scope: ScoutTestingScope = { kind: 'full', reason: 'critical-files' };
    expect(serializeScoutTestingScope(scope, new Set(['@kbn/scout']))).toEqual({
      kind: 'full',
      reason: 'critical-files',
      affectedModules: ['@kbn/scout'],
    });
  });

  it('serialises a tests-only scope with sorted affectedConfigs', () => {
    const scope: ScoutTestingScope = {
      kind: 'tests-only',
      affectedConfigPaths: new Set(['b/playwright.config.ts', 'a/playwright.config.ts']),
    };
    expect(serializeScoutTestingScope(scope, new Set(['@kbn/foo']))).toEqual({
      kind: 'tests-only',
      affectedModules: ['@kbn/foo'],
      affectedConfigs: ['a/playwright.config.ts', 'b/playwright.config.ts'],
    });
  });

  it('serialises a dependency-tree scope with sorted modules', () => {
    const scope: ScoutTestingScope = {
      kind: 'dependency-tree',
      affectedModuleIds: new Set(['@kbn/foo', '@kbn/bar']),
    };
    // By contract `resolveScoutTestingScope` builds `scope.affectedModuleIds`
    // from the same data as the `affectedModules` arg — the serializer just
    // reuses the explicit arg.
    expect(serializeScoutTestingScope(scope, new Set(['@kbn/foo', '@kbn/bar']))).toEqual({
      kind: 'dependency-tree',
      affectedModules: ['@kbn/bar', '@kbn/foo'],
    });
  });

  it('produces an empty affectedModules array when no modules are affected', () => {
    const scope: ScoutTestingScope = { kind: 'full', reason: 'selective-disabled' };
    expect(serializeScoutTestingScope(scope, new Set())).toEqual({
      kind: 'full',
      reason: 'selective-disabled',
      affectedModules: [],
    });
  });
});

describe('writeScoutTestingScope', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-write-scope-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes the serialised scope as pretty-printed JSON, creating parent dirs', () => {
    const outputPath = path.join(tmpRoot, 'nested/dir/testing_scope.json');
    const scope: ScoutTestingScope = {
      kind: 'tests-only',
      affectedConfigPaths: new Set(['x/playwright.config.ts']),
    };

    writeScoutTestingScope(scope, new Set(['@kbn/x']), outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(written).toEqual({
      kind: 'tests-only',
      affectedModules: ['@kbn/x'],
      affectedConfigs: ['x/playwright.config.ts'],
    });
  });
});

describe('readScoutTestingScope', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-read-scope-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const writeFixture = (content: string, name = 'testing_scope.json'): string => {
    const filePath = path.join(tmpRoot, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  it('reads back a tests-only scope written by writeScoutTestingScope (round-trip)', () => {
    const outputPath = path.join(tmpRoot, 'rt.json');
    writeScoutTestingScope(
      {
        kind: 'tests-only',
        affectedConfigPaths: new Set(['a/playwright.config.ts']),
      },
      new Set(['@kbn/a']),
      outputPath
    );
    expect(readScoutTestingScope(outputPath)).toEqual({
      kind: 'tests-only',
      affectedModules: ['@kbn/a'],
      affectedConfigs: ['a/playwright.config.ts'],
    });
  });

  it('throws when the file does not exist', () => {
    expect(() => readScoutTestingScope(path.join(tmpRoot, 'missing.json'))).toThrow(
      /Failed to read testing-scope file/
    );
  });

  it('throws when the file is not valid JSON', () => {
    const filePath = writeFixture('{not json');
    expect(() => readScoutTestingScope(filePath)).toThrow(/not valid JSON/);
  });

  it('throws when the JSON shape is missing required fields', () => {
    const filePath = writeFixture(JSON.stringify({ kind: 'full' })); // missing affectedModules
    expect(() => readScoutTestingScope(filePath)).toThrow(/must contain/);
  });

  it('throws when kind is unknown', () => {
    const filePath = writeFixture(JSON.stringify({ kind: 'something', affectedModules: [] }));
    expect(() => readScoutTestingScope(filePath)).toThrow(/must contain/);
  });
});
