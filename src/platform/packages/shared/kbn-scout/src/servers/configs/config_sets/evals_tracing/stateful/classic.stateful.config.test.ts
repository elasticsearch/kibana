/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "Elastic License 2.0, Server Side Public License v 1", and the
 * "Server Side Public License v 1" ("SSPL") - as separate files with distinct
 * license terms. Your choice of license determines the rights and obligations
 * associated with the software. See the LICENSE.txt file in the project root
 * for the applicable license terms.
 */

/**
 * Agent Builder's span processor strips `gen_ai.tool.call.arguments` and
 * `gen_ai.tool.call.result` from every tool span unless
 * `agentBuilder:tracing:includeToolDetails` is enabled -- it defaults to false
 * for privacy in production.
 *
 * Trace-based evaluators match on those arguments (SkillInvoked looks for the
 * skill name inside them). Without the setting the attribute is simply absent,
 * so the evaluator scores 0 for EVERY model and the result reads as a model
 * failure rather than a missing attribute.
 *
 * This is exactly what happened on the Azure sweep VMs: 8,339 load_skill spans
 * with 0 arguments, while Buildkite CI (which boots through this config set)
 * had 3,953/3,953 populated. The bug is invisible in the scores -- it looks
 * like the models stopped invoking skills.
 */
describe('evals_tracing config set', () => {
  const ENV_KEYS = ['CI', 'TRACING_EXPORTERS'] as const;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
  });

  const loadServerArgs = (): string[] => {
    let servers: { kbnTestServer: { serverArgs: string[] } };
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      servers = require('./classic.stateful.config').servers;
    });
    // @ts-expect-error assigned inside isolateModules
    return servers.kbnTestServer.serverArgs;
  };

  const TOOL_DETAILS_ARG = '--uiSettings.overrides.agentBuilder:tracing:includeToolDetails=true';
  const TRACING_ARG = '--telemetry.tracing.enabled=true';

  // The config gates these args on `Boolean(TRACING_EXPORTERS) || !CI`, so the
  // exporter case is the one that must hold ON CI -- where `!isCi` is false and
  // an unset exporter would silently drop both args.
  describe('on CI, with exporters configured', () => {
    let serverArgs: string[];

    beforeEach(() => {
      process.env.CI = 'true';
      process.env.TRACING_EXPORTERS = JSON.stringify([{ type: 'console' }]);
      serverArgs = loadServerArgs();
    });

    it('captures tool call arguments so trace-based evaluators can match on them', () => {
      expect(serverArgs).toContain(TOOL_DETAILS_ARG);
    });

    it('enables tracing itself, so the tool-details setting is not dead config', () => {
      expect(serverArgs).toContain(TRACING_ARG);
    });
  });

  describe('off CI, without exporters', () => {
    let serverArgs: string[];

    beforeEach(() => {
      delete process.env.CI;
      delete process.env.TRACING_EXPORTERS;
      serverArgs = loadServerArgs();
    });

    it('still captures tool call arguments for local eval runs', () => {
      expect(serverArgs).toContain(TOOL_DETAILS_ARG);
      expect(serverArgs).toContain(TRACING_ARG);
    });
  });

  // The regression case: on CI with no exporters configured, `shouldEnableTracing`
  // is false. The tool-details setting used to live inside that block, so it
  // silently disappeared here -- SkillInvoked then scores 0 for every model and
  // reads as model failure. It must hold regardless of whether tracing is on.
  describe('on CI, without exporters', () => {
    let serverArgs: string[];

    beforeEach(() => {
      process.env.CI = 'true';
      delete process.env.TRACING_EXPORTERS;
      serverArgs = loadServerArgs();
    });

    it('still captures tool call arguments when tracing is disabled', () => {
      expect(serverArgs).toContain(TOOL_DETAILS_ARG);
    });

    it('does not enable tracing in this configuration', () => {
      expect(serverArgs).not.toContain(TRACING_ARG);
    });
  });
});
