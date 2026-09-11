/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import SimpleGit from 'simple-git';

import { run } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import * as Eslint from './eslint';
import * as Oxlint from './oxlint';
import * as Stylelint from './stylelint';
import { extname } from 'path';

import { getFilesForCommit, runFileCasingCheck } from './precommit_hook';
import { checkSemverRanges } from './no_pkg_semver_ranges';
import { parseAllDocuments as yamlParseAllDocuments } from 'yaml';
import { readFile } from 'fs/promises';

class CheckResult {
  constructor(checkName) {
    this.checkName = checkName;
    this.errors = [];
    this.succeeded = true;
  }

  addError(error) {
    this.succeeded = false;
    this.errors.push(error);
  }

  toString() {
    if (this.succeeded) {
      return `✓ ${this.checkName}: Passed`;
    } else {
      return [`✗ ${this.checkName}: Failed`, ...this.errors.map((err) => `  - ${err}`)].join('\n');
    }
  }
}

class PrecommitCheck {
  constructor(name) {
    this.name = name;
  }

  async execute() {
    throw new Error('execute() must be implemented by check class');
  }

  async runSafely(log, files, options) {
    const result = new CheckResult(this.name);
    try {
      await this.execute(log, files, options);
    } catch (error) {
      if (error.errors) {
        error.errors.forEach((err) => result.addError(err.message || err.toString()));
      } else {
        result.addError(error.message || error.toString());
      }
    }
    return result;
  }
}

class FileCasingCheck extends PrecommitCheck {
  constructor() {
    super('File Casing');
  }

  async execute(log, files) {
    await runFileCasingCheck(log, files);
  }
}

class LinterCheck extends PrecommitCheck {
  constructor(name, linter) {
    super(name);
    this.linter = linter;
  }

  async execute(log, files, options) {
    const filesToLint = await this.linter.pickFilesToLint(log, files);
    if (filesToLint.length > 0) {
      const result = await this.linter.lintFiles(log, filesToLint, {
        fix: options.fix,
      });

      if (result?.failedFiles?.length > 0) {
        throw new Error(`${this.name} errors in ${result.failedFiles.length} file(s)`);
      }

      if (options.fix && options.stage) {
        const simpleGit = new SimpleGit(REPO_ROOT);
        await simpleGit.add(filesToLint);
      }
    }
  }
}

class YamlLintCheck extends PrecommitCheck {
  constructor() {
    super('YAML Lint');
  }

  isYamlFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    return ext === '.yml' || ext === '.yaml';
  }

  async execute(log, files) {
    const yamlFiles = files.filter((file) => this.isYamlFile(file.getRelativePath()));

    if (yamlFiles.length === 0) {
      log.verbose('No YAML files to check');
      return;
    }

    log.verbose(`Checking ${yamlFiles.length} YAML files for syntax errors`);

    const errors = [];
    for (const file of yamlFiles) {
      try {
        const content = await readFile(file.getAbsolutePath(), 'utf8');
        const docs = yamlParseAllDocuments(content);
        const parseErrors = docs.flatMap((doc) => doc.errors);
        if (parseErrors.length > 0) {
          throw new Error(parseErrors.map((e) => e.message).join('\n'));
        }
      } catch (error) {
        errors.push(`Error in ${file.getRelativePath()}:\n${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n\n'));
    }
  }
}

class SemverRangesCheck extends PrecommitCheck {
  constructor() {
    super('Semver Ranges');
  }

  async execute(log, files, options) {
    log.verbose('Checking for semver ranges in package.json');

    try {
      const result = checkSemverRanges({ fix: options.fix });
      if (result.totalFixes > 0) {
        log.info(`Fixed ${result.totalFixes} semver ranges in package.json`);
      }
    } catch (error) {
      throw error;
    }
  }
}

// oxlint and ESLint both autofix the same JS/TS files, so oxlint runs alone before the
// parallel checks (matching the CI order in .buildkite/scripts/steps/lint.sh).
const OXLINT_CHECK = new LinterCheck('oxlint', Oxlint);

const PRECOMMIT_CHECKS = [
  new FileCasingCheck(),
  new LinterCheck('ESLint', Eslint),
  new LinterCheck('StyleLint', Stylelint),
  new YamlLintCheck(),
  new SemverRangesCheck(),
];

async function runTimed(check, log, files, options) {
  const startTime = Date.now();
  const result = await check.runSafely(log, files, options);
  log.verbose(`${check.name} completed in ${Date.now() - startTime}ms`);
  return result;
}

run(
  async ({ log, flags }) => {
    process.env.IS_KIBANA_PRECOMIT_HOOK = 'true';

    const files = await getFilesForCommit(flags.ref, {
      includeUntracked: Boolean(flags['include-untracked']),
    });

    const maxFilesCount = flags['max-files']
      ? Number.parseInt(String(flags['max-files']), 10)
      : undefined;
    if (maxFilesCount !== undefined && (!Number.isFinite(maxFilesCount) || maxFilesCount < 1)) {
      throw createFlagError('expected --max-files to be a number greater than 0');
    }

    if (maxFilesCount && files.length > maxFilesCount) {
      log.warning(
        `--max-files is set to ${maxFilesCount} and ${files.length} were discovered. The current script execution will be skipped.`
      );
      return;
    }

    log.verbose('Running pre-commit checks...');
    const options = { fix: flags.fix, stage: flags.stage };
    const oxlintResult = await runTimed(OXLINT_CHECK, log, files, options);
    const results = [
      oxlintResult,
      ...(await Promise.all(PRECOMMIT_CHECKS.map((check) => runTimed(check, log, files, options)))),
    ];

    const failedChecks = results.filter((result) => !result.succeeded);

    if (failedChecks.length > 0) {
      const errorReport = [
        '\nPre-commit checks failed:',
        ...results.map((result) => result.toString()),
        '\nPlease fix the above issues before committing.',
      ].join('\n');

      throw new Error(errorReport);
    }

    log.success('All pre-commit checks passed!');
  },
  {
    description: `
    Run checks on files that are staged for commit by default
  `,
    flags: {
      boolean: ['fix', 'stage', 'include-untracked'],
      string: ['max-files', 'ref'],
      default: {
        fix: false,
        stage: true,
        'include-untracked': false,
      },
      help: `
        --fix              Execute checks with possible fixes
        --max-files        Max files number to check against. If exceeded the script will skip the execution
        --ref              Run checks against any git ref files (example HEAD or <commit_sha>) instead of running against staged ones
        --include-untracked Include untracked files in addition to diff files
        --no-stage         By default when using --fix the changes are staged, use --no-stage to disable that behavior
      `,
    },
  }
);
