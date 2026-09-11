/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migrated from the FTR suite
 * `apis/synthetics/create_monitor_project_multi_space.ts`
 * (`CreateProjectMonitorsMultiSpace`).
 *
 * Covers creating/fetching/editing project monitors that span multiple spaces,
 * the legacy→multi-space recreation on edit, and the space-validation errors
 * (non-existent space, missing current spaceId).
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  legacySyntheticsMonitorTypeSingle,
  syntheticsMonitorSavedObjectType,
} from '../../../../../common/types/saved_objects';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { listMonitors } from '../../../common/fixtures/monitors';
import { pushProjectMonitors } from '../../../common/fixtures/project';
import { projectHttpMonitorFixture } from '../fixtures/data/project_http_monitor';

const MONITOR_SO_TYPES = [
  syntheticsMonitorSavedObjectType,
  legacySyntheticsMonitorTypeSingle,
  'ingest-package-policies',
];

apiTest.describe(
  'CreateProjectMonitorsMultiSpace',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let space1Id: string;

    /** A fresh legacy/multi-space monitor body cloned from the http fixture. */
    const makeMonitor = () => {
      const [base] = JSON.parse(JSON.stringify([projectHttpMonitorFixture.monitors[1]])) as Array<
        Record<string, any>
      >;
      const id = uuidv4();
      return { ...base, id, name: `Multi space Monitor ${id}` };
    };

    const findSoByJourneyId = async (
      kbnClient: KbnClient,
      type: string,
      journeyId: string
    ): Promise<
      { id: string; attributes: { name?: string }; namespaces?: string[] } | undefined
    > => {
      const res = await kbnClient.savedObjects.find<{ name?: string; journey_id?: string }>({
        type,
      });
      return res.saved_objects.find((so) => so.attributes.journey_id === journeyId) as
        | { id: string; attributes: { name?: string }; namespaces?: string[] }
        | undefined;
    };

    const fetchProjectMonitor = async (
      apiClient: ApiClientFixture,
      journeyId: string
    ): Promise<Array<Record<string, any>>> => {
      const filter = `${legacySyntheticsMonitorTypeSingle}.attributes.journey_id: ${journeyId}`;
      const res = await listMonitors(
        apiClient,
        editorHeaders,
        `internal=true&filter=${encodeURIComponent(filter)}`
      );
      return (res.body as { monitors: Array<Record<string, any>> }).monitors;
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();

      space1Id = `space1-${uuidv4()}`;
      await kbnClient.spaces.create({ id: space1Id, name: 'test space' });
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      await kbnClient.spaces.delete(space1Id).catch(() => {});
    });

    apiTest('should create a multi space monitor', async ({ apiClient, kbnClient }) => {
      const monitor = makeMonitor();
      const project = `legacy-project-${uuidv4()}`;

      const res = await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitor, spaces: ['default', space1Id] },
      ]);
      expect(res.body).toStrictEqual({
        updatedMonitors: [],
        createdMonitors: [monitor.id],
        failedMonitors: [],
      });

      const found = await findSoByJourneyId(
        kbnClient,
        syntheticsMonitorSavedObjectType,
        monitor.id
      );
      expect(found != null).toBe(true);
      expect([...(found?.namespaces ?? [])].sort()).toStrictEqual(['default', space1Id].sort());
      expect(found?.attributes.name).toBe(monitor.name);
    });

    apiTest('should fetch a multi space project monitor', async ({ apiClient }) => {
      const monitor = makeMonitor();
      const project = `legacy-project-${uuidv4()}`;

      await pushProjectMonitors(apiClient, editorHeaders, project, [
        { ...monitor, spaces: ['default', space1Id] },
      ]);

      const monitors = await fetchProjectMonitor(apiClient, monitor.id);
      expect(monitors).toHaveLength(1);
      expect([...monitors[0].spaces].sort()).toStrictEqual(['default', space1Id].sort());
      expect(monitors[0].journey_id).toBe(monitor.id);
      expect(monitors[0].name).toBe(monitor.name);
    });

    apiTest(
      'should edit a legacy project monitor and it should recreate multi space monitor',
      async ({ apiClient, kbnClient }) => {
        const monitor = makeMonitor();
        const project = `legacy-project-${uuidv4()}`;

        const createRes = await pushProjectMonitors(apiClient, editorHeaders, project, [monitor], {
          savedObjectType: legacySyntheticsMonitorTypeSingle,
        });
        expect(createRes.body).toStrictEqual({
          createdMonitors: [monitor.id],
          updatedMonitors: [],
          failedMonitors: [],
        });

        const editedName = `Multi space Monitor Edited ${monitor.id}`;
        const editRes = await pushProjectMonitors(apiClient, editorHeaders, project, [
          { ...monitor, name: editedName, spaces: ['default', space1Id] },
        ]);
        expect(editRes.body).toStrictEqual({
          updatedMonitors: [monitor.id],
          createdMonitors: [],
          failedMonitors: [],
        });

        const multiFound = await findSoByJourneyId(
          kbnClient,
          syntheticsMonitorSavedObjectType,
          monitor.id
        );
        expect(multiFound?.attributes.name).toBe(editedName);

        const legacyFound = await findSoByJourneyId(
          kbnClient,
          legacySyntheticsMonitorTypeSingle,
          monitor.id
        );
        expect(legacyFound).toBeUndefined();
      }
    );

    apiTest(
      'should return 404 if a monitor references a non-existent space',
      async ({ apiClient }) => {
        const monitor = makeMonitor();
        const project = `legacy-project-${uuidv4()}`;

        const res = await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitor, spaces: ['default', 'nonexistent-space'] }],
          { statusCode: 404 }
        );
        expect((res.body as { message: string }).message).toContain('Kibana space does not exist');
      }
    );

    apiTest(
      'should return error if monitor does not include current spaceId in its spaces',
      async ({ apiClient }) => {
        const monitor = makeMonitor();
        const project = `legacy-project-${uuidv4()}`;

        const res = await pushProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          [{ ...monitor, spaces: [space1Id] }],
          { statusCode: 400 }
        );
        expect((res.body as { message: string }).message).toContain(
          `Monitor ${monitor.name} does not include spaceId default in its spaces.`
        );
      }
    );
  }
);
