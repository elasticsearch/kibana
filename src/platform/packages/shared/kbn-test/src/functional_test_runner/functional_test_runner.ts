/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { writeFileSync, mkdirSync } from 'fs';
import Path, { dirname } from 'path';
import type { ToolingLog } from '@kbn/tooling-log';
import { REPO_ROOT } from '@kbn/repo-info';
import type { Suite, Test } from './fake_mocha_types';
import type { Providers } from './lib';
import {
  Config,
  Lifecycle,
  ProviderCollection,
  readProviderSpec,
  setupMocha,
  runTests,
  DockerServersService,
  SuiteTracker,
  EsVersion,
  DedicatedTaskRunner,
  ftrTimingRegistry,
  ftrTimingEnabled,
  activateTiming,
} from './lib';
import { createEsClientForFtrConfig } from '../ftr_es_client';

interface FunctionalTestRunnerRunResult {
  failureCount: number;
  failedTestFiles: string[];
}

export class FunctionalTestRunner {
  private readonly esVersion: EsVersion;
  constructor(
    private readonly log: ToolingLog,
    private readonly config: Config,
    esVersion?: string | EsVersion
  ) {
    this.esVersion =
      esVersion === undefined
        ? EsVersion.getDefault()
        : esVersion instanceof EsVersion
        ? esVersion
        : new EsVersion(esVersion);
  }

  async run(abortSignal?: AbortSignal, retry = 0) {
    let result = await this.runWithResult(abortSignal);

    for (let attempt = 1; attempt <= retry; attempt++) {
      if (result.failureCount === 0 || result.failedTestFiles.length === 0) {
        break;
      }

      // eslint-disable-next-line no-console
      console.log(
        `\nRetrying failed test files (${attempt}/${retry}):\n` +
          result.failedTestFiles.map((file) => `- ${file}`).join('\n')
      );

      const retryConfig = this.createRetryConfig(result.failedTestFiles);
      const retryRunner = new FunctionalTestRunner(this.log, retryConfig, this.esVersion);
      result = await retryRunner.runWithResult(abortSignal);
    }

    return result.failureCount;
  }

  private async runWithResult(abortSignal?: AbortSignal): Promise<FunctionalTestRunnerRunResult> {
    const testStats = await this.getTestStats();
    const realServices =
      !testStats || (testStats.testCount > 0 && testStats.nonSkippedTestCount > 0);

    return await this.runHarness({ realServices }, async (lifecycle, coreProviders) => {
      SuiteTracker.startTracking(lifecycle, this.config.path);

      const providers = realServices
        ? new ProviderCollection(this.log, [
            ...coreProviders,
            ...readProviderSpec('Service', this.config.get('services')),
            ...readProviderSpec('PageObject', this.config.get('pageObjects')),
          ])
        : this.getStubProviderCollection(coreProviders);

      if (realServices) {
        // Skip ES version validation for serverless project
        if (!this.config.get('serverless') && providers.hasService('es')) {
          await this.validateEsVersion();
        }
        await providers.loadAll();

        if (ftrTimingEnabled) {
          const jobId = process.env.BUILDKITE_JOB_ID ?? `local-${Date.now()}`;
          const timingFile = Path.resolve(
            REPO_ROOT,
            `target/test-metrics/ftr-service-timing-${jobId}.ndjson`
          );
          lifecycle.cleanup.add(() => {
            ftrTimingRegistry.writeToFile(timingFile);
          });
        }
      }

      const customTestRunner = this.config.get('testRunner');
      if (customTestRunner) {
        this.log.warning(
          'custom test runner defined, ignoring all mocha/suite/filtering related options'
        );
        return {
          failureCount: (await providers.invokeProviderFn(customTestRunner)) || 0,
          failedTestFiles: [],
        };
      }

      let reporter;
      let reporterOptions;
      if (this.config.get('mochaOpts.dryRun')) {
        // override default reporter for dryRun results
        const targetFile = Path.resolve(REPO_ROOT, 'target/functional-tests/dryRunOutput.json');
        reporter = 'json';
        reporterOptions = {
          output: targetFile,
        };
        this.log.info(`Dry run results will be stored in ${targetFile}`);
      }

      const mocha = await setupMocha({
        lifecycle,
        log: this.log,
        config: this.config,
        providers,
        // Skipping root hooks when there are no tests to execute
        skipRootHooks: !realServices,
        esVersion: this.esVersion,
        reporter,
        reporterOptions,
      });

      // there's a bug in mocha's dry run, see https://github.com/mochajs/mocha/issues/4838
      // until we can update to a mocha version where this is fixed, we won't actually
      // execute the mocha dry run but simulate it by reading the suites and tests of
      // the mocha object and writing a report file with similar structure to the json report
      // (just leave out some execution details like timing, retry and erros)
      if (this.config.get('mochaOpts.dryRun')) {
        return {
          failureCount: this.simulateMochaDryRun(mocha),
          failedTestFiles: [],
        };
      }

      if (abortSignal?.aborted) {
        this.log.warning('run aborted');
        return {
          failureCount: 0,
          failedTestFiles: [],
        };
      }

      if (realServices) {
        await lifecycle.beforeTests.trigger(mocha.suite);
        if (abortSignal?.aborted) {
          this.log.warning('run aborted');
          return {
            failureCount: 0,
            failedTestFiles: [],
          };
        }
      }

      this.log.info('Starting tests');
      if (ftrTimingEnabled) {
        activateTiming();
      }
      return await runTests(lifecycle, mocha, abortSignal);
    });
  }

  private createRetryConfig(failedTestFiles: string[]) {
    const settings = this.config.getAll();

    return new Config({
      settings: {
        ...settings,
        suiteFiles: {
          ...settings.suiteFiles,
          include: failedTestFiles,
        },
      },
      path: this.config.path,
      module: this.config.module,
    });
  }

  private async validateEsVersion() {
    const es = createEsClientForFtrConfig(this.config);

    let esInfo;
    try {
      esInfo = await es.info();
    } catch (error) {
      const isStandaloneRunner = process.argv[1]?.includes('functional_test_runner');
      const hint = isStandaloneRunner
        ? `You are running the standalone functional test runner which requires ` +
          `Elasticsearch and Kibana to already be running.\n\n` +
          `To start the test servers, run in a separate terminal:\n\n` +
          `  yarn test:ftr:server --config <your-config-file>\n\n` +
          `Or use the following command to start Elasticsearch and Kibana automatically:\n\n` +
          `  yarn test:ftr --config <your-config-file>`
        : `Ensure Elasticsearch is running and accessible.`;

      throw new Error(
        `Unable to reach Elasticsearch to fetch version info.\n\n${hint}\n\nOriginal error: ${error.message}`
      );
    } finally {
      try {
        await es.close();
      } catch {
        // noop
      }
    }

    if (!this.esVersion.eql(esInfo.version.number)) {
      throw new Error(
        `ES reports a version number "${
          esInfo.version.number
        }" which doesn't match supplied es version "${this.esVersion.toString()}"`
      );
    }
  }

  async getTestStats() {
    return await this.runHarness({ realServices: false }, async (lifecycle, coreProviders) => {
      if (this.config.get('testRunner')) {
        return;
      }

      const providers = this.getStubProviderCollection(coreProviders);
      const mocha = await setupMocha({
        lifecycle,
        log: this.log,
        config: this.config,
        providers,
        skipRootHooks: true,
        esVersion: this.esVersion,
        reporter: 'base',
      });

      // Run Mocha in dry-run mode to let its native filtering (grep, tags, etc.) determine
      // which tests would execute, and capture the resulting execution/pending counts.
      const statsFromDryRun = await new Promise<{
        suites: number;
        tests: number;
        passes: number;
        pending: number;
        failures: number;
      }>((resolve) => {
        const runner = mocha.dryRun(true).run(() => {
          resolve(runner.stats);
        });
      });

      const stats = {
        testCount: statsFromDryRun.tests,
        nonSkippedTestCount: statsFromDryRun.tests - statsFromDryRun.pending,
        testsExcludedByTag: mocha.testsExcludedByTag.map((t: Test) => t.fullTitle()),
      };

      return stats;
    });
  }

  private getStubProviderCollection(coreProviders: Providers) {
    // when we want to load the tests but not actually run anything we can
    // use stubbed providers which allow mocha to do it's thing without taking
    // too much time
    const readStubbedProviderSpec = (type: string, providers: any, skip: string[]) =>
      readProviderSpec(type, providers).map((p) => ({
        ...p,
        fn: skip.includes(p.name)
          ? (ctx: any) => {
              const result = ProviderCollection.callProviderFn(p.fn, ctx);

              if ('then' in result) {
                throw new Error(
                  `Provider [${p.name}] returns a promise so it can't loaded during test analysis`
                );
              }

              return result;
            }
          : () => ({
              then: () => {},
            }),
      }));

    return new ProviderCollection(this.log, [
      ...coreProviders,
      ...readStubbedProviderSpec(
        'Service',
        this.config.get('services'),
        this.config.get('servicesRequiredForTestAnalysis')
      ),
      ...readStubbedProviderSpec('PageObject', this.config.get('pageObjects'), []),
    ]);
  }

  private async runHarness<T = any>(
    {
      realServices,
    }: {
      realServices: boolean;
    },
    handler: (lifecycle: Lifecycle, coreProviders: Providers) => Promise<T>
  ): Promise<T> {
    let runErrorOccurred = false;
    const lifecycle = new Lifecycle(this.log);

    try {
      if (
        this.config.module.type !== 'journey' &&
        (!this.config.get('testFiles') || this.config.get('testFiles').length === 0) &&
        !this.config.get('testRunner')
      ) {
        throw new Error('No tests defined.');
      }

      const dockerServers = new DockerServersService(
        this.config.get('dockerServers'),
        this.log,
        lifecycle,
        !realServices
      );

      // base level services that functional_test_runner exposes
      const coreProviders = readProviderSpec('Service', {
        lifecycle: () => lifecycle,
        log: () => this.log,
        config: () => this.config,
        dockerServers: () => dockerServers,
        esVersion: () => this.esVersion,
        dedicatedTaskRunner: () => new DedicatedTaskRunner(this.config, this.log),
      });

      return await handler(lifecycle, coreProviders);
    } catch (runError) {
      runErrorOccurred = true;
      throw runError;
    } finally {
      try {
        await lifecycle.cleanup.trigger();
      } catch (closeError) {
        if (runErrorOccurred) {
          this.log.error('failed to close functional_test_runner');
          this.log.error(closeError);
        } else {
          // eslint-disable-next-line no-unsafe-finally
          throw closeError;
        }
      }
    }
  }

  simulateMochaDryRun(mocha: any) {
    interface TestEntry {
      file: string;
      title: string;
      fullTitle: string;
    }

    const getFullTitle = (node: Test | Suite): string => {
      const parentTitle = node.parent && getFullTitle(node.parent);
      return parentTitle ? `${parentTitle} ${node.title}` : node.title;
    };

    let suiteCount = 0;
    const passes: TestEntry[] = [];
    const pending: TestEntry[] = [];

    const collectTests = (suite: Suite) => {
      for (const subSuite of suite.suites) {
        suiteCount++;
        for (const test of subSuite.tests) {
          const testEntry = {
            title: test.title,
            fullTitle: getFullTitle(test),
            file: test.file || '',
          };
          if (test.pending) {
            pending.push(testEntry);
          } else {
            passes.push(testEntry);
          }
        }
        collectTests(subSuite);
      }
    };

    collectTests(mocha.suite);

    const reportData = {
      stats: {
        suites: suiteCount,
        tests: passes.length + pending.length,
        passes: passes.length,
        pending: pending.length,
        failures: 0,
      },
      tests: [...passes, ...pending],
      passes,
      pending,
      failures: [],
    };

    const reportPath = mocha.options.reporterOptions.output;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');

    return 0;
  }
}
