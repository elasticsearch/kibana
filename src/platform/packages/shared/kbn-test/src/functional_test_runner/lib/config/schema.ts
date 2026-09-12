/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dirname, resolve } from 'path';

import Joi from 'joi';
import type { CustomHelpers } from 'joi';
import { SCOUT_REPORTER_ENABLED, ScoutTestRunConfigCategory } from '@kbn/scout-info';

// valid pattern for ID
// enforced camel-case identifiers for consistency
const ID_PATTERN = /^[a-zA-Z0-9_]+$/;
// it will search both --inspect and --inspect-brk
const INSPECTING = !!process.execArgv.find((arg) => arg.includes('--inspect'));

const maybeRequireKeys = (keys: string[], schemas: Record<string, Joi.Schema>) => {
  if (!keys.length) {
    return schemas;
  }

  const withRequires: Record<string, Joi.Schema> = {};
  for (const [key, schema] of Object.entries(schemas)) {
    withRequires[key] = keys.includes(key) ? schema.required() : schema;
  }
  return withRequires;
};

const urlPartsSchema = ({ requiredKeys }: { requiredKeys?: string[] } = {}) =>
  Joi.object()
    .keys(
      maybeRequireKeys(requiredKeys ?? [], {
        protocol: Joi.string().valid('http', 'https').default('http'),
        hostname: Joi.string().hostname().default('localhost'),
        port: Joi.number(),
        auth: Joi.string().regex(/^[^:]+:.+$/, 'username and password separated by a colon'),
        username: Joi.string(),
        password: Joi.string(),
        pathname: Joi.string().regex(/^\//, 'start with a /'),
        hash: Joi.string().regex(/^\//, 'start with a /'),
        certificateAuthorities: Joi.array().items(Joi.binary()).optional(),
      })
    )
    .default();

const appUrlPartsSchema = () =>
  Joi.object()
    .keys({
      pathname: Joi.string().regex(/^\//, 'start with a /'),
      hash: Joi.string().regex(/^\//, 'start with a /'),
    })
    .default();

const requiredWhenEnabled = (schema: Joi.Schema) => {
  return Joi.when('enabled', {
    is: true,
    then: schema.required(),
    otherwise: schema.optional(),
  });
};

const dockerServerSchema = () =>
  Joi.object()
    .keys({
      enabled: Joi.boolean().required(),
      image: requiredWhenEnabled(Joi.string()),
      port: requiredWhenEnabled(Joi.number()),
      portInContainer: requiredWhenEnabled(Joi.number()),
      preferCached: Joi.boolean().optional(),
      waitForLogLine: Joi.alternatives(Joi.object().instance(RegExp), Joi.string()).optional(),
      waitForLogLineTimeoutMs: Joi.number().integer().optional(),
      waitFor: Joi.func().optional(),
      args: Joi.array().items(Joi.string()).optional(),
    })
    .default();

const defaultRelativeToConfigPath = (path: string) => {
  const makeDefault = (parent: any, helpers: CustomHelpers) => {
    helpers.schema.description(`<config.js directory>/${path}`);
    return resolve(dirname(helpers.prefs.context!.path), path);
  };
  return makeDefault;
};

export const schema = Joi.object()
  .keys({
    rootTags: Joi.array().items(Joi.string()),
    testFiles: Joi.array().items(Joi.string()),
    testRunner: Joi.func(),
    serverless: Joi.boolean().default(false),
    testConfigCategory: Joi.string()
      .valid(...Object.values(ScoutTestRunConfigCategory))
      .default(ScoutTestRunConfigCategory.UNKNOWN),

    suiteFiles: Joi.object()
      .keys({
        include: Joi.array().items(Joi.string()).default([]),
        exclude: Joi.array().items(Joi.string()).default([]),
      })
      .default(),

    suiteTags: Joi.object()
      .keys({
        include: Joi.array().items(Joi.string()).default([]),
        exclude: Joi.array().items(Joi.string()).default([]),
      })
      .default(),

    servicesRequiredForTestAnalysis: Joi.array().items(Joi.string()).default([]),
    services: Joi.object().pattern(ID_PATTERN, Joi.func().required()).default(),

    pageObjects: Joi.object().pattern(ID_PATTERN, Joi.func().required()).default(),

    timeouts: Joi.object()
      .keys({
        find: Joi.number().default(10000),
        try: Joi.number().default(120000),
        waitFor: Joi.number().default(20000),
        esRequestTimeout: Joi.number().default(30000),

        // Deadline for a single HTTP request made through the FTR supertest wrappers. Without
        // one, a request that stalls (rather than being refused) hangs until the enclosing
        // mocha timeout fires, at which point the FTR aborts the whole config -- so a single
        // stalled request is reported as every remaining test in the suite failing.
        //
        // 0 disables it, which is the default: how long a single legitimate request takes
        // varies enormously between suites (some deliberately budget minutes for ML jobs or
        // agent inference), so a global ceiling would be guesswork. Opt in per FTR config:
        //
        //   timeouts: { request: 30_000 },
        //
        // and keep the value comfortably below that config's mocha timeouts so a stall
        // surfaces as a request error rather than a suite-wide abort.
        request: Joi.number().default(0),

        kibanaReportCompletion: Joi.number().default(60_000),
        kibanaStabilize: Joi.number().default(15000),
        navigateStatusPageCheck: Joi.number().default(250),

        // Many of our tests use the `exists` functions to determine where the user is. For
        // example, you'll see a lot of code like:
        // if (!testSubjects.exists('someElementOnPageA')) {
        //   navigateToPageA();
        // }
        // If the element doesn't exist, selenium would wait up to defaultFindTimeout for it to
        // appear. Because there are many times when we expect it to not be there, we don't want
        // to wait the full amount of time, or it would greatly slow our tests down. We used to have
        // this value at 1 second, but this caused flakiness because sometimes the element was deemed missing
        // only because the page hadn't finished loading. The value was then raised to 2.5 seconds to
        // address that flakiness. 1.5 seconds is the current compromise: each call that returns false
        // (element not present) waits at most this long, keeping test suites faster while still
        // tolerating reasonable page-load latency.
        // The best path forward is to prefer functions like `testSubjects.existOrFail` or
        // `testSubjects.missingOrFail` instead of just the `exists` checks, and be deterministic about
        // where your user is and what they should click next.
        waitForExists: Joi.number().default(1500),
      })
      .default(),

    mochaOpts: Joi.object()
      .keys({
        bail: Joi.boolean().default(false),
        dryRun: Joi.boolean().default(false),
        grep: Joi.string(),
        invert: Joi.boolean().default(false),
        slow: Joi.number().default(30000),
        timeout: Joi.number().default(INSPECTING ? 360000 * 100 : 360000),
        // Timeout for hooks (before/beforeEach/after/afterEach + FTR lifecycle triggers)
        // Overridable per-config or inside a hook body via this.timeout().
        hookTimeout: Joi.number().default(INSPECTING ? 360000 * 100 : 120_000),
        // Abort the whole config run on the first Mocha timeout (test or hook) instead of
        // running remaining tests and waiting out the full teardown cascade.
        abortOnTimeout: Joi.boolean().default(true),
        // Bound on final cleanup (service/lifecycle teardown) once aborting, so a hung
        // handler (e.g. a WebDriver call against a dead browser/session) can't stall
        // reclaiming the CI agent.
        abortCleanupTimeout: Joi.number().default(20_000),
        ui: Joi.string().default('bdd'),
        // Currently supporting beforeAll and afterAll.
        rootHooks: Joi.object()
          .keys({
            beforeAll: Joi.function().optional(),
            afterAll: Joi.function().optional(),
          })
          .optional(),
      })
      .default(),

    updateBaselines: Joi.boolean().default(false),
    updateSnapshots: Joi.boolean().default(false),
    browser: Joi.object()
      .keys({
        type: Joi.string().valid('chrome', 'firefox', 'msedge').default('chrome'),

        logPollingMs: Joi.number().default(100),
        acceptInsecureCerts: Joi.boolean().default(false),
      })
      .default(),

    junit: Joi.object()
      .keys({
        enabled: Joi.boolean().default(!!process.env.CI && !process.env.DISABLE_JUNIT_REPORTER),
        reportName: Joi.string(),
        metadata: Joi.object().unknown(true).default(),
      })
      .default(),

    mochaReporter: Joi.object()
      .keys({
        captureLogOutput: Joi.boolean().default(
          !!process.env.CI && !process.env.DISABLE_CI_LOG_OUTPUT_CAPTURE
        ),
        sendToCiStats: Joi.boolean().default(!!process.env.CI),
      })
      .default(),

    scoutReporter: Joi.object()
      .keys({
        enabled: Joi.boolean().default(SCOUT_REPORTER_ENABLED),
      })
      .default(),

    users: Joi.object().pattern(
      ID_PATTERN,
      Joi.object()
        .keys({
          username: Joi.string().required(),
          password: Joi.string().required(),
        })
        .required()
    ),

    servers: Joi.object()
      .keys({
        kibana: urlPartsSchema(),
        elasticsearch: urlPartsSchema({
          requiredKeys: ['port'],
        }),
        fleetserver: urlPartsSchema(),
      })
      .default(),

    esTestCluster: Joi.object()
      .keys({
        license: Joi.valid('basic', 'trial', 'gold').default('basic'),
        from: Joi.string().default('snapshot'),
        serverArgs: Joi.array().items(Joi.string()).default([]),
        esJavaOpts: Joi.string(),
        dataArchive: Joi.string(),
        ssl: Joi.boolean().default(false),
        ccs: Joi.object().keys({
          remoteClusterUrl: Joi.string().uri({
            scheme: /https?/,
          }),
        }),
        files: Joi.array().items(Joi.string()),
        secureFiles: Joi.array().items(Joi.string()),
      })
      .default(),

    esServerlessOptions: Joi.object()
      .keys({
        host: Joi.string().ip(),
        resources: Joi.array().items(Joi.string()).default([]),
        uiam: Joi.boolean().default(false),
      })
      .default(),

    kbnTestServer: Joi.object()
      .keys({
        buildArgs: Joi.array(),
        sourceArgs: Joi.array(),
        serverArgs: Joi.array(),
        installDir: Joi.string(),
        useDedicatedTaskRunner: Joi.boolean().default(false),
        /** Options for how FTR should execute and interact with Kibana */
        runOptions: Joi.object()
          .keys({
            /**
             * Log message to wait for before initiating tests, defaults to waiting for Kibana status to be `available`.
             * Note that this log message must not be filtered out by the current logging config, for example by the
             * log level. If needed, you can adjust the logging level via `kbnTestServer.serverArgs`.
             */
            wait: Joi.object()
              .regex()
              .default(/Kibana is now available/),

            /**
             * Does this test config only work when run against source?
             */
            alwaysUseSource: Joi.boolean().default(false),
          })
          .default(),
        env: Joi.object().unknown().default(),
        delayShutdown: Joi.number(),
        startRemoteKibana: Joi.boolean().default(false),
      })
      .default(),

    chromedriver: Joi.object()
      .keys({
        url: Joi.string()
          .uri({ scheme: /https?/ })
          .default('http://localhost:9515'),
      })
      .default(),

    firefoxdriver: Joi.object()
      .keys({
        url: Joi.string()
          .uri({ scheme: /https?/ })
          .default('http://localhost:2828'),
      })
      .default(),

    // definition of apps that work with `common.navigateToApp()`
    apps: Joi.object().pattern(ID_PATTERN, appUrlPartsSchema()).default(),

    // settings for the saved objects svc
    esArchiver: Joi.object()
      .keys({
        baseDirectory: Joi.string().optional(),
      })
      .default(),

    // settings for the saved objects svc
    kbnArchiver: Joi.object()
      .keys({
        directory: Joi.string().default(defaultRelativeToConfigPath('fixtures/kbn_archiver')),
      })
      .default(),

    // settings for the kibanaServer.uiSettings module
    uiSettings: Joi.object()
      .keys({
        defaults: Joi.object().unknown(true),
        globalDefaults: Joi.object().unknown(true),
      })
      .default(),

    // settings for the screenshots module
    screenshots: Joi.object()
      .keys({
        directory: Joi.string().default(defaultRelativeToConfigPath('screenshots')),
      })
      .default(),

    // settings for the snapshots module
    snapshots: Joi.object()
      .keys({
        directory: Joi.string().default(defaultRelativeToConfigPath('snapshots')),
      })
      .default(),

    // settings for the failureDebugging module
    failureDebugging: Joi.object()
      .keys({
        htmlDirectory: Joi.string().default(defaultRelativeToConfigPath('failure_debug/html')),
      })
      .default(),

    // settings for the find service
    layout: Joi.object()
      .keys({
        fixedHeaderHeight: Joi.number().default(100),
      })
      .default(),

    // settings for the security service if there is no defaultRole defined, then default to superuser role.
    security: Joi.object()
      .keys({
        roles: Joi.object().default(),
        remoteEsRoles: Joi.object(),
        defaultRoles: Joi.array()
          .items(Joi.string())
          .when('$primary', {
            is: true,
            then: Joi.array().min(1),
          })
          .default(['superuser']),
        disableTestUser: Joi.boolean(),
        cookieLogin: Joi.boolean().default(true),
      })
      .default(),

    dockerServers: Joi.object().pattern(Joi.string(), dockerServerSchema()).default(),

    // refresh_interval to be used on existing system indices (eg .kibana*), existing common indices (eg logs*)
    // and all templates created during tests.
    // defaults to 50ms if not overriden, otherwise accepts a duration (eg '50ms', '1s') or false to opt out the optimization.
    indexRefreshInterval: Joi.alternatives()
      .optional()
      .try(Joi.string(), Joi.boolean().valid(false))
      .default('50ms'),
  })
  .default();
