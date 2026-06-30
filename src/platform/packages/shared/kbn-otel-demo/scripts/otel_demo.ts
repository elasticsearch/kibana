/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import chalk from 'chalk';
import { ensureOtelDemo, patchScenarios } from '../src/ensure_otel_demo';
import type { DemoType } from '../src/types';
import {
  listAvailableDemos,
  getDemoConfig,
  getDemoScenarios,
  getScenarioById,
  getDemoCodeScenarios,
  getCodeScenarioById,
} from '../src/demo_registry';

run(
  async ({ log, addCleanupTask, flags }) => {
    const demoType = (flags.demo as DemoType | undefined) || 'otel-demo';

    // Validate demo type
    const availableDemos = listAvailableDemos();
    if (!availableDemos.includes(demoType)) {
      throw new Error(
        `Unknown demo type: ${demoType}. Available: ${availableDemos.join(
          ', '
        )}\nUse --list-demos to see details.`
      );
    }

    const demoConfig = getDemoConfig(demoType);
    const demoScenarios = getDemoScenarios(demoType);
    const demoCodeScenarios = getDemoCodeScenarios(demoType);

    // Handle --list-demos
    if (flags['list-demos']) {
      log.info('Available demo environments:');
      log.info('');
      for (const type of availableDemos) {
        const config = getDemoConfig(type);
        log.info(`  ${type.padEnd(20)} - ${config.displayName}`);
        log.info(`    ${chalk.dim(config.description)}`);
        log.info(`    ${chalk.dim('Versions: ' + config.availableVersions.join(', '))}`);
        log.info('');
      }
      return Promise.resolve();
    }

    // Handle --list-scenarios
    if (flags['list-scenarios']) {
      log.info(`Failure scenarios for ${demoConfig.displayName}:`);
      log.info('');
      log.info('DRAMATIC (service-breaking):');
      demoScenarios
        .filter((s) => s.category === 'dramatic')
        .forEach((s) => {
          log.info(`  ${s.id.padEnd(35)} - ${s.name}`);
        });
      log.info('');
      log.info('SUBTLE (degraded performance/observability):');
      demoScenarios
        .filter((s) => s.category === 'subtle')
        .forEach((s) => {
          log.info(`  ${s.id.padEnd(35)} - ${s.name}`);
        });
      return Promise.resolve();
    }

    // Handle --list-code-scenarios
    if (flags['list-code-scenarios']) {
      if (demoCodeScenarios.length === 0) {
        log.info(`No code scenarios are available for ${demoConfig.displayName}.`);
        return Promise.resolve();
      }

      log.info(`Code scenarios for ${demoConfig.displayName}:`);
      log.info('');
      log.info('DRAMATIC (service-breaking):');
      demoCodeScenarios
        .filter((s) => s.category === 'dramatic')
        .forEach((s) => {
          log.info(`  ${s.id.padEnd(35)} - ${s.name}`);
          log.info(`    ${chalk.dim(s.description)}`);
        });
      log.info('');
      log.info('SUBTLE (degraded performance/observability):');
      demoCodeScenarios
        .filter((s) => s.category === 'subtle')
        .forEach((s) => {
          log.info(`  ${s.id.padEnd(35)} - ${s.name}`);
          log.info(`    ${chalk.dim(s.description)}`);
        });
      return Promise.resolve();
    }

    const controller = new AbortController();

    addCleanupTask(() => {
      controller.abort();
    });

    const configPath = flags.config ? String(flags.config) : undefined;
    const logsIndex = flags['logs-index'] ? String(flags['logs-index']) : 'logs.otel';
    const version = flags.version ? String(flags.version) : undefined;
    const teardown = Boolean(flags.teardown);
    const patch = Boolean(flags.patch);
    const reset = Boolean(flags.reset);
    const forceRebuildImages = Boolean(flags['rebuild-images']);
    const useVanillaCollector = Boolean(flags.vanilla);
    const codeScenarioId = flags['code-scenario'] ? String(flags['code-scenario']) : undefined;

    // Parse scenario flags
    const scenarioIds: string[] = [];
    if (flags.scenario) {
      const scenarios = Array.isArray(flags.scenario) ? flags.scenario : [flags.scenario];
      for (const id of scenarios) {
        const scenario = getScenarioById(demoType, String(id));
        if (!scenario) {
          throw new Error(
            `Unknown scenario: ${id}. Use --list-scenarios to see available scenarios for ${demoType}.`
          );
        }
        scenarioIds.push(String(id));
      }
    }

    if (codeScenarioId && !getCodeScenarioById(demoType, codeScenarioId)) {
      throw new Error(
        `Unknown code scenario: ${codeScenarioId}. Use --list-code-scenarios to see available code scenarios for ${demoType}.`
      );
    }

    // Handle --patch or --reset (apply/remove scenarios on running cluster)
    if (patch || reset) {
      return patchScenarios({
        log,
        demoType,
        scenarioIds: reset ? [] : scenarioIds,
        codeScenarioId: reset ? undefined : codeScenarioId,
        configPath,
        version,
        reset,
      }).catch((error) => {
        throw new Error('Failed to patch scenarios', { cause: error });
      });
    }

    return ensureOtelDemo({
      log,
      signal: controller.signal,
      demoType,
      configPath,
      logsIndex,
      version,
      teardown,
      scenarioIds,
      codeScenarioId,
      forceRebuildImages,
      useVanillaCollector,
    }).catch((error) => {
      throw new Error(`Failed to manage ${demoConfig.displayName}`, { cause: error });
    });
  },
  {
    description: `
      Deploy demo microservices applications to Kubernetes (minikube) with logs
      automatically collected and sent to Elasticsearch via OpenTelemetry Collector.
      
      Supports multiple demo environments:
        - otel-demo: OpenTelemetry Demo (default)
        - online-boutique: Google Online Boutique
        - bank-of-anthos: Google Bank of Anthos
        - quarkus-super-heroes: Quarkus Super Heroes
        - aws-retail-store: AWS Retail Store Sample
        - rust-k8s-demo: Rust K8s Demo
      
      Reads Elasticsearch connection details from kibana.dev.yml and supports
      failure scenario injection for testing observability.
    `,
    flags: {
      string: ['config', 'logs-index', 'scenario', 'demo', 'version', 'code-scenario'],
      boolean: [
        'teardown',
        'list-demos',
        'list-scenarios',
        'list-code-scenarios',
        'patch',
        'reset',
        'rebuild-images',
        'vanilla',
      ],
      alias: {
        c: 'config',
        s: 'scenario',
        p: 'patch',
        r: 'reset',
        d: 'demo',
        v: 'version',
      },
      default: {
        demo: 'otel-demo',
        'logs-index': 'logs.otel',
      },
      help: `
        --demo, -d         Demo environment to run (otel-demo, online-boutique, bank-of-anthos, etc.)
        --version, -v      Demo version (defaults to demo's defaultVersion)
        --config, -c       Path to Kibana config file (defaults to config/kibana.dev.yml)
        --logs-index       Index name for logs (defaults to "logs.otel")
        --list-demos       List all available demo environments
        --list-scenarios   List failure scenarios for selected demo
        --list-code-scenarios
                           List code scenarios for selected demo
        --scenario, -s     Apply a failure scenario (can be repeated)
        --code-scenario    Apply a code scenario (otel-demo only)
        --patch, -p        Patch scenarios onto running cluster (works with --scenario)
        --reset, -r        Reset all scenarios to defaults
        --teardown         Stop and remove demo deployment
        --rebuild-images   Force rebuild of custom images (for demos that require building from source)
        --vanilla          Use vanilla otel-collector-contrib instead of EDOT Collector (default is EDOT)
      `,
    },
  }
);
