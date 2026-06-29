/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { overviewDashboardId, syncAgentBuilderOverviewDashboard } from './install_dashboard';
import {
  AGENT_BUILDER_OVERVIEW_DASHBOARD_ID,
  AGENT_BUILDER_TRACES_NAMESPACE_PLACEHOLDER,
} from './constants';

// ---------------------------------------------------------------------------
// overviewDashboardId
// ---------------------------------------------------------------------------

describe('overviewDashboardId', () => {
  it('returns a stable id composed of the base constant and the space id', () => {
    expect(overviewDashboardId('default')).toBe(`${AGENT_BUILDER_OVERVIEW_DASHBOARD_ID}-default`);
    expect(overviewDashboardId('my-space')).toBe(`${AGENT_BUILDER_OVERVIEW_DASHBOARD_ID}-my-space`);
  });
});

// ---------------------------------------------------------------------------
// syncAgentBuilderOverviewDashboard
// ---------------------------------------------------------------------------

describe('syncAgentBuilderOverviewDashboard', () => {
  const logger = loggerMock.create();

  const PER_PAGE = 100; // must match the constant in install_dashboard.ts

  function buildImporterMock() {
    return {
      import: jest.fn().mockResolvedValue({
        success: true,
        successCount: 1,
        errors: [],
        warnings: [],
        successResults: [],
      }),
      resolveImportErrors: jest.fn(),
    };
  }

  function buildCoreStart(overrides: { spaceObjects?: Array<{ id: string }> } = {}) {
    const { spaceObjects = [] } = overrides;

    const soClient = savedObjectsClientMock.create();
    soClient.delete.mockResolvedValue({} as any);

    const spaceRepo = savedObjectsClientMock.create();
    spaceRepo.find.mockImplementation(async ({ page = 1 }: { page?: number } = {}) => {
      const start = (page - 1) * PER_PAGE;
      const batch = spaceObjects.slice(start, start + PER_PAGE).map((s) => ({
        id: s.id,
        type: 'space' as const,
        references: [] as never[],
        attributes: {},
        score: 0,
      }));
      return {
        saved_objects: batch,
        total: spaceObjects.length,
        per_page: PER_PAGE,
        page,
      };
    });

    const importerMock = buildImporterMock();

    const coreStart = {
      savedObjects: {
        createInternalRepository: jest.fn((types?: string[]) =>
          types?.includes('space') ? (spaceRepo as any) : (soClient as any)
        ),
        createImporter: jest.fn(() => importerMock),
      },
    };

    return { coreStart, soClient, spaceRepo, importerMock };
  }

  it('installs the dashboard when tracing is enabled', async () => {
    const { coreStart, importerMock } = buildCoreStart();

    await syncAgentBuilderOverviewDashboard(coreStart as any, true, logger);

    expect(importerMock.import).toHaveBeenCalledWith(
      expect.objectContaining({
        overwrite: true,
        managed: true,
        createNewCopies: false,
      })
    );
  });

  it('removes the dashboard when tracing is disabled', async () => {
    const { coreStart, soClient, importerMock } = buildCoreStart();

    await syncAgentBuilderOverviewDashboard(coreStart as any, false, logger);

    expect(soClient.delete).toHaveBeenCalledWith(
      'dashboard',
      expect.stringContaining('default'),
      expect.any(Object)
    );
    expect(importerMock.import).not.toHaveBeenCalled();
  });

  it('fetches all spaces across multiple pages', async () => {
    // 250 spaces → 3 pages of 100, 100, 50
    const manySpaces = Array.from({ length: 250 }, (_, i) => ({ id: `space-${i}` }));
    const { coreStart, spaceRepo } = buildCoreStart({ spaceObjects: manySpaces });

    // disabled → skip install logic; we only care about the fetch
    await syncAgentBuilderOverviewDashboard(coreStart as any, false, logger);

    expect(spaceRepo.find).toHaveBeenCalledTimes(3);
    expect(spaceRepo.find).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }));
    expect(spaceRepo.find).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    expect(spaceRepo.find).toHaveBeenNthCalledWith(3, expect.objectContaining({ page: 3 }));
  });

  it('replaces the namespace placeholder with the space id in imported objects', async () => {
    const { coreStart, importerMock } = buildCoreStart();

    await syncAgentBuilderOverviewDashboard(coreStart as any, true, logger);

    const importCall = importerMock.import.mock.calls[0][0];
    const objects: unknown[] = [];
    for await (const chunk of importCall.readStream) {
      objects.push(chunk);
    }

    const stringified = JSON.stringify(objects);
    expect(stringified).not.toContain(AGENT_BUILDER_TRACES_NAMESPACE_PLACEHOLDER);
  });

  it('sets the dashboard id to the space-scoped id in the imported object', async () => {
    const { coreStart, importerMock } = buildCoreStart();

    await syncAgentBuilderOverviewDashboard(coreStart as any, true, logger);

    const importCall = importerMock.import.mock.calls[0][0];
    const objects: unknown[] = [];
    for await (const chunk of importCall.readStream) {
      objects.push(chunk);
    }

    const dashboard = (objects as Array<{ type: string; id: string }>).find(
      (o) => o.type === 'dashboard'
    );
    expect(dashboard?.id).toBe(overviewDashboardId('default'));
  });
});
