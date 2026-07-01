/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { syntheticsMonitorSavedObjectType } from '../../../../common/types/saved_objects';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../fixtures';
import {
  bulkUpdateMonitors,
  enableSynthetics,
  getMonitor,
  listMonitors,
  saveMonitorInternal,
} from '../fixtures/monitors';
import { pushProjectMonitors } from '../fixtures/project';
import { httpMonitorFixture } from '../fixtures/data/http_monitor';
import type { ScoutPrivateLocation } from '../services/synthetics_private_location_api_service';

interface BulkUpdateResult {
  id: string;
  updated: boolean;
  error?: string;
}

interface SavedUiMonitor extends Record<string, unknown> {
  config_id: string;
  name: string;
  tags: string[];
  urls: string;
  schedule: { number: string; unit: string };
}

/**
 * Exercises `PUT /api/synthetics/monitors/_bulk_update` through the full stack:
 * real ESO round-trip (the AAD regression reads the monitor back via internal
 * GET, which decrypts; if `mergeSourceMonitor` ever stops carrying prev AAD
 * attrs through, that GET turns into a 500), real Fleet for the private-location
 * monitor, and the project-monitor rejection path through the registered route.
 */
apiTest.describe(
  'UpdateMonitorBulkAPI',
  { tag: ['@local-stateful-classic', '@local-serverless-observability_complete'] },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;
    const httpMonitorJson: Record<string, unknown> = {
      ...httpMonitorFixture,
      locations: [LOCAL_PUBLIC_LOCATION],
    };

    const createUiMonitor = async (
      apiClient: ApiClientFixture,
      overrides: Record<string, unknown> = {}
    ): Promise<SavedUiMonitor> => {
      const monitor = {
        ...httpMonitorJson,
        name: `bulk-patch-${uuidv4()}`,
        ...overrides,
      };
      const res = await saveMonitorInternal(apiClient, editorHeaders, monitor);
      return res.body as SavedUiMonitor;
    };

    const findByJourneyId = async (
      apiClient: ApiClientFixture,
      journeyId: string
    ): Promise<string | undefined> => {
      const filter = `${syntheticsMonitorSavedObjectType}.attributes.journey_id: "${journeyId}"`;
      const res = await listMonitors(
        apiClient,
        editorHeaders,
        `filter=${encodeURIComponent(filter)}`
      );
      const monitors = (res.body as { monitors: Array<{ config_id: string }> }).monitors;
      return monitors[0]?.config_id;
    };

    const resultFor = (results: BulkUpdateResult[], id: string) =>
      results.find((entry) => entry.id === id);

    /** Build a `{ updates }` body that applies one shared patch to many ids. */
    const uniform = (ids: string[], attributes: Record<string, unknown>) => ({
      updates: ids.map((id) => ({ id, attributes })),
    });

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);
      privateLocation = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    // --- happy path ----------------------------------------------------------

    apiTest('partially patches a single monitor with a public location', async ({ apiClient }) => {
      const monitor = await createUiMonitor(apiClient, { enabled: true });

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([monitor.config_id], { enabled: false })
      );

      expect(res.body.result).toStrictEqual([{ id: monitor.config_id, updated: true }]);
      expect(res.body.errors).toBeUndefined();

      const { body: refreshed } = await getMonitor(apiClient, editorHeaders, monitor.config_id);
      expect((refreshed as { enabled: boolean }).enabled).toBe(false);
      // Untouched AAD-bound fields must round-trip unchanged.
      expect((refreshed as { name: string }).name).toBe(monitor.name);
      expect((refreshed as { tags: string[] }).tags).toStrictEqual(monitor.tags);
      expect((refreshed as { schedule: unknown }).schedule).toStrictEqual(monitor.schedule);
    });

    apiTest('partially patches a monitor with a private location', async ({ apiClient }) => {
      const monitor = await createUiMonitor(apiClient, {
        locations: [privateLocation],
      });

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([monitor.config_id], { enabled: false })
      );

      expect(res.body.result).toStrictEqual([{ id: monitor.config_id, updated: true }]);

      const { body: refreshed } = await getMonitor(apiClient, editorHeaders, monitor.config_id);
      expect((refreshed as { enabled: boolean }).enabled).toBe(false);
      expect((refreshed as { locations: Array<{ id: string }> }).locations[0].id).toBe(
        privateLocation.id
      );
    });

    apiTest('patches multiple monitors in one request', async ({ apiClient }) => {
      const m1 = await createUiMonitor(apiClient);
      const m2 = await createUiMonitor(apiClient);

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([m1.config_id, m2.config_id], { tags: ['bulk-patched'] })
      );

      expect(res.body.result).toStrictEqual([
        { id: m1.config_id, updated: true },
        { id: m2.config_id, updated: true },
      ]);

      const refreshedA = await getMonitor(apiClient, editorHeaders, m1.config_id);
      const refreshedB = await getMonitor(apiClient, editorHeaders, m2.config_id);
      expect((refreshedA.body as { tags: string[] }).tags).toStrictEqual(['bulk-patched']);
      expect((refreshedB.body as { tags: string[] }).tags).toStrictEqual(['bulk-patched']);
    });

    apiTest('applies a different patch to each id in one request', async ({ apiClient }) => {
      const m1 = await createUiMonitor(apiClient, { enabled: true, tags: ['t1'] });
      const m2 = await createUiMonitor(apiClient, { enabled: true, tags: ['t2'] });

      const res = await bulkUpdateMonitors(apiClient, editorHeaders, {
        updates: [
          { id: m1.config_id, attributes: { enabled: false } },
          { id: m2.config_id, attributes: { tags: ['only-m2'] } },
        ],
      });

      expect(res.body.result).toStrictEqual([
        { id: m1.config_id, updated: true },
        { id: m2.config_id, updated: true },
      ]);

      const { body: r1 } = await getMonitor(apiClient, editorHeaders, m1.config_id);
      const { body: r2 } = await getMonitor(apiClient, editorHeaders, m2.config_id);
      // m1 got enabled:false, its tags untouched.
      expect((r1 as { enabled: boolean }).enabled).toBe(false);
      expect((r1 as { tags: string[] }).tags).toStrictEqual(['t1']);
      // m2 got new tags, its enabled untouched.
      expect((r2 as { tags: string[] }).tags).toStrictEqual(['only-m2']);
      expect((r2 as { enabled: boolean }).enabled).toBe(true);
    });

    // --- AAD regression (decrypt-merge-encrypt safety) -----------------------

    apiTest(
      'keeps the monitor decryptable after a partial patch on an AAD field',
      async ({ apiClient }) => {
        /*
         * Headline guarantee of this endpoint. Create a monitor with encrypted
         * secrets (`username`, `password`) bound by AAD to a set of plaintext
         * attributes. Patch only `enabled` (itself in the AAD set). Re-fetch
         * via internal GET, which goes through `monitorConfigRepository.getDecrypted`
         * and throws a 500 if AAD ever drifts from the encrypted value during
         * our merge — i.e. if `mergeSourceMonitor` stops carrying prev AAD attrs
         * through, this turns the GET below into a 500.
         */
        const monitor = await createUiMonitor(apiClient, {
          username: 'aad-test-user',
          password: 'aad-test-pass',
          tags: ['aad', 'regression'],
        });

        await bulkUpdateMonitors(
          apiClient,
          editorHeaders,
          uniform([monitor.config_id], { enabled: false })
        );

        const { body: refreshed } = await getMonitor(apiClient, editorHeaders, monitor.config_id, {
          internal: true,
        });

        const decrypted = refreshed as {
          enabled: boolean;
          username: string;
          password: string;
          tags: string[];
          urls: string;
        };
        expect(decrypted.enabled).toBe(false);
        expect(decrypted.username).toBe('aad-test-user');
        expect(decrypted.password).toBe('aad-test-pass');
        expect(decrypted.tags).toStrictEqual(['aad', 'regression']);
        expect(decrypted.urls).toBe(monitor.urls);
      }
    );

    apiTest('rejects project-origin monitors with an origin error', async ({ apiClient }) => {
      const projectName = `bulk-patch-project-${uuidv4()}`;
      const journeyId = `bulk-patch-journey-${uuidv4()}`;

      await pushProjectMonitors(apiClient, editorHeaders, projectName, [
        {
          type: 'http',
          id: journeyId,
          name: 'project monitor for bulk patch test',
          urls: ['https://elastic.co'],
          schedule: 5,
          locations: ['dev'],
          privateLocations: [],
        },
      ]);

      const projectMonitorId = await findByJourneyId(apiClient, journeyId);
      expect(projectMonitorId).toBeDefined();

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([projectMonitorId!], { enabled: false })
      );

      const results = res.body.result as BulkUpdateResult[];
      expect(results).toHaveLength(1);
      expect(results[0].updated).toBe(false);
      expect(results[0].error).toMatch(/origin/i);

      const refreshed = await getMonitor(apiClient, editorHeaders, projectMonitorId!);
      expect((refreshed.body as { enabled: boolean }).enabled).toBe(true);
    });

    apiTest(
      'rejects schedules outside the allowed set with a validation error',
      async ({ apiClient }) => {
        const monitor = await createUiMonitor(apiClient);

        const res = await bulkUpdateMonitors(
          apiClient,
          editorHeaders,
          uniform([monitor.config_id], { schedule: { number: '7', unit: 'm' } })
        );

        const results = res.body.result as BulkUpdateResult[];
        expect(results).toHaveLength(1);
        expect(results[0].updated).toBe(false);
        expect(results[0].error).toMatch(/schedule/i);

        const refreshed = await getMonitor(apiClient, editorHeaders, monitor.config_id);
        expect((refreshed.body as { schedule: unknown }).schedule).toStrictEqual({
          number: '5',
          unit: 'm',
        });
      }
    );

    apiTest(
      'rejects a patch with an unknown field and leaves the monitor unchanged',
      async ({ apiClient }) => {
        const monitor = await createUiMonitor(apiClient);

        const res = await bulkUpdateMonitors(apiClient, editorHeaders, {
          updates: [{ id: monitor.config_id, attributes: { enabled: false, notARealField: 'x' } }],
        });

        const results = res.body.result as BulkUpdateResult[];
        expect(results).toHaveLength(1);
        expect(results[0].updated).toBe(false);
        expect(results[0].error).toMatch(/invalid monitor key/i);

        // the valid field in the same patch must not be applied either
        const refreshed = await getMonitor(apiClient, editorHeaders, monitor.config_id);
        expect((refreshed.body as { enabled: boolean }).enabled).toBe(true);
      }
    );

    // --- name uniqueness -----------------------------------------------------

    apiTest(
      'rejects a name patch that collides with another existing monitor',
      async ({ apiClient }) => {
        const existing = await createUiMonitor(apiClient);
        const target = await createUiMonitor(apiClient);

        const res = await bulkUpdateMonitors(
          apiClient,
          editorHeaders,
          uniform([target.config_id], { name: existing.name })
        );

        const results = res.body.result as BulkUpdateResult[];
        expect(results).toHaveLength(1);
        expect(results[0].updated).toBe(false);
        expect(results[0].error).toMatch(/already exists/i);

        // the rejected patch must leave the monitor's name untouched
        const { body: refreshed } = await getMonitor(apiClient, editorHeaders, target.config_id);
        expect((refreshed as { name: string }).name).toBe(target.name);
      }
    );

    apiTest('renames a monitor to a brand-new unique name', async ({ apiClient }) => {
      const monitor = await createUiMonitor(apiClient);
      const newName = `bulk-patch-renamed-${uuidv4()}`;

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([monitor.config_id], { name: newName })
      );

      expect(res.body.result).toStrictEqual([{ id: monitor.config_id, updated: true }]);

      const { body: refreshed } = await getMonitor(apiClient, editorHeaders, monitor.config_id);
      expect((refreshed as { name: string }).name).toBe(newName);
    });

    apiTest('allows a patch that keeps the monitor its own current name', async ({ apiClient }) => {
      // The uniqueness check must exclude the monitor being patched, so a
      // no-op rename alongside another field change should succeed.
      const monitor = await createUiMonitor(apiClient, { tags: ['before'] });

      const res = await bulkUpdateMonitors(
        apiClient,
        editorHeaders,
        uniform([monitor.config_id], { name: monitor.name, tags: ['after'] })
      );

      expect(res.body.result).toStrictEqual([{ id: monitor.config_id, updated: true }]);

      const { body: refreshed } = await getMonitor(apiClient, editorHeaders, monitor.config_id);
      expect((refreshed as { name: string }).name).toBe(monitor.name);
      expect((refreshed as { tags: string[] }).tags).toStrictEqual(['after']);
    });

    apiTest(
      'rejects every entry when two updates set the same name in one batch',
      async ({ apiClient }) => {
        const m1 = await createUiMonitor(apiClient);
        const m2 = await createUiMonitor(apiClient);
        const sharedName = `bulk-patch-shared-${uuidv4()}`;

        const res = await bulkUpdateMonitors(
          apiClient,
          editorHeaders,
          uniform([m1.config_id, m2.config_id], { name: sharedName })
        );

        const results = res.body.result as BulkUpdateResult[];
        expect(results).toHaveLength(2);
        for (const entry of results) {
          expect(entry.updated).toBe(false);
          expect(entry.error).toMatch(/duplicate monitor name/i);
        }

        // neither monitor may be renamed when the batch is internally ambiguous
        const { body: r1 } = await getMonitor(apiClient, editorHeaders, m1.config_id);
        const { body: r2 } = await getMonitor(apiClient, editorHeaders, m2.config_id);
        expect((r1 as { name: string }).name).toBe(m1.name);
        expect((r2 as { name: string }).name).toBe(m2.name);
      }
    );

    apiTest('isolates a name conflict to the offending id', async ({ apiClient }) => {
      const existing = await createUiMonitor(apiClient);
      const conflicting = await createUiMonitor(apiClient);
      const valid = await createUiMonitor(apiClient);
      const newName = `bulk-patch-isolated-${uuidv4()}`;

      const res = await bulkUpdateMonitors(apiClient, editorHeaders, {
        updates: [
          // collides with an untouched existing monitor -> per-id error
          { id: conflicting.config_id, attributes: { name: existing.name } },
          // unique name -> applied normally
          { id: valid.config_id, attributes: { name: newName } },
        ],
      });

      const results = res.body.result as BulkUpdateResult[];
      expect(resultFor(results, conflicting.config_id)!.updated).toBe(false);
      expect(resultFor(results, conflicting.config_id)!.error).toMatch(/already exists/i);
      expect(resultFor(results, valid.config_id)).toStrictEqual({
        id: valid.config_id,
        updated: true,
      });

      const { body: refreshedConflicting } = await getMonitor(
        apiClient,
        editorHeaders,
        conflicting.config_id
      );
      const { body: refreshedValid } = await getMonitor(apiClient, editorHeaders, valid.config_id);
      expect((refreshedConflicting as { name: string }).name).toBe(conflicting.name);
      expect((refreshedValid as { name: string }).name).toBe(newName);
    });
  }
);
