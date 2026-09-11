/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Minimatch } from 'minimatch';

import { generateOxlintConfig, type LintProject } from './generate_oxlint_config';

const RULE = 'typescript/no-floating-promises';

/** resolves the rule's final state for a file the way oxlint does: last matching override wins */
const enforcedOn = (config: ReturnType<typeof generateOxlintConfig>, file: string) => {
  let on = false;
  for (const override of config.overrides) {
    if (override.files.some((glob) => new Minimatch(glob, { dot: true }).match(file))) {
      on = override.rules[RULE] !== 'off';
    }
  }
  return on;
};

const project = (
  repoRelDir: string,
  include = ['**/*'],
  exclude = ['target/**/*']
): LintProject => ({
  repoRelDir,
  include,
  exclude,
});

describe('generateOxlintConfig', () => {
  it('enforces the rule only on files matching a glob relative to the owning project', () => {
    const config = generateOxlintConfig(
      [project('plugins/a')],
      ['plugins/a/server/routes.ts', 'plugins/a/public/app.tsx']
    );

    expect(enforcedOn(config, 'plugins/a/server/routes.ts')).toBe(true);
    expect(enforcedOn(config, 'plugins/a/public/app.tsx')).toBe(false);
  });

  it('does not let a project-relative glob match from the repo root', () => {
    // `examples/**/*` is a rule glob, but each example is its own project so the
    // glob never matches relative to the project that owns the files
    const config = generateOxlintConfig(
      [project('.', ['kibana.d.ts']), project('examples/demo')],
      ['kibana.d.ts', 'examples/demo/public/app.tsx']
    );

    expect(enforcedOn(config, 'examples/demo/public/app.tsx')).toBe(false);
  });

  it('honours the parent exclude when a nested project owns the files', () => {
    // parent `test/` lints `plugin_functional/tests/**` (matches `*functional*/**/*`) but
    // excludes `*/plugins/**/*`, which a nested plugin project owns instead
    const config = generateOxlintConfig(
      [project('test', ['**/*'], ['*/plugins/**/*']), project('test/plugin_functional/plugins/p')],
      [
        'test/plugin_functional/tests/smoke.ts',
        'test/plugin_functional/plugins/p/public/app.tsx',
        'test/plugin_functional/plugins/p/server/plugin.ts',
      ]
    );

    expect(enforcedOn(config, 'test/plugin_functional/tests/smoke.ts')).toBe(true);
    expect(enforcedOn(config, 'test/plugin_functional/plugins/p/public/app.tsx')).toBe(false);
    // the nested project's own `server/**/*` glob still applies
    expect(enforcedOn(config, 'test/plugin_functional/plugins/p/server/plugin.ts')).toBe(true);
  });

  it('turns the rule off for nested projects the parent include does not cover', () => {
    // parent includes `test/scout/api/**` only; its `test/scout/**/*` glob must not
    // reach into `test/scout/ui/`, which the nested project scopes to `tests/**/*.spec.ts`
    const config = generateOxlintConfig(
      [
        project('plugins/infra', ['server/**/*', 'test/scout/api/**/*']),
        project('plugins/infra/test/scout/ui'),
      ],
      [
        'plugins/infra/test/scout/api/index.ts',
        'plugins/infra/test/scout/ui/fixtures/constants.ts',
        'plugins/infra/test/scout/ui/tests/hosts.spec.ts',
      ]
    );

    expect(enforcedOn(config, 'plugins/infra/test/scout/api/index.ts')).toBe(true);
    expect(enforcedOn(config, 'plugins/infra/test/scout/ui/fixtures/constants.ts')).toBe(false);
    expect(enforcedOn(config, 'plugins/infra/test/scout/ui/tests/hosts.spec.ts')).toBe(true);
  });

  it('applies the exempt globs relative to the owning project', () => {
    const config = generateOxlintConfig(
      [project('x-pack/test')],
      [
        'x-pack/test/spaces_api_integration/common/services/basic_auth_supertest.ts',
        'x-pack/test/spaces_api_integration/common/services/other.ts',
      ]
    );

    expect(
      enforcedOn(
        config,
        'x-pack/test/spaces_api_integration/common/services/basic_auth_supertest.ts'
      )
    ).toBe(false);
    expect(enforcedOn(config, 'x-pack/test/spaces_api_integration/common/services/other.ts')).toBe(
      true
    );
  });

  it('ignores files that no project covers', () => {
    const config = generateOxlintConfig(
      [project('plugins/a', ['server/**/*'])],
      ['plugins/a/server/plugin.ts', 'plugins/a/scripts/build.ts', '.github/query.ts']
    );

    expect(config.ignorePatterns).toEqual(
      expect.arrayContaining(['plugins/a/scripts/build.ts', '.github/query.ts'])
    );
    expect(config.ignorePatterns).not.toContain('plugins/a/server/plugin.ts');
  });

  it('ignores declaration files via a glob, not the uncovered-files list', () => {
    const config = generateOxlintConfig(
      [project('plugins/a', ['server/**/*'])],
      ['plugins/a/server/plugin.ts', 'plugins/a/server/types.d.ts']
    );

    expect(config.ignorePatterns).toContain('**/*.d.ts');
    expect(config.ignorePatterns).not.toContain('plugins/a/server/types.d.ts');
  });
});
