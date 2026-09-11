/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migrated from the FTR suite
 * `apis/synthetics/create_monitor_project.ts` (`CreateProjectMonitors`).
 *
 * Covers pushing project monitors of every type (browser/http/tcp/icmp),
 * decryption-after-hydration, public/private location formatting, invalid
 * location handling, and the legacy (`synthetics-monitor`) project CRUD flow.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  legacySyntheticsMonitorTypeSingle,
  syntheticsMonitorSavedObjectType,
} from '../../../../../common/types/saved_objects';
import {
  PROFILE_VALUES_ENUM,
  PROFILES_MAP,
} from '../../../../../common/constants/monitor_defaults';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
} from '../../../common/fixtures';
import { deleteMonitors, getMonitor, listMonitors } from '../../../common/fixtures/monitors';
import { pushProjectMonitors } from '../../../common/fixtures/project';
import { projectBrowserMonitorFixture } from '../fixtures/data/project_browser_monitor';
import { projectHttpMonitorFixture } from '../fixtures/data/project_http_monitor';
import { projectTcpMonitorFixture } from '../fixtures/data/project_tcp_monitor';
import { projectIcmpMonitorFixture } from '../../../common/fixtures/data/project_icmp_monitor';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';

type ProjectMonitor = Record<string, any>;

const MONITOR_SO_TYPES = [
  syntheticsMonitorSavedObjectType,
  legacySyntheticsMonitorTypeSingle,
  'ingest-package-policies',
];

apiTest.describe(
  'CreateProjectMonitors',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocations: ScoutPrivateLocation[] = [];

    // Deep-clones a fixture monitor array (mirrors `getFixtureJson` returning a
    // fresh parse on every call) and assigns a fresh `id` to each monitor so
    // re-runs never collide on the stable journey ids (FTR `setUniqueIds`).
    const withUniqueIds = (monitors: readonly unknown[]): ProjectMonitor[] =>
      (JSON.parse(JSON.stringify(monitors)) as ProjectMonitor[]).map((monitor) => ({
        ...monitor,
        id: uuidv4(),
      }));

    /** Lists monitors filtered by `journey_id` and returns the raw monitors array. */
    const findByJourneyId = async (
      apiClient: ApiClientFixture,
      journeyId: string,
      type: string = syntheticsMonitorSavedObjectType,
      opts: { internal?: boolean } = {}
    ): Promise<Array<Record<string, any>>> => {
      const filter = `${type}.attributes.journey_id: ${journeyId}`;
      const query = `filter=${encodeURIComponent(filter)}${opts.internal ? '&internal=true' : ''}`;
      const res = await listMonitors(apiClient, editorHeaders, query);
      return (res.body as { monitors: Array<Record<string, any>> }).monitors;
    };

    /** Finds a saved object of `type` by its `journey_id` attribute (elevated). */
    const findSoByJourneyId = async (
      kbnClient: KbnClient,
      type: string,
      journeyId: string
    ): Promise<{ id: string; attributes: { name?: string } } | undefined> => {
      const res = await kbnClient.savedObjects.find<{ name?: string; journey_id?: string }>({
        type,
      });
      return res.saved_objects.find((so) => so.attributes.journey_id === journeyId) as
        | { id: string; attributes: { name?: string } }
        | undefined;
    };

    /** Deletes a project monitor by its journey id (looks up the config id first). */
    const deleteByJourneyId = async (apiClient: ApiClientFixture, journeyId: string) => {
      try {
        const monitors = await findByJourneyId(apiClient, journeyId);
        const configId = monitors[0]?.config_id;
        if (configId) {
          await deleteMonitors(apiClient, editorHeaders, [configId]);
        }
      } catch {
        // best-effort cleanup, mirrors the FTR `deleteMonitor` try/catch
      }
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });

      // One private location is enough — only the location-formatting test
      // references `privateLocations[0]` (FTR created two).
      privateLocations = [await apiServices.syntheticsPrivateLocations.addTestPrivateLocation()];
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
    });

    apiTest.afterAll(async ({ kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest('project monitors - handles browser monitors', async ({ apiClient }) => {
      const monitors = withUniqueIds(projectBrowserMonitorFixture.monitors);
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
          { internal: true }
        );

        expect(decrypted).toStrictEqual({
          __ui: {
            script_source: {
              file_name: '',
              is_generated_script: false,
            },
          },
          config_id: decrypted.config_id,
          custom_heartbeat_id: `${journeyId}-${project}-default`,
          enabled: true,
          alert: {
            status: { enabled: true },
            tls: { enabled: true },
          },
          'filter_journeys.match': 'check if title is present',
          'filter_journeys.tags': [],
          form_monitor_type: 'multistep',
          ignore_https_errors: false,
          certificate_error_spki_allowlist: [],
          journey_id: journeyId,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'check if title is present',
          namespace: 'default',
          origin: 'project',
          original_space: 'default',
          playwright_options: '{"headless":true,"chromiumSandbox":false}',
          playwright_text_assertion: '',
          project_id: project,
          params: '',
          revision: 1,
          schedule: {
            number: '10',
            unit: 'm',
          },
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
      }
    });

    apiTest('project monitors - handles http monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = withUniqueIds(projectHttpMonitorFixture.monitors);
      const successfulMonitors = [monitors[1]];
      const project = `test-project-${uuidv4()}`;

      try {
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
            { internal: true }
          );

          expect(decrypted).toStrictEqual({
            __ui: {
              is_tls_enabled: isTLSEnabled,
            },
            'check.request.method': 'POST',
            'check.response.status': ['200'],
            config_id: decrypted.config_id,
            custom_heartbeat_id: `${journeyId}-${project}-default`,
            'check.response.body.negative': [],
            'check.response.body.positive': ['${testLocal1}', 'saved'],
            'check.response.json': [
              { description: 'check status', expression: 'foo.bar == "myValue"' },
            ],
            'check.response.headers': {},
            proxy_url: '${testGlobalParam2}',
            'check.request.body': {
              type: 'text',
              value: '',
            },
            params: JSON.stringify({
              testLocal1: 'testLocalParamsValue',
              testGlobalParam2: 'testGlobalParamOverwrite',
            }),
            'check.request.headers': {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            enabled: false,
            alert: {
              status: { enabled: true },
              tls: { enabled: true },
            },
            form_monitor_type: 'http',
            journey_id: journeyId,
            locations: [LOCAL_PUBLIC_LOCATION],
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
            schedule: {
              number: '60',
              unit: 'm',
            },
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
            maintenance_windows: monitor.maintenanceWindows || [],
            spaces: ['default'],
            updated_at: decrypted.updated_at,
            created_at: decrypted.created_at,
          });
        }
      } finally {
        await Promise.all(
          successfulMonitors.map((monitor) => deleteByJourneyId(apiClient, monitor.id))
        );
      }
    });

    apiTest('project monitors - handles tcp monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = withUniqueIds(projectTcpMonitorFixture.monitors);
      const successfulMonitors = [monitors[0], monitors[1]];
      const project = `test-project-${uuidv4()}`;

      try {
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
            { internal: true }
          );

          expect(decrypted).toStrictEqual({
            __ui: {
              is_tls_enabled: isTLSEnabled,
            },
            config_id: decrypted.config_id,
            custom_heartbeat_id: `${journeyId}-${project}-default`,
            'check.receive': '',
            'check.send': '',
            enabled: true,
            alert: {
              status: { enabled: true },
              tls: { enabled: true },
            },
            form_monitor_type: 'tcp',
            journey_id: journeyId,
            locations: [LOCAL_PUBLIC_LOCATION],
            name: monitor.name,
            namespace: 'default',
            origin: 'project',
            original_space: 'default',
            project_id: project,
            revision: 1,
            schedule: {
              number: '1',
              unit: 'm',
            },
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
            maintenance_windows: monitor.maintenanceWindows || [],
            spaces: ['default'],
            updated_at: decrypted.updated_at,
            created_at: decrypted.created_at,
          });
        }
      } finally {
        await Promise.all(
          successfulMonitors.map((monitor) => deleteByJourneyId(apiClient, monitor.id))
        );
      }
    });

    apiTest('project monitors - handles icmp monitors', async ({ apiClient, kbnClient }) => {
      const kibanaVersion = await kbnClient.version.get();
      const monitors = withUniqueIds(projectIcmpMonitorFixture.monitors);
      const successfulMonitors = [monitors[0], monitors[1]];
      const project = `test-project-${uuidv4()}`;

      try {
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
            { internal: true }
          );

          expect(decrypted).toStrictEqual({
            config_id: decrypted.config_id,
            custom_heartbeat_id: `${journeyId}-${project}-default`,
            enabled: true,
            alert: {
              status: { enabled: true },
              tls: { enabled: true },
            },
            form_monitor_type: 'icmp',
            journey_id: journeyId,
            locations: [LOCAL_PUBLIC_LOCATION],
            name: monitor.name,
            namespace: 'default',
            origin: 'project',
            original_space: 'default',
            project_id: project,
            revision: 1,
            schedule: {
              number: '1',
              unit: 'm',
            },
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
            maintenance_windows: monitor.maintenanceWindows || [],
            spaces: ['default'],
          });
        }
      } finally {
        await Promise.all(
          successfulMonitors.map((monitor) => deleteByJourneyId(apiClient, monitor.id))
        );
      }
    });

    apiTest(
      'project monitors - is able to decrypt monitor when updated after hydration',
      async ({ apiClient }) => {
        const monitors = withUniqueIds(projectBrowserMonitorFixture.monitors);
        const project = `test-project-${uuidv4()}`;
        try {
          await pushProjectMonitors(apiClient, editorHeaders, project, monitors);

          const found = await findByJourneyId(apiClient, monitors[0].id);

          const res = await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
          expect(res.body).toStrictEqual({
            updatedMonitors: [monitors[0].id],
            createdMonitors: [],
            failedMonitors: [],
          });

          // ensure that monitor can still be decrypted
          await getMonitor(apiClient, editorHeaders, found[0].config_id);
        } finally {
          await Promise.all(monitors.map((monitor) => deleteByJourneyId(apiClient, monitor.id)));
        }
      }
    );

    apiTest(
      'handles location formatting for both private and public locations',
      async ({ apiClient }) => {
        const monitors = withUniqueIds(projectBrowserMonitorFixture.monitors);
        const project = `test-project-${uuidv4()}`;
        try {
          await pushProjectMonitors(apiClient, editorHeaders, project, [
            { ...monitors[0], privateLocations: [privateLocations[0].label] },
          ]);

          for (const monitor of monitors) {
            const found = await findByJourneyId(
              apiClient,
              monitor.id,
              syntheticsMonitorSavedObjectType,
              {
                internal: true,
              }
            );
            expect(found[0].locations).toStrictEqual([
              {
                id: 'dev',
                label: 'Dev Service',
                geo: { lat: 0, lon: 0 },
                isServiceManaged: true,
              },
              {
                label: privateLocations[0].label,
                isServiceManaged: false,
                agentPolicyId: privateLocations[0].agentPolicyId,
                id: privateLocations[0].id,
                geo: {
                  lat: 0,
                  lon: 0,
                },
              },
            ]);
          }
        } finally {
          await Promise.all(monitors.map((monitor) => deleteByJourneyId(apiClient, monitor.id)));
        }
      }
    );

    apiTest('project monitors - handles sending invalid public location', async ({ apiClient }) => {
      const monitors = withUniqueIds(projectHttpMonitorFixture.monitors);
      const project = `test-project-${uuidv4()}`;
      try {
        const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
          {
            ...monitors[1],
            maintenance_windows: [],
            locations: ['does not exist'],
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
          "Invalid locations specified. Elastic managed Location(s) 'does not exist' not found."
        );
        expect(failed.payload).toStrictEqual({
          'check.request': {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            method: 'POST',
          },
          'check.response': {
            body: {
              positive: ['${testLocal1}', 'saved'],
            },
            status: [200],
            json: [
              {
                description: 'check status',
                expression: 'foo.bar == "myValue"',
              },
            ],
          },
          enabled: false,
          hash: 'ekrjelkjrelkjre',
          id: monitors[1].id,
          locations: ['does not exist'],
          name: 'My Monitor 3',
          response: {
            include_body: 'always',
            include_body_max_bytes: 900,
          },
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
          maintenance_windows: [],
          max_attempts: 2,
        });
      } finally {
        await deleteByJourneyId(apiClient, monitors[1].id);
      }
    });

    // --- Legacy project monitor CRUD (savedObjectType=synthetics-monitor) ---

    apiTest('should create a legacy project monitor', async ({ apiClient, kbnClient }) => {
      const legacyProject = `legacy-project-${uuidv4()}`;
      const legacyMonitorId = uuidv4();
      const [base] = withUniqueIds(projectHttpMonitorFixture.monitors).slice(1);
      const legacyMonitor = {
        ...base,
        id: legacyMonitorId,
        name: `Legacy Monitor ${legacyMonitorId}`,
      };

      const res = await pushProjectMonitors(
        apiClient,
        editorHeaders,
        legacyProject,
        [legacyMonitor],
        {
          savedObjectType: legacySyntheticsMonitorTypeSingle,
        }
      );
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: [legacyMonitorId],
        failedMonitors: [],
      });

      const found = await findSoByJourneyId(
        kbnClient,
        legacySyntheticsMonitorTypeSingle,
        legacyMonitorId
      );
      expect(found != null).toBe(true);
      expect(found?.attributes.name).toBe(`Legacy Monitor ${legacyMonitorId}`);
    });

    apiTest('should fetch a legacy project monitor', async ({ apiClient }) => {
      const legacyProject = `legacy-project-${uuidv4()}`;
      const legacyMonitorId = uuidv4();
      const [base] = withUniqueIds(projectHttpMonitorFixture.monitors).slice(1);
      const legacyMonitor = {
        ...base,
        id: legacyMonitorId,
        name: `Legacy Monitor ${legacyMonitorId}`,
      };

      await pushProjectMonitors(apiClient, editorHeaders, legacyProject, [legacyMonitor], {
        savedObjectType: legacySyntheticsMonitorTypeSingle,
      });

      const found = await findByJourneyId(
        apiClient,
        legacyMonitorId,
        legacySyntheticsMonitorTypeSingle,
        { internal: true }
      );
      expect(found).toHaveLength(1);
      expect(found[0].journey_id).toBe(legacyMonitorId);
      expect(found[0].name).toBe(`Legacy Monitor ${legacyMonitorId}`);
    });

    apiTest('should edit a legacy project monitor', async ({ apiClient, kbnClient }) => {
      const legacyProject = `legacy-project-${uuidv4()}`;
      const legacyMonitorId = uuidv4();
      const [base] = withUniqueIds(projectHttpMonitorFixture.monitors).slice(1);
      const legacyMonitor = {
        ...base,
        id: legacyMonitorId,
        name: `Legacy Monitor ${legacyMonitorId}`,
      };

      await pushProjectMonitors(apiClient, editorHeaders, legacyProject, [legacyMonitor], {
        savedObjectType: legacySyntheticsMonitorTypeSingle,
      });

      const editedName = `Legacy Monitor Edited ${legacyMonitorId}`;
      const res = await pushProjectMonitors(
        apiClient,
        editorHeaders,
        legacyProject,
        [{ ...legacyMonitor, name: editedName }],
        { savedObjectType: legacySyntheticsMonitorTypeSingle }
      );
      expect(res.body).toStrictEqual({
        updatedMonitors: [legacyMonitorId],
        createdMonitors: [],
        failedMonitors: [],
      });

      const found = await findSoByJourneyId(
        kbnClient,
        legacySyntheticsMonitorTypeSingle,
        legacyMonitorId
      );
      expect(found?.attributes.name).toBe(editedName);
    });

    apiTest('should delete a legacy project monitor', async ({ apiClient, kbnClient }) => {
      const legacyProject = `legacy-project-${uuidv4()}`;
      const legacyMonitorId = uuidv4();
      const [base] = withUniqueIds(projectHttpMonitorFixture.monitors).slice(1);
      const legacyMonitor = {
        ...base,
        id: legacyMonitorId,
        name: `Legacy Monitor ${legacyMonitorId}`,
      };

      await pushProjectMonitors(apiClient, editorHeaders, legacyProject, [legacyMonitor], {
        savedObjectType: legacySyntheticsMonitorTypeSingle,
      });

      const found = await findSoByJourneyId(
        kbnClient,
        legacySyntheticsMonitorTypeSingle,
        legacyMonitorId
      );
      expect(found != null).toBe(true);

      const res = await apiClient.delete(
        `api/synthetics/project/${legacyProject}/monitors/_bulk_delete`,
        {
          headers: editorHeaders,
          body: { monitors: [legacyMonitorId] },
          responseType: 'json',
        }
      );
      expect(res).toHaveStatusCode(200);

      const foundAfter = await findSoByJourneyId(
        kbnClient,
        legacySyntheticsMonitorTypeSingle,
        legacyMonitorId
      );
      expect(foundAfter).toBeUndefined();
    });
  }
);
