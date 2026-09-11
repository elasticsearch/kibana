/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migrated from the FTR suite
 * `apis/synthetics/create_monitor_project_private_location.ts`
 * (`AddProjectMonitorsPrivateLocations`).
 *
 * Covers pushing project monitors (browser/http/tcp/icmp) bound to a Fleet
 * private location: decrypted-monitor assertions, custom namespaces, editing,
 * enable/disable, alert config, invalid/empty locations, Fleet integration
 * policy creation/update/deletion (`comparePolicies`), the 250-monitor request
 * limit, read-only/multi-space authorization, and the all-spaces (`*`) flow.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KbnClient, KibanaRole, ScoutLogger } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { syntheticsMonitorSavedObjectType } from '../../../../../common/types/saved_objects';
import { ConfigKey } from '../../../../../common/runtime_types';
import {
  PROFILE_VALUES_ENUM,
  PROFILES_MAP,
} from '../../../../../common/constants/monitor_defaults';
import { formatKibanaNamespace } from '../../../../../common/formatters';
import { REQUEST_TOO_LARGE } from '../../../../../server/routes/monitor_cruds/project_monitor/add_monitor_project';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { getMonitor, listMonitors, deleteMonitors } from '../../../common/fixtures/monitors';
import { pushProjectMonitors } from '../../../common/fixtures/project';
import {
  getSyntheticsPackagePolicies,
  deleteAllSyntheticsPackagePolicies,
} from '../../../common/fixtures/fleet';
import { projectBrowserMonitorFixture } from '../fixtures/data/project_browser_monitor';
import { projectHttpMonitorFixture } from '../fixtures/data/project_http_monitor';
import { projectTcpMonitorFixture } from '../fixtures/data/project_tcp_monitor';
import { projectIcmpMonitorFixture } from '../../../common/fixtures/data/project_icmp_monitor';
import { comparePolicies } from '../fixtures/data/test_policy';
import {
  getTestProjectSyntheticsPolicy,
  getTestProjectSyntheticsPolicyLightweight,
} from '../fixtures/data/test_project_monitor_policy';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';

type ProjectMonitor = Record<string, any>;

const MONITOR_SO_TYPES = [syntheticsMonitorSavedObjectType, 'synthetics-monitor'];

apiTest.describe(
  'AddProjectMonitorsPrivateLocations',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let viewerHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let testPrivateLocation: ScoutPrivateLocation;
    let testPolicyId: string;
    let testPrivateLocationName: string;
    let kibanaServerUrl: string;
    let log: ScoutLogger;
    const createdSpaces: string[] = [];

    /**
     * Clones a fixture monitor array, assigns each a fresh `id` (FTR
     * `setUniqueIds`) and forces them onto the shared worker private location
     * (FTR `formatLocations`).
     */
    const makeMonitors = (fixture: { monitors: readonly unknown[] }): ProjectMonitor[] =>
      (JSON.parse(JSON.stringify(fixture.monitors)) as ProjectMonitor[]).map((monitor) => ({
        ...monitor,
        id: uuidv4(),
        locations: [],
        privateLocations: [testPrivateLocationName],
      }));

    /** The private-location object as it appears on a decrypted monitor's `locations`. */
    const privateLocationResult = () => ({
      geo: { lat: 0, lon: 0 },
      id: testPolicyId,
      agentPolicyId: testPolicyId,
      isServiceManaged: false,
      label: testPrivateLocationName,
    });

    /** Lists monitors filtered by `journey_id`; returns the raw monitors array. */
    const findByJourneyId = async (
      apiClient: ApiClientFixture,
      journeyId: string,
      opts: { internal?: boolean; spaceId?: string } = {}
    ): Promise<Array<Record<string, any>>> => {
      const filter = `${syntheticsMonitorSavedObjectType}.attributes.journey_id: ${journeyId}`;
      const query = `filter=${encodeURIComponent(filter)}${opts.internal ? '&internal=true' : ''}`;
      const res = await listMonitors(apiClient, editorHeaders, query, { spaceId: opts.spaceId });
      return (res.body as { monitors: Array<Record<string, any>> }).monitors;
    };

    /** Finds the synthetics Fleet package policy by id (elevated / admin). */
    const findPackagePolicy = async (apiClient: ApiClientFixture, policyId: string) => {
      const policies = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
      return policies.find((policy) => policy.id === policyId);
    };

    /**
     * Mirrors the FTR `deleteMonitorByJourney`: looks up monitors by
     * `journey_id` AND `project_id` in the given space, then deletes them.
     */
    const deleteByJourney = async (
      apiClient: ApiClientFixture,
      journeyId: string,
      projectId: string,
      spaceId: string = 'default'
    ) => {
      try {
        const filter = `${syntheticsMonitorSavedObjectType}.attributes.journey_id: "${journeyId}" AND ${syntheticsMonitorSavedObjectType}.attributes.project_id: "${projectId}"`;
        const res = await listMonitors(
          apiClient,
          editorHeaders,
          `filter=${encodeURIComponent(filter)}`,
          {
            spaceId: spaceId === 'default' ? undefined : spaceId,
          }
        );
        const ids = (res.body as { monitors: Array<{ id: string }> }).monitors
          .map((monitor) => monitor.id)
          .filter(Boolean);
        if (ids.length > 0) {
          await deleteMonitors(apiClient, editorHeaders, ids, {
            spaceId: spaceId === 'default' ? undefined : spaceId,
          });
        }
      } catch (error) {
        // Best-effort cleanup (mirrors the FTR try/catch). The `beforeEach`
        // `savedObjects.clean` still guarantees a clean slate for the next test,
        // so a failure here can't leak across tests — but surface it instead of
        // swallowing it silently so a 500/auth/network error stays diagnosable.
        log.warning(
          `deleteByJourney cleanup failed for journey "${journeyId}" / project "${projectId}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    };

    const createSpace = async (kbnClient: KbnClient) => {
      const id = `test-space-${uuidv4()}`;
      await kbnClient.spaces.create({ id, name: `test-space-name ${uuidv4()}` });
      createdSpaces.push(id);
      return id;
    };

    // --- Expected decrypted-monitor builders (private-location variants) ---

    const expectedBrowser = (
      journeyId: string,
      project: string,
      decrypted: Record<string, any>
    ) => ({
      __ui: {
        script_source: { file_name: '', is_generated_script: false },
      },
      config_id: decrypted.config_id,
      custom_heartbeat_id: `${journeyId}-${project}-default`,
      enabled: true,
      alert: { status: { enabled: true }, tls: { enabled: true } },
      'filter_journeys.match': 'check if title is present',
      'filter_journeys.tags': [],
      form_monitor_type: 'multistep',
      ignore_https_errors: false,
      certificate_error_spki_allowlist: [],
      journey_id: journeyId,
      locations: [privateLocationResult()],
      name: 'check if title is present',
      namespace: 'default',
      origin: 'project',
      original_space: 'default',
      playwright_options: '{"headless":true,"chromiumSandbox":false}',
      playwright_text_assertion: '',
      project_id: project,
      params: '',
      revision: 1,
      schedule: { number: '10', unit: 'm' },
      screenshots: 'on',
      'service.name': '',
      synthetics_args: [],
      tags: [],
      throttling: PROFILES_MAP[PROFILE_VALUES_ENUM.DEFAULT],
      'ssl.certificate': '',
      'ssl.certificate_authorities': '',
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
      'ssl.verification_mode': 'full',
      'ssl.key': '',
      'ssl.key_passphrase': '',
      'source.inline.script': '',
      'source.project.content':
        'UEsDBBQACAAIAON5qVQAAAAAAAAAAAAAAAAfAAAAZXhhbXBsZXMvdG9kb3MvYmFzaWMuam91cm5leS50c22Q0WrDMAxF3/sVF7MHB0LMXlc6RvcN+wDPVWNviW0sdUsp/fe5SSiD7UFCWFfHujIGlpnkybwxFTZfoY/E3hsaLEtwhs9RPNWKDU12zAOxkXRIbN4tB9d9pFOJdO6EN2HMqQguWN9asFBuQVMmJ7jiWNII9fIXrbabdUYr58l9IhwhQQZCYORCTFFUC31Btj21NRc7Mq4Nds+4bDD/pNVgT9F52Jyr2Fa+g75LAPttg8yErk+S9ELpTmVotlVwnfNCuh2lepl3+JflUmSBJ3uggt1v9INW/lHNLKze9dJe1J3QJK8pSvWkm6aTtCet5puq+x63+AFQSwcIAPQ3VfcAAACcAQAAUEsBAi0DFAAIAAgA43mpVAD0N1X3AAAAnAEAAB8AAAAAAAAAAAAgAKSBAAAAAGV4YW1wbGVzL3RvZG9zL2Jhc2ljLmpvdXJuZXkudHNQSwUGAAAAAAEAAQBNAAAARAEAAAAA',
      timeout: null,
      type: 'browser',
      'url.port': null,
      urls: '',
      id: `${journeyId}-${project}-default`,
      hash: 'ekrjelkjrelkjre',
      max_attempts: 2,
      updated_at: decrypted.updated_at,
      created_at: decrypted.created_at,
      labels: {},
      maintenance_windows: [],
      spaces: ['default'],
    });

    const expectedHttp = (
      journeyId: string,
      project: string,
      monitor: ProjectMonitor,
      decrypted: Record<string, any>,
      isTLSEnabled: boolean
    ) => ({
      __ui: { is_tls_enabled: isTLSEnabled },
      'check.request.method': 'POST',
      'check.response.status': ['200'],
      config_id: decrypted.config_id,
      custom_heartbeat_id: `${journeyId}-${project}-default`,
      'check.response.body.negative': [],
      'check.response.body.positive': ['${testLocal1}', 'saved'],
      'check.response.json': [{ description: 'check status', expression: 'foo.bar == "myValue"' }],
      'check.response.headers': {},
      proxy_url: '${testGlobalParam2}',
      'check.request.body': { type: 'text', value: '' },
      params: JSON.stringify({
        testLocal1: 'testLocalParamsValue',
        testGlobalParam2: 'testGlobalParamOverwrite',
      }),
      'check.request.headers': { 'Content-Type': 'application/x-www-form-urlencoded' },
      enabled: false,
      alert: { status: { enabled: true }, tls: { enabled: true } },
      form_monitor_type: 'http',
      journey_id: journeyId,
      locations: [privateLocationResult()],
      max_redirects: '0',
      name: monitor.name,
      namespace: 'default',
      origin: 'project',
      original_space: 'default',
      project_id: project,
      username: '',
      password: '',
      proxy_headers: {},
      'response.include_body': 'always',
      'response.include_headers': false,
      'response.include_body_max_bytes': '900',
      revision: 1,
      schedule: { number: '60', unit: 'm' },
      'service.name': '',
      'ssl.certificate': '',
      'ssl.certificate_authorities': '',
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
      'ssl.verification_mode': isTLSEnabled ? 'strict' : 'full',
      'ssl.key': '',
      'ssl.key_passphrase': '',
      tags: Array.isArray(monitor.tags) ? monitor.tags : monitor.tags?.split(','),
      timeout: '80',
      type: 'http',
      urls: Array.isArray(monitor.urls) ? monitor.urls?.[0] : monitor.urls,
      'url.port': null,
      id: `${journeyId}-${project}-default`,
      hash: 'ekrjelkjrelkjre',
      mode: 'any',
      ipv6: true,
      ipv4: true,
      max_attempts: 2,
      labels: {},
      maintenance_windows: [],
      spaces: ['default'],
      updated_at: decrypted.updated_at,
      created_at: decrypted.created_at,
    });

    const expectedTcp = (
      journeyId: string,
      project: string,
      monitor: ProjectMonitor,
      decrypted: Record<string, any>,
      isTLSEnabled: boolean
    ) => ({
      __ui: { is_tls_enabled: isTLSEnabled },
      config_id: decrypted.config_id,
      custom_heartbeat_id: `${journeyId}-${project}-default`,
      'check.receive': '',
      'check.send': '',
      enabled: true,
      alert: { status: { enabled: true }, tls: { enabled: true } },
      form_monitor_type: 'tcp',
      journey_id: journeyId,
      locations: [privateLocationResult()],
      name: monitor.name,
      namespace: 'default',
      origin: 'project',
      original_space: 'default',
      project_id: project,
      revision: 1,
      schedule: { number: '1', unit: 'm' },
      proxy_url: '',
      proxy_use_local_resolver: false,
      'service.name': '',
      'ssl.certificate': '',
      'ssl.certificate_authorities': '',
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
      'ssl.verification_mode': isTLSEnabled ? 'strict' : 'full',
      'ssl.key': '',
      'ssl.key_passphrase': '',
      tags: Array.isArray(monitor.tags) ? monitor.tags : monitor.tags?.split(','),
      timeout: '16',
      type: 'tcp',
      hosts: Array.isArray(monitor.hosts) ? monitor.hosts?.[0] : monitor.hosts,
      'url.port': null,
      urls: '',
      id: `${journeyId}-${project}-default`,
      hash: 'ekrjelkjrelkjre',
      mode: 'any',
      ipv6: true,
      ipv4: true,
      params: '',
      max_attempts: 2,
      labels: {},
      maintenance_windows: [],
      spaces: ['default'],
      updated_at: decrypted.updated_at,
      created_at: decrypted.created_at,
    });

    const expectedIcmp = (
      journeyId: string,
      project: string,
      monitor: ProjectMonitor,
      decrypted: Record<string, any>
    ) => ({
      config_id: decrypted.config_id,
      custom_heartbeat_id: `${journeyId}-${project}-default`,
      enabled: true,
      alert: { status: { enabled: true }, tls: { enabled: true } },
      form_monitor_type: 'icmp',
      journey_id: journeyId,
      locations: [privateLocationResult()],
      name: monitor.name,
      namespace: 'default',
      origin: 'project',
      original_space: 'default',
      project_id: project,
      revision: 1,
      schedule: { number: '1', unit: 'm' },
      'service.name': '',
      tags: Array.isArray(monitor.tags) ? monitor.tags : monitor.tags?.split(','),
      timeout: '16',
      type: 'icmp',
      hosts: Array.isArray(monitor.hosts) ? monitor.hosts?.[0] : monitor.hosts,
      wait:
        monitor.wait?.slice(-1) === 's'
          ? monitor.wait?.slice(0, -1)
          : `${parseInt(monitor.wait?.slice(0, -1) || '1', 10) * 60}`,
      id: `${journeyId}-${project}-default`,
      hash: 'ekrjelkjrelkjre',
      mode: 'any',
      ipv4: true,
      ipv6: true,
      params: '',
      max_attempts: 2,
      updated_at: decrypted.updated_at,
      created_at: decrypted.created_at,
      labels: {},
      maintenance_windows: [],
      spaces: ['default'],
    });

    apiTest.beforeAll(
      async ({ requestAuth, kbnClient, apiServices, apiClient, config, log: workerLog }) => {
        kibanaServerUrl = config.hosts.kibana;
        log = workerLog;

        const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
        editorHeaders = mergeSyntheticsApiHeaders(editorKey, { Accept: 'application/json' });
        const { apiKeyHeader: viewerKey } = await requestAuth.getApiKey('viewer');
        viewerHeaders = mergeSyntheticsApiHeaders(viewerKey, { Accept: 'application/json' });
        const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
        adminHeaders = mergeSyntheticsApiHeaders(adminKey, { Accept: 'application/json' });

        await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
        await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);

        testPrivateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
        testPolicyId = testPrivateLocation.agentPolicyId;
        testPrivateLocationName = testPrivateLocation.label;

        // Global param referenced by the lightweight `comparePolicies` test body.
        await apiClient.post('api/synthetics/params', {
          headers: editorHeaders,
          body: { key: 'testGlobalParam', value: 'testGlobalParamValue' },
          responseType: 'json',
        });
      }
    );

    apiTest.beforeEach(async ({ kbnClient }) => {
      apiTest.setTimeout(150_000);
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
    });

    apiTest.afterAll(async ({ kbnClient, apiClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
      for (const spaceId of createdSpaces) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      createdSpaces.length = 0;
    });

    apiTest(
      'project monitors - returns a failed monitor when creating integration fails',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const secondMonitor = {
          ...monitors[0],
          id: 'test-id-2',
          privateLocations: ['Test private location 7'],
        };
        const testMonitors = [
          monitors[0],
          { ...secondMonitor, name: '!@#$%^&*()_++[\\-\\]- wow name' },
        ];
        try {
          const res = await pushProjectMonitors(apiClient, editorHeaders, project, testMonitors);
          expect(res.statusCode).toBe(200);
          expect(res.body.createdMonitors).toHaveLength(1);
          expect(res.body.failedMonitors[0].reason).toBe(
            "Couldn't save or update monitor because of an invalid configuration."
          );
        } finally {
          await Promise.all(
            testMonitors.map((monitor) => deleteByJourney(apiClient, monitor.id, project))
          );
        }
      }
    );

    apiTest(
      'project monitors - returns a failed monitor when editing integration fails',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const secondMonitor = {
          ...monitors[0],
          id: 'test-id-2',
          privateLocations: [testPrivateLocationName],
        };
        const testMonitors: ProjectMonitor[] = [monitors[0], secondMonitor];

        const created = await pushProjectMonitors(apiClient, editorHeaders, project, testMonitors);
        expect(created.body.createdMonitors).toHaveLength(2);

        const edited = await pushProjectMonitors(apiClient, editorHeaders, project, testMonitors);
        expect(edited.body.createdMonitors).toHaveLength(0);
        expect(edited.body.updatedMonitors).toHaveLength(2);

        testMonitors[1].name = '!@#$%^&*()_++[\\-\\]- wow name';
        testMonitors[1].privateLocations = ['Test private location 8'];

        const editedError = await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          testMonitors
        );
        expect(editedError.body.createdMonitors).toHaveLength(0);
        expect(editedError.body.updatedMonitors).toHaveLength(1);
        expect(editedError.body.failedMonitors).toHaveLength(1);
        expect(editedError.body.failedMonitors[0].details).toBe(
          `Invalid locations specified. Private Location(s) 'Test private location 8' not found. Available private locations are '${testPrivateLocationName}'`
        );
        expect(editedError.body.failedMonitors[0].reason).toBe(
          "Couldn't save or update monitor because of an invalid configuration."
        );
      }
    );

    apiTest('project monitors - handles browser monitors', async ({ apiClient }) => {
      const monitors = makeMonitors(projectBrowserMonitorFixture);
      const successfulMonitors = [monitors[0]];
      const project = `test-project-${uuidv4()}`;

      const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: successfulMonitors.map((monitor) => monitor.id),
        failedMonitors: [],
      });

      for (const monitor of successfulMonitors) {
        const journeyId = monitor.id;
        const found = await findByJourneyId(apiClient, journeyId);
        const { rawBody: decrypted } = await getMonitor(
          apiClient,
          editorHeaders,
          found[0].config_id,
          {
            internal: true,
          }
        );
        expect(decrypted).toStrictEqual(expectedBrowser(journeyId, project, decrypted));
      }
    });

    apiTest(
      'project monitors - allows throttling false for browser monitors',
      async ({ apiClient }) => {
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const successfulMonitors = [monitors[0]];
        const project = `test-project-${uuidv4()}`;

        const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[0], throttling: false },
        ]);
        expect(res.body).toStrictEqual({
          updatedMonitors: [],
          createdMonitors: successfulMonitors.map((monitor) => monitor.id),
          failedMonitors: [],
        });

        for (const monitor of successfulMonitors) {
          const found = await findByJourneyId(apiClient, monitor.id);
          const { body: decrypted } = await getMonitor(
            apiClient,
            editorHeaders,
            found[0].config_id
          );
          expect(decrypted.throttling).toStrictEqual({
            value: null,
            id: 'no-throttling',
            label: 'No throttling',
          });
        }
      }
    );

    apiTest('project monitors - handles http monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = makeMonitors(projectHttpMonitorFixture);
      const successfulMonitors = [monitors[1]];
      const project = `test-project-${uuidv4()}`;

      const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: successfulMonitors.map((monitor) => monitor.id),
        failedMonitors: [
          {
            id: monitors[0].id,
            details: `\`http\` project monitors must have exactly one value for field \`urls\` in version \`${kibanaVersion}\`. Your monitor was not created or updated.`,
            reason: 'Invalid Heartbeat configuration',
          },
          {
            id: monitors[0].id,
            details: `The following Heartbeat options are not supported for ${monitors[0].type} project monitors in ${kibanaVersion}: check.response.body|unsupportedKey.nestedUnsupportedKey. You monitor was not created or updated.`,
            reason: 'Unsupported Heartbeat option',
          },
        ],
      });

      for (const monitor of successfulMonitors) {
        const journeyId = monitor.id;
        const isTLSEnabled = Object.keys(monitor).some((key) => key.includes('ssl'));
        const found = await findByJourneyId(apiClient, journeyId);
        const { rawBody: decrypted } = await getMonitor(
          apiClient,
          editorHeaders,
          found[0].config_id,
          {
            internal: true,
          }
        );
        expect(decrypted).toStrictEqual(
          expectedHttp(journeyId, project, monitor, decrypted, isTLSEnabled)
        );
      }
    });

    apiTest('project monitors - handles tcp monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = makeMonitors(projectTcpMonitorFixture);
      const successfulMonitors = [monitors[0], monitors[1]];
      const project = `test-project-${uuidv4()}`;

      const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: successfulMonitors.map((monitor) => monitor.id),
        failedMonitors: [
          {
            id: monitors[2].id,
            details: `\`tcp\` project monitors must have exactly one value for field \`hosts\` in version \`${kibanaVersion}\`. Your monitor was not created or updated.`,
            reason: 'Invalid Heartbeat configuration',
          },
          {
            id: monitors[2].id,
            details: `The following Heartbeat options are not supported for ${monitors[0].type} project monitors in ${kibanaVersion}: ports|unsupportedKey.nestedUnsupportedKey. You monitor was not created or updated.`,
            reason: 'Unsupported Heartbeat option',
          },
        ],
      });

      for (const monitor of successfulMonitors) {
        const journeyId = monitor.id;
        const isTLSEnabled = Object.keys(monitor).some((key) => key.includes('ssl'));
        const found = await findByJourneyId(apiClient, journeyId);
        const { rawBody: decrypted } = await getMonitor(
          apiClient,
          editorHeaders,
          found[0].config_id,
          {
            internal: true,
          }
        );
        expect(decrypted).toStrictEqual(
          expectedTcp(journeyId, project, monitor, decrypted, isTLSEnabled)
        );
      }
    });

    apiTest('project monitors - handles icmp monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = makeMonitors(projectIcmpMonitorFixture);
      const successfulMonitors = [monitors[0], monitors[1]];
      const project = `test-project-${uuidv4()}`;

      const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: successfulMonitors.map((monitor) => monitor.id),
        failedMonitors: [
          {
            id: monitors[2].id,
            details: `\`icmp\` project monitors must have exactly one value for field \`hosts\` in version \`${kibanaVersion}\`. Your monitor was not created or updated.`,
            reason: 'Invalid Heartbeat configuration',
          },
          {
            id: monitors[2].id,
            details: `The following Heartbeat options are not supported for ${monitors[0].type} project monitors in ${kibanaVersion}: unsupportedKey.nestedUnsupportedKey. You monitor was not created or updated.`,
            reason: 'Unsupported Heartbeat option',
          },
        ],
      });

      for (const monitor of successfulMonitors) {
        const journeyId = monitor.id;
        const found = await findByJourneyId(apiClient, journeyId);
        const { rawBody: decrypted } = await getMonitor(
          apiClient,
          editorHeaders,
          found[0].config_id,
          {
            internal: true,
          }
        );
        expect(decrypted).toStrictEqual(expectedIcmp(journeyId, project, monitor, decrypted));
      }
    });

    apiTest(
      'project monitors - returns a list of successfully created monitors',
      async ({ apiClient }) => {
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const project = `test-project-${uuidv4()}`;
        const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        expect(res.body).toStrictEqual({
          updatedMonitors: [],
          failedMonitors: [],
          createdMonitors: monitors.map((monitor) => monitor.id),
        });
      }
    );

    apiTest(
      'project monitors - returns a list of successfully updated monitors',
      async ({ apiClient }) => {
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const project = `test-project-${uuidv4()}`;
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        expect(res.body).toStrictEqual({
          createdMonitors: [],
          failedMonitors: [],
          updatedMonitors: monitors.map((monitor) => monitor.id),
        });
      }
    );

    apiTest('project monitors - validates monitor type', async ({ apiClient }) => {
      const monitors = makeMonitors(projectBrowserMonitorFixture);
      const project = `test-project-${uuidv4()}`;
      const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitors[0], schedule: '3m', tags: '' },
      ]);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        failedMonitors: [
          {
            details: 'Invalid value "3m" supplied to "schedule"',
            id: monitors[0].id,
            payload: {
              content: monitors[0].content,
              filter: { match: 'check if title is present' },
              id: monitors[0].id,
              locations: [],
              privateLocations: [testPrivateLocationName],
              name: 'check if title is present',
              params: {},
              playwrightOptions: { chromiumSandbox: false, headless: true },
              schedule: '3m',
              tags: '',
              throttling: { download: 5, latency: 20, upload: 3 },
              type: 'browser',
              hash: 'ekrjelkjrelkjre',
              max_attempts: 2,
            },
            reason: "Couldn't save or update monitor because of an invalid configuration.",
          },
        ],
        createdMonitors: [],
      });
    });

    apiTest(
      'project monitors - saves space as data stream namespace',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[0], privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        const found = await findByJourneyId(apiClient, monitors[0].id, { spaceId });
        expect(found).toHaveLength(1);
        expect(found[0][ConfigKey.NAMESPACE]).toBe(formatKibanaNamespace(spaceId));
      }
    );

    apiTest(
      'project monitors - browser - handles custom namespace',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const customNamespace = 'custom.namespace';
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[0], namespace: customNamespace, privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        const found = await findByJourneyId(apiClient, monitors[0].id, { spaceId });
        expect(found).toHaveLength(1);
        expect(found[0][ConfigKey.NAMESPACE]).toBe(customNamespace);
      }
    );

    apiTest(
      'project monitors - lightweight - handles custom namespace',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const customNamespace = 'custom.namespace';
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectHttpMonitorFixture);
        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[1], namespace: customNamespace, privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        const found = await findByJourneyId(apiClient, monitors[1].id, { spaceId });
        expect(found).toHaveLength(1);
        expect(found[0][ConfigKey.NAMESPACE]).toBe(customNamespace);
      }
    );

    apiTest(
      'project monitors - browser - handles custom namespace errors',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const customNamespace = 'custom-namespace';
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const res = await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[0], namespace: customNamespace, privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        expect(res.body).toStrictEqual({
          createdMonitors: [],
          failedMonitors: [
            {
              details: 'Namespace contains invalid characters',
              id: monitors[0].id,
              reason: 'Invalid namespace',
            },
          ],
          updatedMonitors: [],
        });
      }
    );

    apiTest(
      'project monitors - lightweight - handles custom namespace errors',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const customNamespace = 'custom-namespace';
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectHttpMonitorFixture);
        const res = await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[1], namespace: customNamespace, privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        expect(res.body).toStrictEqual({
          createdMonitors: [],
          failedMonitors: [
            {
              details: 'Namespace contains invalid characters',
              id: monitors[1].id,
              reason: 'Invalid namespace',
            },
          ],
          updatedMonitors: [],
        });
      }
    );

    apiTest(
      'project monitors - handles editing with spaces',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectBrowserMonitorFixture);

        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((monitor) => ({ ...monitor, privateLocations: [spaceLocation.label] })),
          { spaceId }
        );

        const found = await findByJourneyId(apiClient, monitors[0].id, { spaceId });
        expect(found).toHaveLength(1);
        const { body: decrypted } = await getMonitor(apiClient, editorHeaders, found[0].config_id, {
          internal: true,
          space: spaceId,
        });
        expect(decrypted[ConfigKey.SOURCE_PROJECT_CONTENT]).toBe(monitors[0].content);

        const updatedSource = 'updatedSource';
        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[0], content: updatedSource, privateLocations: [spaceLocation.label] }],
          { spaceId }
        );

        const foundUpdated = await findByJourneyId(apiClient, monitors[0].id, { spaceId });
        expect(foundUpdated).toHaveLength(1);
        const { body: decryptedUpdated } = await getMonitor(
          apiClient,
          editorHeaders,
          foundUpdated[0].config_id,
          { internal: true, space: spaceId }
        );
        expect(decryptedUpdated[ConfigKey.SOURCE_PROJECT_CONTENT]).toBe(updatedSource);
      }
    );

    apiTest(
      'project monitors - formats custom id appropriately',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test project ${uuidv4()}`;
        const spaceId = await createSpace(kbnClient);
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitors[0], privateLocations: [spaceLocation.label] }],
          { spaceId }
        );
        const found = await findByJourneyId(apiClient, monitors[0].id, { spaceId });
        expect(found).toHaveLength(1);
        expect(found[0][ConfigKey.CUSTOM_HEARTBEAT_ID]).toBe(
          `${monitors[0].id}-${project}-${spaceId}`
        );
      }
    );

    apiTest(
      'project monitors - is able to decrypt monitor when updated after hydration',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);

        const found = await findByJourneyId(apiClient, monitors[0].id);

        const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        expect(res.body).toStrictEqual({
          updatedMonitors: [monitors[0].id],
          createdMonitors: [],
          failedMonitors: [],
        });

        // ensure that the monitor can still be decrypted
        await getMonitor(apiClient, editorHeaders, found[0].config_id);
      }
    );

    apiTest('project monitors - is able to enable and disable monitors', async ({ apiClient }) => {
      const project = `test-project-${uuidv4()}`;
      const monitors = makeMonitors(projectBrowserMonitorFixture);
      await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
      await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitors[0], enabled: false },
      ]);
      const found = await findByJourneyId(apiClient, monitors[0].id);
      expect(found[0].enabled).toBe(false);
    });

    apiTest(
      'project monitors - cannot update project monitors with read only privileges',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        const secondMonitor = {
          ...monitors[0],
          id: 'test-id-2',
          privateLocations: [testPrivateLocationName],
        };
        await pushProjectMonitors(apiClient, viewerHeaders, project, [monitors[0], secondMonitor], {
          statusCode: 403,
        });
      }
    );

    apiTest(
      'creates integration policies for project monitors with private locations',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);
        await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[0], privateLocations: [testPrivateLocationName] },
        ]);

        const found = await findByJourneyId(apiClient, monitors[0].id);
        const customHeartbeatId = found[0][ConfigKey.CUSTOM_HEARTBEAT_ID];
        const configId = found[0].config_id;

        const packagePolicy = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy?.name).toBe(
          `${monitors[0].id}-${project}-default-${testPrivateLocationName}`
        );
        expect(packagePolicy?.policy_id).toBe(testPolicyId);

        comparePolicies(
          packagePolicy,
          getTestProjectSyntheticsPolicy({
            inputs: {},
            name: `check if title is present-${testPrivateLocationName}`,
            id: customHeartbeatId,
            configId,
            projectId: project,
            locationId: testPolicyId,
            locationName: testPrivateLocationName,
            kibanaUrl: kibanaServerUrl,
          })
        );
      }
    );

    apiTest(
      'creates integration policies for project monitors with private locations - lightweight',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectHttpMonitorFixture);
        await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[1],
            'check.request.body': '${testGlobalParam}',
            privateLocations: [testPrivateLocationName],
          },
        ]);

        const found = await findByJourneyId(apiClient, monitors[1].id);
        const customHeartbeatId = found[0][ConfigKey.CUSTOM_HEARTBEAT_ID];
        const configId = found[0].config_id;

        const packagePolicy = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy?.name).toBe(
          `${monitors[1].id}-${project}-default-${testPrivateLocationName}`
        );
        expect(packagePolicy?.policy_id).toBe(testPolicyId);

        comparePolicies(
          packagePolicy,
          getTestProjectSyntheticsPolicyLightweight({
            inputs: {},
            name: 'My Monitor 3',
            id: customHeartbeatId,
            configId,
            projectId: project,
            locationName: testPrivateLocationName,
            locationId: testPolicyId,
            kibanaUrl: kibanaServerUrl,
          })
        );
      }
    );

    apiTest(
      'deletes integration policies for project monitors when private location is removed from the monitor - lightweight',
      async ({ apiClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const secondPrivateLocation =
          await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
        const monitors = makeMonitors(projectHttpMonitorFixture);

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[1],
            privateLocations: [testPrivateLocationName, secondPrivateLocation.label],
          },
        ]);

        const found = await findByJourneyId(apiClient, monitors[1].id);
        const customHeartbeatId = found[0][ConfigKey.CUSTOM_HEARTBEAT_ID];

        const packagePolicy = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy?.policy_id).toBe(testPolicyId);

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[1], privateLocations: [secondPrivateLocation.label] },
        ]);

        const packagePolicy2 = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy2).toBeUndefined();
      }
    );

    apiTest(
      'deletes integration policies for project monitors when private location is removed from the monitor',
      async ({ apiClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const secondPrivateLocation =
          await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
        const monitors = makeMonitors(projectBrowserMonitorFixture);

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[0],
            privateLocations: [testPrivateLocationName, secondPrivateLocation.label],
          },
        ]);

        const found = await findByJourneyId(apiClient, monitors[0].id);
        const customHeartbeatId = found[0][ConfigKey.CUSTOM_HEARTBEAT_ID];
        const configId = found[0].config_id;

        const packagePolicy = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy?.policy_id).toBe(testPolicyId);

        comparePolicies(
          packagePolicy,
          getTestProjectSyntheticsPolicy({
            inputs: {},
            name: `check if title is present-${testPrivateLocationName}`,
            id: customHeartbeatId,
            configId,
            projectId: project,
            locationId: testPolicyId,
            locationName: testPrivateLocationName,
            kibanaUrl: kibanaServerUrl,
          })
        );

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[0], privateLocations: [secondPrivateLocation.label] },
        ]);

        const packagePolicy2 = await findPackagePolicy(
          apiClient,
          `${customHeartbeatId}-${testPolicyId}`
        );
        expect(packagePolicy2).toBeUndefined();
      }
    );

    apiTest(
      'handles updating package policies when project monitors are updated',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectBrowserMonitorFixture);

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[0], privateLocations: [testPrivateLocationName] },
        ]);

        const found = await findByJourneyId(apiClient, monitors[0].id);
        const configId = found[0].config_id;
        const customHeartbeatId = found[0][ConfigKey.CUSTOM_HEARTBEAT_ID];
        const policyId = `${customHeartbeatId}-${testPolicyId}`;

        const packagePolicy = await findPackagePolicy(apiClient, policyId);
        expect(packagePolicy?.policy_id).toBe(testPolicyId);

        comparePolicies(
          packagePolicy,
          getTestProjectSyntheticsPolicy({
            inputs: {},
            name: `check if title is present-${testPrivateLocationName}`,
            id: customHeartbeatId,
            configId,
            projectId: project,
            locationId: testPolicyId,
            locationName: testPrivateLocationName,
            kibanaUrl: kibanaServerUrl,
          })
        );

        await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[0],
            namespace: 'custom_namespace',
            privateLocations: [testPrivateLocationName],
            enabled: false,
          },
        ]);

        const packagePolicy2 = await findPackagePolicy(apiClient, policyId);
        comparePolicies(
          packagePolicy2,
          getTestProjectSyntheticsPolicy({
            inputs: { enabled: { value: false, type: 'bool' } },
            name: `check if title is present-${testPrivateLocationName}`,
            id: customHeartbeatId,
            configId,
            projectId: project,
            locationId: testPolicyId,
            locationName: testPrivateLocationName,
            namespace: 'custom_namespace',
            kibanaUrl: kibanaServerUrl,
          })
        );
      }
    );

    apiTest('only allows 250 requests at a time', async ({ apiClient }) => {
      const project = `test-project-${uuidv4()}`;
      const baseMonitors = makeMonitors(projectBrowserMonitorFixture);
      const monitors = [];
      for (let i = 0; i < 251; i++) {
        monitors.push({ ...baseMonitors[0], id: `test-id-${i}`, name: `test-name-${i}` });
      }

      try {
        const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors, {
          statusCode: 400,
        });
        expect(res.body.message).toBe(REQUEST_TOO_LARGE);
      } finally {
        await pushProjectMonitors(apiClient, editorHeaders, project, baseMonitors);
      }
    });

    apiTest(
      'project monitors - cannot update a monitor of one type to another type',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const browserMonitors = makeMonitors(projectBrowserMonitorFixture);
        const httpMonitors = makeMonitors(projectHttpMonitorFixture);

        await pushProjectMonitors(apiClient, editorHeaders, project, browserMonitors);

        const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...httpMonitors[1], id: browserMonitors[0].id, maintenance_windows: [] },
        ]);
        expect(res.body).toStrictEqual({
          createdMonitors: [],
          updatedMonitors: [],
          failedMonitors: [
            {
              details: `Monitor ${browserMonitors[0].id} of type browser cannot be updated to type http. Please delete the monitor first and try again.`,
              payload: {
                'check.request': {
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  method: 'POST',
                },
                'check.response': {
                  body: { positive: ['${testLocal1}', 'saved'] },
                  status: [200],
                  json: [{ description: 'check status', expression: 'foo.bar == "myValue"' }],
                },
                enabled: false,
                hash: 'ekrjelkjrelkjre',
                id: browserMonitors[0].id,
                locations: [],
                maintenance_windows: [],
                privateLocations: [testPrivateLocationName],
                name: 'My Monitor 3',
                response: { include_body: 'always', include_body_max_bytes: 900 },
                'response.include_headers': false,
                schedule: 60,
                timeout: '80s',
                type: 'http',
                tags: 'tag2,tag2',
                urls: ['http://localhost:9200'],
                'ssl.verification_mode': 'strict',
                params: {
                  testGlobalParam2: 'testGlobalParamOverwrite',
                  testLocal1: 'testLocalParamsValue',
                },
                proxy_url: '${testGlobalParam2}',
                max_attempts: 2,
              },
              reason: 'Cannot update monitor to different type.',
            },
          ],
        });
      }
    );

    apiTest(
      'project monitors - handles alert config without adding arbitrary fields',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectHttpMonitorFixture);
        const testAlert = {
          status: { enabled: false, doesnotexit: true, tls: { enabled: true } },
        };
        await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitors[1], alert: testAlert },
        ]);
        const found = await findByJourneyId(apiClient, monitors[1].id);
        expect(found).toHaveLength(1);
        expect(found[0][ConfigKey.ALERT_CONFIG]).toStrictEqual({
          status: { enabled: testAlert.status.enabled },
          tls: { enabled: true },
        });
      }
    );

    apiTest('project monitors - handles sending invalid public location', async ({ apiClient }) => {
      const project = `test-project-${uuidv4()}`;
      const monitors = makeMonitors(projectHttpMonitorFixture);
      const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitors[1], locations: ['does not exist'], maintenance_windows: [] },
      ]);
      const body = res.body as {
        createdMonitors: string[];
        updatedMonitors: string[];
        failedMonitors: Array<{ id: string; reason: string; details: string; payload: unknown }>;
      };
      expect(body.createdMonitors).toStrictEqual([]);
      expect(body.updatedMonitors).toStrictEqual([]);
      expect(body.failedMonitors).toHaveLength(1);
      const [failed] = body.failedMonitors;
      expect(failed.id).toBe(monitors[1].id);
      expect(failed.reason).toBe(
        "Couldn't save or update monitor because of an invalid configuration."
      );
      expect(failed.details).toContain(
        "Invalid locations specified. Elastic managed Location(s) 'does not exist' not found."
      );
      expect(failed.payload).toStrictEqual({
        'check.request': {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        },
        'check.response': {
          body: { positive: ['${testLocal1}', 'saved'] },
          status: [200],
          json: [{ description: 'check status', expression: 'foo.bar == "myValue"' }],
        },
        enabled: false,
        hash: 'ekrjelkjrelkjre',
        id: monitors[1].id,
        locations: ['does not exist'],
        maintenance_windows: [],
        privateLocations: [testPrivateLocationName],
        name: 'My Monitor 3',
        response: { include_body: 'always', include_body_max_bytes: 900 },
        'response.include_headers': false,
        schedule: 60,
        'ssl.verification_mode': 'strict',
        tags: 'tag2,tag2',
        timeout: '80s',
        type: 'http',
        urls: ['http://localhost:9200'],
        params: {
          testGlobalParam2: 'testGlobalParamOverwrite',
          testLocal1: 'testLocalParamsValue',
        },
        proxy_url: '${testGlobalParam2}',
        max_attempts: 2,
      });
    });

    apiTest(
      'project monitors - handles sending invalid private locations',
      async ({ apiClient }) => {
        const project = `test-project-${uuidv4()}`;
        const monitors = makeMonitors(projectHttpMonitorFixture);
        const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[1],
            locations: [],
            privateLocations: ['does not exist'],
            maintenance_windows: [],
          },
        ]);
        const body = res.body as {
          createdMonitors: string[];
          updatedMonitors: string[];
          failedMonitors: Array<{ id: string; reason: string; details: string; payload: unknown }>;
        };
        expect(body.createdMonitors).toStrictEqual([]);
        expect(body.updatedMonitors).toStrictEqual([]);
        expect(body.failedMonitors).toHaveLength(1);
        const [failed] = body.failedMonitors;
        expect(failed.id).toBe(monitors[1].id);
        expect(failed.reason).toBe(
          "Couldn't save or update monitor because of an invalid configuration."
        );
        expect(failed.details).toContain(
          `Invalid locations specified. Private Location(s) 'does not exist' not found.`
        );
        expect(failed.payload).toStrictEqual({
          'check.request': {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
          },
          'check.response': {
            body: { positive: ['${testLocal1}', 'saved'] },
            status: [200],
            json: [{ description: 'check status', expression: 'foo.bar == "myValue"' }],
          },
          enabled: false,
          hash: 'ekrjelkjrelkjre',
          id: monitors[1].id,
          privateLocations: ['does not exist'],
          name: 'My Monitor 3',
          response: { include_body: 'always', include_body_max_bytes: 900 },
          'response.include_headers': false,
          schedule: 60,
          'ssl.verification_mode': 'strict',
          tags: 'tag2,tag2',
          timeout: '80s',
          type: 'http',
          urls: ['http://localhost:9200'],
          locations: [],
          maintenance_windows: [],
          params: {
            testGlobalParam2: 'testGlobalParamOverwrite',
            testLocal1: 'testLocalParamsValue',
          },
          proxy_url: '${testGlobalParam2}',
          max_attempts: 2,
        });
      }
    );

    apiTest('project monitors - handles no locations specified', async ({ apiClient }) => {
      const project = `test-project-${uuidv4()}`;
      const monitors = makeMonitors(projectHttpMonitorFixture);
      const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitors[1], privateLocations: [], locations: [], maintenance_windows: [] },
      ]);
      expect(res.body).toStrictEqual({
        createdMonitors: [],
        failedMonitors: [
          {
            details: 'You must add at least one location or private location to this monitor.',
            id: monitors[1].id,
            payload: {
              'check.request': {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                method: 'POST',
              },
              'check.response': {
                body: { positive: ['${testLocal1}', 'saved'] },
                status: [200],
                json: [{ description: 'check status', expression: 'foo.bar == "myValue"' }],
              },
              enabled: false,
              hash: 'ekrjelkjrelkjre',
              id: monitors[1].id,
              privateLocations: [],
              name: 'My Monitor 3',
              response: { include_body: 'always', include_body_max_bytes: 900 },
              'response.include_headers': false,
              schedule: 60,
              'ssl.verification_mode': 'strict',
              tags: 'tag2,tag2',
              timeout: '80s',
              type: 'http',
              urls: ['http://localhost:9200'],
              locations: [],
              maintenance_windows: [],
              params: {
                testGlobalParam2: 'testGlobalParamOverwrite',
                testLocal1: 'testLocalParamsValue',
              },
              proxy_url: '${testGlobalParam2}',
              max_attempts: 2,
            },
            reason: "Couldn't save or update monitor because of an invalid configuration.",
          },
        ],
        updatedMonitors: [],
      });
    });

    apiTest(
      'project monitors - cannot update project monitors when user does not have access to a space in multi space use case',
      async ({ apiClient, kbnClient, requestAuth }) => {
        const project = `test-project-${uuidv4()}`;
        const spaceId1 = await createSpace(kbnClient);
        const spaceId2 = await createSpace(kbnClient);

        const limitedRole: KibanaRole = {
          elasticsearch: { cluster: [], indices: [{ names: ['*'], privileges: ['all'] }] },
          kibana: [{ base: [], spaces: [spaceId1], feature: { uptime: ['all'] } }],
        };
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(limitedRole);
        const limitedHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, {
          Accept: 'application/json',
        });

        const monitors = makeMonitors(projectBrowserMonitorFixture);
        try {
          const res = await pushProjectMonitors(
            apiClient,
            limitedHeaders,
            project,
            [{ ...monitors[0], spaces: [spaceId1, spaceId2] }],
            { spaceId: spaceId1, statusCode: 403 }
          );
          expect(res.body.message).toBe(
            'This monitor is shared to spaces where you do not have update permissions. To save changes, either request access to those spaces or remove them from the monitor.'
          );
        } finally {
          await deleteByJourney(apiClient, monitors[0].id, project, spaceId1);
        }
      }
    );

    apiTest(
      'project monitors - cannot update project monitors when user does not have access to all spaces using * in spaces',
      async ({ apiClient, kbnClient, requestAuth }) => {
        const project = `test-project-${uuidv4()}`;
        const spaceId1 = await createSpace(kbnClient);
        await createSpace(kbnClient);

        const limitedRole: KibanaRole = {
          elasticsearch: { cluster: [], indices: [{ names: ['*'], privileges: ['all'] }] },
          kibana: [{ base: [], spaces: [spaceId1], feature: { uptime: ['all'] } }],
        };
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(limitedRole);
        const limitedHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, {
          Accept: 'application/json',
        });

        const monitors = makeMonitors(projectBrowserMonitorFixture);
        try {
          const res = await pushProjectMonitors(
            apiClient,
            limitedHeaders,
            project,
            [{ ...monitors[0], spaces: ['*'] }],
            { spaceId: spaceId1, statusCode: 403 }
          );
          expect(res.body.message).toBe(
            'This monitor is shared to spaces where you do not have update permissions. To save changes, either request access to those spaces or remove them from the monitor.'
          );
        } finally {
          await deleteByJourney(apiClient, monitors[0].id, project, spaceId1);
        }
      }
    );

    apiTest(
      'project monitors - user with access to all spaces can specify * in spaces and monitor is created in all spaces',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-project-${uuidv4()}`;
        const spaceId1 = await createSpace(kbnClient);
        await createSpace(kbnClient);

        const allSpacesPrivateLocation =
          await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(['*']);

        const monitorId = uuidv4();
        const baseMonitors = makeMonitors(projectHttpMonitorFixture);
        const monitor = {
          ...baseMonitors[1],
          privateLocations: [allSpacesPrivateLocation.label],
          id: monitorId,
          name: `All spaces Monitor ${monitorId}`,
          spaces: ['*'],
        };

        const res = await pushProjectMonitors(apiClient, editorHeaders, project, [monitor], {
          spaceId: spaceId1,
        });
        expect(res.body).toStrictEqual({
          updatedMonitors: [],
          createdMonitors: [monitorId],
          failedMonitors: [],
        });

        const soRes = await kbnClient.savedObjects.find<{ name?: string; journey_id?: string }>({
          type: syntheticsMonitorSavedObjectType,
        });
        const found = soRes.saved_objects.find((obj) => obj.attributes.journey_id === monitorId);
        expect(found != null).toBe(true);
        expect(found?.namespaces).toStrictEqual(['*']);
        expect(found?.attributes.name).toBe(monitor.name);
      }
    );
  }
);
