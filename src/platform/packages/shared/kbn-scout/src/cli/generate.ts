/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Command } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import Fsp from 'fs/promises';
import inquirer from 'inquirer';
import Path from 'path';
import {
  generateApiConstantsContent,
  generateApiFixturesIndexContent,
  generateApiSpecContent,
  generateConfigContent,
  generateUiConstantsContent,
  generateUiDemoPageContent,
  generateUiFixturesIndexContent,
  generateUiPageObjectsIndexContent,
  generateUiParallelGlobalSetupContent,
  generateUiParallelSpecContent,
  generateUiSpecContent,
  getCopyrightHeader,
  getScoutPackageImport,
} from '../generator_content';
import {
  getScoutCiConfigModuleFromPath,
  upsertEnabledModuleInScoutCiConfigYml,
} from './scout_ci_config';

const TEST_TYPES = ['ui', 'api', 'both'] as const;
type TestType = (typeof TEST_TYPES)[number];

function normalizeScoutRoot(scoutRootRaw: string): string {
  const normalized = scoutRootRaw.trim().replace(/\\/g, '/');
  const stripped = normalized.startsWith('test/') ? normalized.slice('test/'.length) : normalized;

  if (!stripped) {
    throw createFlagError(`--scout-root cannot be empty`);
  }

  if (stripped.includes('/')) {
    throw createFlagError(`--scout-root must be a directory name under "test/" (e.g. "scout")`);
  }

  if (!/^scout(?:_[a-z0-9_]+)?$/.test(stripped)) {
    throw createFlagError(
      `--scout-root must match "scout" or "scout_<configSet>", got "${stripped}"`
    );
  }

  return stripped;
}

function normalizeNamespace(namespaceRaw: string): string {
  const normalized = namespaceRaw.trim().replace(/\\/g, '/');

  if (!normalized) {
    throw createFlagError(`--namespace cannot be empty`);
  }

  if (normalized.includes('/')) {
    throw createFlagError(`--namespace must be a single directory name with no slashes`);
  }

  const RESERVED_NAMESPACE_NAMES = new Set(['api', 'ui', '.meta', 'common']);
  if (RESERVED_NAMESPACE_NAMES.has(normalized)) {
    throw createFlagError(
      `--namespace cannot be "${normalized}" — reserved names are: ${[
        ...RESERVED_NAMESPACE_NAMES,
      ].join(', ')}. ` +
        `"common" is reserved for a plain shared-utilities directory (no Playwright config).`
    );
  }

  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw createFlagError(
      `--namespace must start with a lowercase letter and contain only lowercase letters, digits, and underscores, got "${normalized}"`
    );
  }

  return normalized;
}

async function validatePath(input: string): Promise<boolean | string> {
  const normalizedPath = input.trim();
  if (!normalizedPath) {
    return 'Path cannot be empty';
  }

  const fullPath = Path.resolve(REPO_ROOT, normalizedPath);

  if (!fullPath.startsWith(REPO_ROOT)) {
    return 'Path must be within the repository root';
  }

  try {
    const stat = await Fsp.stat(fullPath);
    if (!stat.isDirectory()) {
      return 'Path must be a directory';
    }
  } catch (error) {
    return `Path does not exist: ${normalizedPath}`;
  }

  try {
    getScoutPackageImport(normalizedPath);
  } catch (error) {
    return error instanceof Error ? error.message : 'Path does not match supported patterns';
  }

  // Ensure the user is pointing at a module root (not a subdirectory).
  try {
    const kibanaJsoncPath = Path.resolve(fullPath, 'kibana.jsonc');
    const stat = await Fsp.stat(kibanaJsoncPath);
    if (!stat.isFile()) {
      return 'Path must contain a kibana.jsonc file';
    }

    return true;
  } catch (error) {
    return 'Path must point at a Kibana plugin/package root containing kibana.jsonc';
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await Fsp.stat(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Returns the list of existing namespace sub-directories inside a scout root.
 * Used by the interactive prompt to avoid surprising the developer with a
 * hard mixing-guard error after they've already answered other questions.
 */
async function detectExistingNamespaces(scoutDir: string): Promise<string[]> {
  const RESERVED = new Set(['ui', 'api', '.meta', 'common']);
  try {
    const entries = await Fsp.readdir(scoutDir, { withFileTypes: true });
    const namespaces: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || RESERVED.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      const hasNamespaceUi = await pathExists(Path.resolve(scoutDir, entry.name, 'ui'));
      const hasNamespaceApi = await pathExists(Path.resolve(scoutDir, entry.name, 'api'));
      if (hasNamespaceUi || hasNamespaceApi) namespaces.push(entry.name);
    }
    return namespaces;
  } catch {
    return [];
  }
}

async function createDirectoryStructure(
  basePath: string,
  opts: {
    scoutRoot: string;
    namespace?: string;
    generateApi: boolean;
    generateUi: boolean;
    uiParallel: boolean;
  }
): Promise<void> {
  const fullBasePath = Path.resolve(REPO_ROOT, basePath);
  const scoutRootDir = Path.resolve(fullBasePath, 'test', opts.scoutRoot);
  // When a namespace is provided, all generated content lives under test/<scoutRoot>/<namespace>/
  const contentRootDir = opts.namespace ? Path.resolve(scoutRootDir, opts.namespace) : scoutRootDir;
  const scoutPackage = getScoutPackageImport(basePath);
  const copyrightHeader = getCopyrightHeader(basePath);

  if (opts.generateApi) {
    const apiTestDir = Path.resolve(contentRootDir, 'api');
    const apiFixturesDir = Path.resolve(apiTestDir, 'fixtures');
    const apiTestsDir = Path.resolve(apiTestDir, 'tests');
    const apiConfigPath = Path.resolve(apiTestDir, 'playwright.config.ts');
    const apiExampleSpecPath = Path.resolve(apiTestsDir, 'example.spec.ts');
    const apiConstantsPath = Path.resolve(apiFixturesDir, 'constants.ts');
    const apiFixturesIndexPath = Path.resolve(apiFixturesDir, 'index.ts');

    // create scout/api/fixtures dir
    await Fsp.mkdir(apiFixturesDir, { recursive: true });
    // create scout/api/tests dir
    await Fsp.mkdir(apiTestsDir, { recursive: true });
    // create scout/api/playwright.config.ts file
    const apiConfigContent = generateConfigContent(scoutPackage, './tests', copyrightHeader);
    await Fsp.writeFile(apiConfigPath, apiConfigContent);
    // create scout/api/fixtures/constants.ts file
    const apiConstantsContent = generateApiConstantsContent(copyrightHeader);
    await Fsp.writeFile(apiConstantsPath, apiConstantsContent);
    // create scout/api/fixtures/index.ts file
    const apiFixturesIndexContent = generateApiFixturesIndexContent(scoutPackage, copyrightHeader);
    await Fsp.writeFile(apiFixturesIndexPath, apiFixturesIndexContent);
    // create scout/api/tests/example.spec.ts file
    const apiSpecContent = generateApiSpecContent(scoutPackage, copyrightHeader);
    await Fsp.writeFile(apiExampleSpecPath, apiSpecContent);
  }

  if (opts.generateUi) {
    const uiTestDir = Path.resolve(contentRootDir, 'ui');
    const uiFixturesDir = Path.resolve(uiTestDir, 'fixtures');
    const uiPageObjectsDir = Path.resolve(uiFixturesDir, 'page_objects');
    const uiPageObjectsIndexPath = Path.resolve(uiPageObjectsDir, 'index.ts');
    const uiDemoPagePath = Path.resolve(uiPageObjectsDir, 'demo.ts');
    const uiConstantsPath = Path.resolve(uiFixturesDir, 'constants.ts');
    const uiFixturesIndexPath = Path.resolve(uiFixturesDir, 'index.ts');

    if (opts.uiParallel) {
      const uiParallelTestsDir = Path.resolve(uiTestDir, 'parallel_tests');
      const uiConfigPath = Path.resolve(uiTestDir, 'parallel.playwright.config.ts');
      const uiParallelSpecPathOne = Path.resolve(uiParallelTestsDir, 'example_one.spec.ts');
      const uiParallelSpecPathTwo = Path.resolve(uiParallelTestsDir, 'example_two.spec.ts');
      const uiParallelGlobalSetupPath = Path.resolve(uiParallelTestsDir, 'global.setup.ts');

      // create scout/ui/fixtures dir
      await Fsp.mkdir(uiFixturesDir, { recursive: true });
      // create scout/ui/fixtures/page_objects dir
      await Fsp.mkdir(uiPageObjectsDir, { recursive: true });
      // create scout/ui/parallel_tests dir
      await Fsp.mkdir(uiParallelTestsDir, { recursive: true });
      // create scout/ui/parallel.playwright.config.ts file
      const uiParallelConfigContent = generateConfigContent(
        scoutPackage,
        './parallel_tests',
        copyrightHeader,
        {
          workers: 2,
          runGlobalSetup: true,
        }
      );
      await Fsp.writeFile(uiConfigPath, uiParallelConfigContent);
      // create scout/ui/fixtures/constants.ts file
      const uiConstantsContent = generateUiConstantsContent(copyrightHeader);
      await Fsp.writeFile(uiConstantsPath, uiConstantsContent);
      // create scout/ui/fixtures/index.ts file
      const uiFixturesIndexContent = generateUiFixturesIndexContent(
        scoutPackage,
        copyrightHeader,
        true
      );
      await Fsp.writeFile(uiFixturesIndexPath, uiFixturesIndexContent);
      // create scout/ui/fixtures/page_objects/demo.ts file
      const uiDemoPageContent = generateUiDemoPageContent(scoutPackage, copyrightHeader);
      await Fsp.writeFile(uiDemoPagePath, uiDemoPageContent);
      // create scout/ui/fixtures/page_objects/index.ts file
      const uiPageObjectsIndexContent = generateUiPageObjectsIndexContent(copyrightHeader);
      await Fsp.writeFile(uiPageObjectsIndexPath, uiPageObjectsIndexContent);
      // create scout/ui/parallel_tests/example_one.spec.ts file
      const uiParallelSpecContent = generateUiParallelSpecContent(scoutPackage, copyrightHeader);
      await Fsp.writeFile(uiParallelSpecPathOne, uiParallelSpecContent);
      // create scout/ui/parallel_tests/example_two.spec.ts file
      await Fsp.writeFile(uiParallelSpecPathTwo, uiParallelSpecContent);
      // create scout/ui/parallel_tests/global.setup.ts file
      const uiParallelGlobalSetupContent = generateUiParallelGlobalSetupContent(
        scoutPackage,
        copyrightHeader
      );
      await Fsp.writeFile(uiParallelGlobalSetupPath, uiParallelGlobalSetupContent);
    } else {
      const uiTestsDir = Path.resolve(uiTestDir, 'tests');
      const uiConfigPath = Path.resolve(uiTestDir, 'playwright.config.ts');
      const uiSpecPath = Path.resolve(uiTestsDir, 'example.spec.ts');

      // create scout/ui/fixtures dir
      await Fsp.mkdir(uiFixturesDir, { recursive: true });
      // create scout/ui/fixtures/page_objects dir
      await Fsp.mkdir(uiPageObjectsDir, { recursive: true });
      // create scout/ui/tests dir
      await Fsp.mkdir(uiTestsDir, { recursive: true });
      // create scout/ui/playwright.config.ts file
      const uiConfigContent = generateConfigContent(scoutPackage, './tests', copyrightHeader);
      await Fsp.writeFile(uiConfigPath, uiConfigContent);
      // create scout/ui/fixtures/constants.ts file
      const uiConstantsContent = generateUiConstantsContent(copyrightHeader);
      await Fsp.writeFile(uiConstantsPath, uiConstantsContent);
      // create scout/ui/fixtures/index.ts file
      const uiFixturesIndexContent = generateUiFixturesIndexContent(
        scoutPackage,
        copyrightHeader,
        false
      );
      await Fsp.writeFile(uiFixturesIndexPath, uiFixturesIndexContent);
      // create scout/ui/fixtures/page_objects/demo.ts file
      const uiDemoPageContent = generateUiDemoPageContent(scoutPackage, copyrightHeader);
      await Fsp.writeFile(uiDemoPagePath, uiDemoPageContent);
      // create scout/ui/fixtures/page_objects/index.ts file
      const uiPageObjectsIndexContent = generateUiPageObjectsIndexContent(copyrightHeader);
      await Fsp.writeFile(uiPageObjectsIndexPath, uiPageObjectsIndexContent);
      // create scout/ui/tests/example.spec.ts file
      const uiSpecContent = generateUiSpecContent(scoutPackage, copyrightHeader);
      await Fsp.writeFile(uiSpecPath, uiSpecContent);
    }
  }
}

async function enableModuleInScoutCiConfig(relativePath: string, log: ToolingLog): Promise<void> {
  const module = getScoutCiConfigModuleFromPath(relativePath);
  const scoutCiConfigPath = Path.resolve(REPO_ROOT, '.buildkite', 'scout_ci_config.yml');

  const existing = await Fsp.readFile(scoutCiConfigPath, 'utf8');
  const result = upsertEnabledModuleInScoutCiConfigYml(existing, module);

  if (!result.didChange) {
    log.info(
      `Scout CI config already enabled: ${module.kind} / ${module.name} in .buildkite/scout_ci_config.yml`
    );
    return;
  }

  await Fsp.writeFile(scoutCiConfigPath, result.updatedYml);

  const action = result.movedFromDisabled ? 'moved to enabled' : 'added to enabled';
  log.success(
    `Updated .buildkite/scout_ci_config.yml (${action}): ${module.kind} / ${module.name}`
  );
}

export const generateCmd: Command<void> = {
  name: 'generate',
  description: `
  Generate Scout test directory structure for a plugin or package.

  Interactive prompts are used by default. To run non-interactively, pass --path
  (and optionally --type / --scout-root / --no-ui-parallel / --force).

  It creates the appropriate directory structure and Playwright config files.
  It also registers the module under "enabled" in .buildkite/scout_ci_config.yml so the
  generated configs can run in CI.
  `,
  flags: {
    string: ['path', 'type', 'scout-root', 'namespace'],
    boolean: ['force', 'ui-parallel'],
    alias: {
      p: 'path',
      t: 'type',
      y: 'force',
    },
    default: {
      'ui-parallel': true,
    },
    help: `
    --path             Relative path to the plugin or package (e.g. x-pack/platform/plugins/shared/maps)
    --type             Test type to generate: api | ui | both
    --scout-root       Directory name under <path>/test/ (default: scout). Example: scout_uiam_local
    --namespace        Optional namespace sub-directory under test/<scout-root>/ (e.g. detection_engine).
                       Creates test/<scout-root>/<namespace>/{ui,api}/ instead of test/<scout-root>/{ui,api}/.
                       Useful for splitting a large plugin into independently-runnable CI configs per team namespace.
    --ui-parallel      For UI scaffolds, generate parallel tests (default: true). Use --no-ui-parallel for sequential.
    --force            If some Scout directories already exist, generate only the missing sections without prompting
  `,
    examples: `
    node scripts/scout.js generate --path x-pack/platform/plugins/shared/maps --type api
    node scripts/scout.js generate --path x-pack/platform/plugins/shared/maps --type ui --no-ui-parallel
    node scripts/scout.js generate --path x-pack/platform/plugins/shared/security --type both --scout-root scout_uiam_local --force
    node scripts/scout.js generate --path x-pack/solutions/security/plugins/security_solution --type ui --namespace detection_engine
  `,
  },
  run: async ({ flagsReader, log }) => {
    const positionals = flagsReader.getPositionals();

    const pathFromFlag = flagsReader.string('path');
    const pathFromPositional = positionals[0];
    if (pathFromFlag && pathFromPositional) {
      throw createFlagError(
        `Provide the path either as a positional argument or via --path, not both`
      );
    }

    const isNonInteractive = Boolean(pathFromFlag || pathFromPositional);

    let relativePath: string = '';

    if (isNonInteractive) {
      relativePath = (pathFromFlag ?? pathFromPositional)?.trim() ?? '';
      const validationResult = await validatePath(relativePath);
      if (validationResult !== true) {
        throw createFlagError(validationResult as string);
      }
    } else {
      while (true) {
        const pathResult = await inquirer.prompt<{ path: string }>({
          type: 'input',
          name: 'path',
          message:
            'What is the relative path to the plugin or package? (e.g., x-pack/platform/plugins/shared/maps):',
          validate: async (input) => {
            const result = await validatePath(input);
            if (result === true) {
              return true;
            }
            return result as string;
          },
        });

        relativePath = pathResult.path.trim();
        const validationResult = await validatePath(relativePath);
        if (validationResult === true) {
          break;
        } else {
          log.error(validationResult as string);
        }
      }
    }

    log.info(`Validated path: ${relativePath}`);

    const basePath = Path.resolve(REPO_ROOT, relativePath);
    const scoutRoot = normalizeScoutRoot(flagsReader.string('scout-root') ?? 'scout');
    const namespaceRaw = flagsReader.string('namespace');
    let namespace = namespaceRaw ? normalizeNamespace(namespaceRaw) : undefined;

    const scoutDir = Path.resolve(basePath, 'test', scoutRoot);

    // In interactive mode, detect existing namespaces and prompt the developer to
    // pick one (or name a new one) before hitting the mixing-guard hard error.
    if (!namespace && !isNonInteractive && (await pathExists(scoutDir))) {
      const existingNamespaces = await detectExistingNamespaces(scoutDir);
      if (existingNamespaces.length > 0) {
        const NEW_NAMESPACE_SENTINEL = '__new__';
        const { chosenNamespace } = await inquirer.prompt<{ chosenNamespace: string }>({
          type: 'list',
          name: 'chosenNamespace',
          message: `This plugin uses namespace-based Scout structure. Which namespace do you want to scaffold?`,
          choices: [
            ...existingNamespaces.map((ns) => ({ name: `${ns} (existing)`, value: ns })),
            { name: 'Create a new namespace (enter name below)', value: NEW_NAMESPACE_SENTINEL },
          ],
        });

        if (chosenNamespace === NEW_NAMESPACE_SENTINEL) {
          const { newNamespaceName } = await inquirer.prompt<{ newNamespaceName: string }>({
            type: 'input',
            name: 'newNamespaceName',
            message: 'New namespace name (lowercase letters, digits, underscores):',
            validate: (input: string) => {
              try {
                normalizeNamespace(input);
                return true;
              } catch (e) {
                return e instanceof Error ? e.message : 'Invalid namespace name';
              }
            },
          });
          namespace = normalizeNamespace(newNamespaceName);
        } else {
          namespace = chosenNamespace;
        }
        log.info(`Selected namespace: ${namespace}`);
      }
    }

    // Content root is scout/<namespace>/ when namespace is given, otherwise scout/ directly
    const contentDir = namespace ? Path.resolve(scoutDir, namespace) : scoutDir;
    const apiDir = Path.resolve(contentDir, 'api');
    const uiDir = Path.resolve(contentDir, 'ui');

    const contentDirLabel = namespace ? `test/${scoutRoot}/${namespace}` : `test/${scoutRoot}`;

    // Guard: a scout root must be either entirely root-level (test/<root>/{ui,api}/)
    // or entirely namespace-based (test/<root>/<namespace>/{ui,api}/), never both at once.
    if (await pathExists(scoutDir)) {
      if (namespace) {
        // Adding a namespace: fail if root-level category dirs already exist.
        const rootUi = await pathExists(Path.resolve(scoutDir, 'ui'));
        const rootApi = await pathExists(Path.resolve(scoutDir, 'api'));
        if (rootUi || rootApi) {
          const existing = [rootUi && 'ui', rootApi && 'api'].filter(Boolean).join(' and ');
          throw createFlagError(
            `Cannot add namespace '${namespace}' to '${relativePath}/test/${scoutRoot}' because root-level ` +
              `${existing} ${
                existing.includes(' and ')
                  ? 'directories already exist'
                  : 'directory already exists'
              }. ` +
              `A Scout root must use either root-level (test/${scoutRoot}/{ui,api}/) ` +
              `or namespace-based (test/${scoutRoot}/<namespace>/{ui,api}/) structure, not both. ` +
              `To use namespaces, first migrate the existing root-level tests into a namespace sub-directory.`
          );
        }
      } else {
        // Adding root-level categories: fail if any namespace sub-directory already exists.
        const entries = await Fsp.readdir(scoutDir, { withFileTypes: true }).catch(() => []);
        const RESERVED = new Set(['ui', 'api', '.meta', 'common']);
        for (const entry of entries) {
          if (!entry.isDirectory() || RESERVED.has(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          const namespaceUi = await pathExists(Path.resolve(scoutDir, entry.name, 'ui'));
          const namespaceApi = await pathExists(Path.resolve(scoutDir, entry.name, 'api'));
          if (namespaceUi || namespaceApi) {
            throw createFlagError(
              `Cannot add root-level tests to '${relativePath}/test/${scoutRoot}' because namespace ` +
                `'${entry.name}' already exists. ` +
                `A Scout root must use either root-level (test/${scoutRoot}/{ui,api}/) ` +
                `or namespace-based (test/${scoutRoot}/<namespace>/{ui,api}/) structure, not both. ` +
                `To use root-level tests, first remove or migrate the existing namespace directories.`
            );
          }
        }
      }
    }

    const scoutDirExists = await pathExists(scoutDir);
    const apiDirExists = await pathExists(apiDir);
    const uiDirExists = await pathExists(uiDir);

    if (apiDirExists && uiDirExists) {
      log.warning(
        `Both ${contentDirLabel}/api and ${contentDirLabel}/ui already exist. The generator will not modify existing sub-directories.`
      );
      return;
    }

    const force = flagsReader.boolean('force');
    if (scoutDirExists || apiDirExists || uiDirExists) {
      const existingDirs: string[] = [];
      if (apiDirExists) {
        existingDirs.push(`${contentDirLabel}/api`);
      }
      if (uiDirExists) {
        existingDirs.push(`${contentDirLabel}/ui`);
      }
      if (existingDirs.length === 0 && scoutDirExists) {
        existingDirs.push(contentDirLabel);
      }
      log.warning(
        `Existing Scout test directories found: ${existingDirs.join(
          ', '
        )}. The generator will not modify existing sub-directories.`
      );

      if (!force) {
        if (isNonInteractive) {
          throw createFlagError(
            `Rerun with --force to generate only the missing sections under ${contentDirLabel}/`
          );
        }

        const continueResult = await inquirer.prompt<{ proceed: boolean }>({
          type: 'list',
          name: 'proceed',
          message: 'Do you want to continue and generate only missing sections?',
          default: false,
          choices: [
            { name: 'No', value: false },
            { name: 'Yes', value: true },
          ],
        });

        if (!continueResult.proceed) {
          log.info('Aborted.');
          return;
        }
      }
    }

    const apiMissing = !apiDirExists;
    const uiMissing = !uiDirExists;

    if (!apiMissing && !uiMissing) {
      log.warning('All Scout test directories already exist. Nothing to generate.');
      return;
    }

    const requestedType = flagsReader.enum('type', TEST_TYPES) as TestType | undefined;

    let testType: TestType;
    if (requestedType) {
      if (requestedType === 'api' && !apiMissing) {
        throw createFlagError(
          `${contentDirLabel}/api already exists. The generator will not modify existing sub-directories.`
        );
      }
      if (requestedType === 'ui' && !uiMissing) {
        throw createFlagError(
          `${contentDirLabel}/ui already exists. The generator will not modify existing sub-directories.`
        );
      }
      testType = requestedType;
    } else if (isNonInteractive) {
      testType = apiMissing ? 'api' : 'ui';
    } else {
      const testTypeChoices: Array<{ name: string; value: TestType }> = [];
      if (apiMissing) {
        testTypeChoices.push({ name: 'API tests', value: 'api' });
      }
      if (uiMissing) {
        testTypeChoices.push({ name: 'UI tests', value: 'ui' });
      }
      if (apiMissing && uiMissing) {
        testTypeChoices.push({ name: 'Both API and UI tests', value: 'both' });
      }

      const testTypeResult = await inquirer.prompt<{ testType: TestType }>({
        type: 'list',
        name: 'testType',
        message: 'What type of tests do you plan to add?',
        default: apiMissing ? 'api' : 'ui',
        choices: testTypeChoices,
      });
      testType = testTypeResult.testType;
    }

    log.info(`Selected test type: ${testType}`);

    const shouldGenerateApi = apiMissing && (testType === 'api' || testType === 'both');
    const shouldGenerateUi = uiMissing && (testType === 'ui' || testType === 'both');

    let uiParallel = false;
    if (shouldGenerateUi) {
      if (isNonInteractive) {
        uiParallel = flagsReader.boolean('ui-parallel');
      } else {
        const parallelResult = await inquirer.prompt<{ parallel: boolean }>({
          type: 'list',
          name: 'parallel',
          message:
            'Is it possible to design UI tests to run in parallel against the same cluster (e.g., in isolated Kibana spaces)?',
          default: true,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
        });
        uiParallel = parallelResult.parallel;
      }
      log.info(`UI tests parallel: ${uiParallel}`);
    }

    log.info('Creating directory structure...');
    await createDirectoryStructure(relativePath, {
      scoutRoot,
      namespace,
      generateApi: shouldGenerateApi,
      generateUi: shouldGenerateUi,
      uiParallel,
    });

    log.success(
      `Successfully generated Scout test structure for ${Path.posix.join(
        relativePath.replace(/\\\\/g, '/'),
        contentDirLabel
      )}`
    );
    log.write('\n');

    await enableModuleInScoutCiConfig(relativePath, log);

    if (namespace) {
      log.write('\n');
      log.info(
        `Next step: update .github/CODEOWNERS if the new namespace has a dedicated feature team owner:\n` +
          `  ${relativePath}/test/${scoutRoot}/${namespace}/ @elastic/<team>\n`
      );
    }
  },
};
