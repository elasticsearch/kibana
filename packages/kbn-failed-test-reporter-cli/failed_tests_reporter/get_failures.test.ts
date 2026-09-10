/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getCodeOwnersEntries, getOwningTeamsForPath } from '@kbn/code-owners';

import { getFailures, getLocationFromClassname, getReportNameFromClassname } from './get_failures';
import { parseTestReport } from './test_report';
import { FTR_REPORT, JEST_REPORT, MOCHA_REPORT, TRANSFORMED_CYPRESS_REPORT } from './__fixtures__';

jest.mock('@kbn/code-owners', () => ({
  getCodeOwnersEntries: jest.fn(() => []),
  // Deterministic owner so the fallback (used for Jest/Cypress) is testable
  // without depending on the real CODEOWNERS file.
  getOwningTeamsForPath: jest.fn(() => ['elastic/fake-team']),
}));

const getOwningTeamsForPathMock = getOwningTeamsForPath as jest.MockedFunction<
  typeof getOwningTeamsForPath
>;
const getCodeOwnersEntriesMock = getCodeOwnersEntries as jest.MockedFunction<
  typeof getCodeOwnersEntries
>;

beforeEach(() => {
  jest.clearAllMocks();
  getCodeOwnersEntriesMock.mockReturnValue([]);
  getOwningTeamsForPathMock.mockReturnValue(['elastic/fake-team']);
});

describe('classname parsing', () => {
  it.each([
    {
      classname: 'Jest Tests.x-pack/platform/example/example·test·ts',
      reportName: 'Jest Tests',
      location: 'x-pack/platform/example/example.test.ts',
    },
    {
      classname: 'Jest Tests',
      reportName: 'Jest Tests',
      location: '',
    },
    {
      classname: 'Jest Tests.unknown',
      reportName: 'Jest Tests',
      location: 'unknown',
    },
  ])('parses $classname', ({ classname, reportName, location }) => {
    expect(getReportNameFromClassname(classname)).toBe(reportName);
    expect(getLocationFromClassname(classname)).toBe(location);
  });
});

it('discovers failures in ftr report', async () => {
  const failures = getFailures(await parseTestReport(FTR_REPORT));
  expect(getOwningTeamsForPathMock).not.toHaveBeenCalled();
  expect(failures).toMatchInlineSnapshot(`
    Array [
      Object {
        "classname": "Chrome X-Pack UI Functional Tests.x-pack/platform/test/functional/apps/maps/sample_data·js",
        "commandLine": "node scripts/functional_tests --config=x-pack/platform/test/api_integration/apis/status/config.ts",
        "failure": "
            Error: retry.try timeout: TimeoutError: Waiting for element to be located By(css selector, [data-test-subj~=\\"layerTocActionsPanelToggleButtonRoad_Map_-_Bright\\"])
    Wait timed out after 10055ms
        at /var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-ciGroup7/node/immutable/kibana/node_modules/selenium-webdriver/lib/webdriver.js:834:17
        at process._tickCallback (internal/process/next_tick.js:68:7)
        at lastError (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-ciGroup7/node/immutable/kibana/test/common/services/retry/retry_for_success.ts:28:9)
        at onFailure (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-ciGroup7/node/immutable/kibana/test/common/services/retry/retry_for_success.ts:68:13)
          ",
        "likelyIrrelevant": false,
        "location": "x-pack/platform/test/functional/apps/maps/sample_data.js",
        "name": "maps app  maps loaded from sample data ecommerce \\"before all\\" hook",
        "owners": "elastic/kibana-presentation",
        "system-out": "
            [00:00:00]       │
    [00:07:04]         └-: maps app
    ...
    [00:15:02]                   │

          ",
        "testType": "ftr",
        "time": "154.378",
      },
      Object {
        "classname": "Chrome X-Pack UI Functional Tests.x-pack/platform/test/functional/apps/maps",
        "commandLine": "node scripts/functional_tests --config=x-pack/platform/test/api_integration/apis/status/config.ts",
        "failure": "
            { NoSuchSessionError: This driver instance does not have a valid session ID (did you call WebDriver.quit()?) and may no longer be used.
        at promise.finally (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-ciGroup7/node/immutable/kibana/node_modules/selenium-webdriver/lib/webdriver.js:726:38)
        at Object.thenFinally [as finally] (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-ciGroup7/node/immutable/kibana/node_modules/selenium-webdriver/lib/promise.js:124:12)
        at process._tickCallback (internal/process/next_tick.js:68:7) name: 'NoSuchSessionError', remoteStacktrace: '' }
          ",
        "likelyIrrelevant": true,
        "location": "x-pack/platform/test/functional/apps/maps",
        "metadata-json": "{\\"messages\\":[\\"foo\\"],\\"screenshots\\":[{\\"name\\":\\"failure[dashboard app using current data dashboard snapshots compare TSVB snapshot]\\",\\"url\\":\\"https://storage.googleapis.com/kibana-ci-artifacts/jobs/elastic+kibana+7.x/1632/kibana-oss-tests/test/functional/screenshots/failure/dashboard%20app%20using%20current%20data%20dashboard%20snapshots%20compare%20TSVB%20snapshot.png\\"}]}",
        "name": "maps app \\"after all\\" hook",
        "owners": "elastic/kibana-presentation",
        "system-out": "
            [00:00:00]       │
    [00:07:04]         └-: maps app
    ...

          ",
        "testType": "ftr",
        "time": "0.179",
      },
      Object {
        "classname": "Firefox XPack UI Functional Tests.x-pack/platform/test/functional/apps/machine_learning/anomaly_detection/saved_search_job·ts",
        "commandLine": "node scripts/functional_tests --config=x-pack/platform/test/api_integration/apis/status/config.ts",
        "failure": "{ NoSuchSessionError: Tried to run command without establishing a connection
        at Object.throwDecodedError (/dev/shm/workspace/kibana/node_modules/selenium-webdriver/lib/error.js:550:15)
        at parseHttpResponse (/dev/shm/workspace/kibana/node_modules/selenium-webdriver/lib/http.js:563:13)
        at Executor.execute (/dev/shm/workspace/kibana/node_modules/selenium-webdriver/lib/http.js:489:26)
        at process._tickCallback (internal/process/next_tick.js:68:7) name: 'NoSuchSessionError', remoteStacktrace: '' }",
        "likelyIrrelevant": true,
        "location": "x-pack/platform/test/functional/apps/machine_learning/anomaly_detection/saved_search_job.ts",
        "name": "machine learning anomaly detection saved search  with lucene query job creation opens the advanced section",
        "owners": "elastic/ml-ui",
        "system-out": "[00:21:57]         └-: machine learning...",
        "testType": "ftr",
        "time": "6.040",
      },
    ]
  `);
});

it('discovers failures in jest report', async () => {
  const failures = getFailures(await parseTestReport(JEST_REPORT));
  expect(getOwningTeamsForPathMock).toHaveBeenCalledWith(
    'x-pack/legacy/plugins/code/server/lsp/abstract_launcher.test.ts',
    []
  );
  expect(failures).toMatchInlineSnapshot(`
    Array [
      Object {
        "classname": "X-Pack Jest Tests.x-pack/legacy/plugins/code/server/lsp",
        "commandLine": "node scripts/jest --config some/jest/config.ts",
        "failure": "
            TypeError: Cannot read property '0' of undefined
        at Object.<anonymous>.test (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-intake/node/immutable/kibana/x-pack/legacy/plugins/code/server/lsp/abstract_launcher.test.ts:166:10)
          ",
        "likelyIrrelevant": false,
        "location": "x-pack/legacy/plugins/code/server/lsp/abstract_launcher.test.ts",
        "name": "launcher can reconnect if process died",
        "owners": "elastic/fake-team",
        "system-out": "",
        "testType": "jest",
        "time": "7.060",
      },
    ]
  `);
});

it('discovers failures in transformed cypress report', async () => {
  const failures = getFailures(await parseTestReport(TRANSFORMED_CYPRESS_REPORT));
  const location =
    'x-pack/solutions/security/test/security_solution_cypress/cypress/e2e/response_actions/isolate.cy.ts';

  expect(getOwningTeamsForPathMock).toHaveBeenCalledWith(location, []);
  expect(failures).toEqual([
    expect.objectContaining({
      classname:
        'Security Solution Cypress.x-pack/solutions/security/test/security_solution_cypress/cypress/e2e/response_actions/isolate·cy·ts',
      location,
      owners: 'elastic/fake-team',
      testType: 'cypress',
    }),
  ]);
});

it('leaves owners undefined when no CODEOWNERS entry matches', async () => {
  getOwningTeamsForPathMock.mockReturnValueOnce([]);

  const [failure] = getFailures(await parseTestReport(TRANSFORMED_CYPRESS_REPORT));

  expect(failure.owners).toBeUndefined();
});

it('handles errors while loading CODEOWNERS', async () => {
  getCodeOwnersEntriesMock.mockImplementationOnce(() => {
    throw new Error('CODEOWNERS unavailable');
  });
  getOwningTeamsForPathMock.mockReturnValueOnce([]);

  const [failure] = getFailures(await parseTestReport(TRANSFORMED_CYPRESS_REPORT));

  expect(failure.owners).toBeUndefined();
});

it('handles errors while resolving code owners', async () => {
  getOwningTeamsForPathMock.mockImplementationOnce(() => {
    throw new Error('Unable to resolve owners');
  });

  const [failure] = getFailures(await parseTestReport(TRANSFORMED_CYPRESS_REPORT));

  expect(failure.owners).toBeUndefined();
});

it('associates each Jest failure with its enclosing suite', async () => {
  const report = await parseTestReport(`
    <testsuites name="jest">
      <testsuite name="path/to/first.test.ts" timestamp="2026-07-15T12:00:00" time="1" tests="1" failures="1" skipped="0">
        <testcase classname="Jest Tests.path/to" name="first test" time="1">
          <failure>first failure</failure>
        </testcase>
      </testsuite>
      <testsuite name="other/path/second.test.ts" timestamp="2026-07-15T12:00:01" time="2" tests="1" failures="1" skipped="0">
        <testcase classname="Jest Tests.other/path" name="second test" time="2">
          <failure>second failure</failure>
        </testcase>
      </testsuite>
    </testsuites>
  `);

  expect(
    getFailures(report).map(({ name, location }) => ({
      name,
      location,
    }))
  ).toEqual([
    { name: 'first test', location: 'path/to/first.test.ts' },
    { name: 'second test', location: 'other/path/second.test.ts' },
  ]);
});

describe('cascading failures', () => {
  const report = (cascadingAttr: string) => `
    <testsuites name="ftr">
      <testsuite name="FTR" timestamp="2026-07-15T12:00:00" time="1" tests="2" failures="2" skipped="0">
        <testcase classname="FTR.x-pack/a·ts" name="root cause" time="120">
          <failure>Error: Timeout of 120000ms exceeded.</failure>
        </testcase>
        <testcase classname="FTR.x-pack/a·ts" name="after all hook" time="0.001" ${cascadingAttr}>
          <failure>Error: Timeout of 1ms exceeded.</failure>
        </testcase>
      </testsuite>
    </testsuites>
  `;

  it('flags the failures the reporter marked as cascading', async () => {
    const [rootCause, cascading] = getFailures(
      await parseTestReport(report('cascading-failure="true"'))
    );

    expect(rootCause.cascading).toBeUndefined();
    expect(cascading.cascading).toBe(true);
    expect(cascading).not.toHaveProperty('cascading-failure');
  });

  it('leaves failures unflagged when the attribute is absent', async () => {
    const failures = getFailures(await parseTestReport(report('')));

    expect(failures.map(({ cascading }) => cascading)).toEqual([undefined, undefined]);
  });
});

it('rewrites absolute checkout paths as repository relative ones', async () => {
  const report = await parseTestReport(`
    <testsuites name="ftr">
      <testsuite name="FTR" timestamp="2026-07-15T12:00:00" time="1" tests="1" failures="1" skipped="0">
        <testcase classname="FTR.x-pack/a·ts" name="a test" time="1">
          <failure>Error: boom (/opt/buildkite-agent/builds/bk-agent-1/elastic/kibana-pull-request/kibana/x-pack/a.ts)</failure>
          <system-out>ran /opt/buildkite-agent/builds/bk-agent-1/elastic/kibana-pull-request/kibana/x-pack/a.ts</system-out>
        </testcase>
      </testsuite>
    </testsuites>
  `);

  const [failure] = getFailures(report);

  expect(failure.failure).toBe('Error: boom (x-pack/a.ts)');
  expect(failure['system-out']).toBe('ran x-pack/a.ts');
});

it('discovers failures in mocha report', async () => {
  const failures = getFailures(await parseTestReport(MOCHA_REPORT));
  expect(failures).toMatchInlineSnapshot(`
    Array [
      Object {
        "classname": "X-Pack Mocha Tests.x-pack/legacy/plugins/code/server/__tests__/multi_node·ts",
        "commandLine": "node scripts/functional_tests --config super-mocha-test.config.js",
        "failure": "
            Error: Unable to read artifact info from https://artifacts-api.elastic.co/v1/versions/8.0.0-SNAPSHOT/builds/latest/projects/elasticsearch: Service Temporarily Unavailable
      <html>
    <head><title>503 Service Temporarily Unavailable</title></head>
    <body bgcolor=\\"white\\">
    <center><h1>503 Service Temporarily Unavailable</h1></center>
    <hr><center>nginx/1.13.7</center>
    </body>
    </html>

        at Function.getSnapshot (/var/lib/jenkins/workspace/elastic+kibana+master/JOB/x-pack-intake/node/immutable/kibana/src/platform/packages/shared/kbn-es/src/artifact.js:95:13)
        at process._tickCallback (internal/process/next_tick.js:68:7)
          ",
        "likelyIrrelevant": true,
        "location": "x-pack/legacy/plugins/code/server/__tests__/multi_node.ts",
        "name": "code in multiple nodes \\"before all\\" hook",
        "owners": "elastic/fake-team",
        "system-out": "
            
          ",
        "testType": undefined,
        "time": "0.121",
      },
      Object {
        "classname": "X-Pack Mocha Tests.x-pack/legacy/plugins/code/server/__tests__/multi_node·ts",
        "commandLine": "node scripts/functional_tests --config super-mocha-test.config.js",
        "failure": "
            TypeError: Cannot read property 'shutdown' of undefined
        at Context.shutdown (plugins/code/server/__tests__/multi_node.ts:125:23)
        at process.topLevelDomainCallback (domain.js:120:23)
          ",
        "likelyIrrelevant": true,
        "location": "x-pack/legacy/plugins/code/server/__tests__/multi_node.ts",
        "name": "code in multiple nodes \\"after all\\" hook",
        "owners": "elastic/fake-team",
        "system-out": "
            
          ",
        "testType": undefined,
        "time": "0.003",
      },
    ]
  `);
});
