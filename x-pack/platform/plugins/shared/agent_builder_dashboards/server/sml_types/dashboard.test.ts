/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { DashboardPluginStart, DashboardState } from '@kbn/dashboard-plugin/server';
import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  attachmentDataToDashboardState,
} from '@kbn/agent-builder-dashboards-common';
import { DASHBOARD_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import { createDashboardSmlType } from './dashboard';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';

const dashboardAttachmentData: DashboardAttachmentData = {
  title: 'System Overview',
  description: 'Main dashboard for key metrics',
  panels: [
    {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'panel-1',
      grid: { x: 0, y: 0, w: 24, h: 15 },
      config: {
        attributes: {
          title: 'CPU Usage',
          visualizationType: 'lnsXY',
          state: {
            datasourceStates: {},
            filters: [],
            query: { language: 'kuery', query: '' },
            visualization: {},
          },
          references: [],
        },
      },
    },
    {
      id: 'section-1',
      title: 'Operations',
      collapsed: false,
      grid: { y: 20 },
      panels: [
        {
          type: 'markdown',
          id: 'panel-2',
          grid: { x: 24, y: 0, w: 24, h: 10 },
          config: {
            title: 'Summary',
            content: 'All systems nominal',
          },
        },
      ],
    },
  ],
};

const dashboardStateWithLensApi = {
  title: 'API Lens Dashboard',
  description: 'Dashboard with API-format lens panel',
  panels: [
    {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'panel-3',
      grid: { x: 0, y: 0, w: 24, h: 12 },
      config: {
        attributes: {
          type: 'lnsXY',
          title: 'Request Rate',
        },
      },
    },
  ],
} as unknown as DashboardState;

const createDashboardClient = ({
  id = 'dashboard-1',
  attachmentData = dashboardAttachmentData,
  data,
}: {
  id?: string;
  attachmentData?: DashboardAttachmentData;
  data?: DashboardState;
} = {}): jest.Mocked<DashboardPluginStart['client']> =>
  ({
    read: jest.fn().mockResolvedValue({
      id,
      data: data ?? attachmentDataToDashboardState(attachmentData),
      meta: {
        outcome: 'exactMatch',
        version: 'v1',
      },
    }),
  } as jest.Mocked<DashboardPluginStart['client']>);

const createLogger = (): Logger =>
  ({
    warn: jest.fn(),
  } as unknown as Logger);

const createSavedObjectsClient = () => ({} as never);

describe('dashboardSmlType', () => {
  it('equals DASHBOARD_KI_TYPE', () => {
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => createDashboardClient(),
    });

    expect(dashboardSmlType.id).toBe(DASHBOARD_KI_TYPE);
  });

  it('lists dashboards across all spaces', async () => {
    const finder = {
      find: jest.fn().mockReturnValue(
        (async function* () {
          yield {
            saved_objects: [
              {
                id: 'dashboard-1',
                updated_at: '2025-01-01T00:00:00.000Z',
                namespaces: ['default'],
              },
            ],
          };
        })()
      ),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const savedObjectsClient = {
      createPointInTimeFinder: jest.fn().mockReturnValue(finder),
    };
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => createDashboardClient(),
    });

    const pages = [];
    for await (const page of dashboardSmlType.list({
      savedObjectsClient: savedObjectsClient as never,
      esClient: {} as never,
      logger: createLogger(),
    })) {
      pages.push(page);
    }

    expect(savedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith({
      type: 'dashboard',
      perPage: 1000,
      namespaces: ['*'],
      fields: ['title'],
    });
    expect(pages).toEqual([
      [
        {
          id: 'dashboard-1',
          updatedAt: '2025-01-01T00:00:00.000Z',
          spaces: ['default'],
        },
      ],
    ]);
    expect(finder.close).toHaveBeenCalledTimes(1);
  });

  it('indexes one chunk per dashboard with deep metadata', async () => {
    const dashboardClient = createDashboardClient();
    const savedObjectsClient = createSavedObjectsClient();
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => dashboardClient,
    });

    const result = await dashboardSmlType.getSmlEntry('dashboard-1', {
      esClient: {} as never,
      logger: createLogger(),
      savedObjectsClient,
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'dashboard',
        title: 'System Overview',
      })
    );
    expect(result).not.toHaveProperty('permissions');
    expect(result?.content).toContain('System Overview');
    expect(result?.content).toContain('Main dashboard for key metrics');
    expect(result?.content).toContain('CPU Usage');
    expect(result?.content).toContain('Operations');
    expect(result?.content).toContain('2 panels');
    expect(result?.content).toContain('1 sections');
  });

  it('converts saved dashboards into dashboard attachments with origin', async () => {
    const dashboardClient = createDashboardClient();
    const savedObjectsClient = createSavedObjectsClient();
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => dashboardClient,
    });

    const result = await dashboardSmlType.toAttachment(
      {
        type: 'dashboard',
        title: 'System Overview',
        content: '...',
        attributes: {
          id: 'chunk-1',
          origin: { uri: 'dashboard://dashboard-1' },
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
          ingestion_method: 'crawled',
        },
        permissions: {
          kibana: {
            privileges: [{ space: 'default', name: ['ai_index:dashboard/read'], count: 1 }],
          },
        },
      },
      {
        request: {} as never,
        spaceId: 'default',
        savedObjectsClient,
      } as never
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: DASHBOARD_ATTACHMENT_TYPE,
        origin: 'dashboard-1',
        data: expect.objectContaining({
          title: 'System Overview',
          description: 'Main dashboard for key metrics',
        }),
      })
    );
    const attachmentData = result?.data as DashboardAttachmentData | undefined;

    expect(attachmentData?.panels).toHaveLength(2);
    expect(attachmentData?.panels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'panel-1',
          type: LENS_EMBEDDABLE_TYPE,
        }),
        expect.objectContaining({
          id: 'section-1',
          title: 'Operations',
          panels: [expect.objectContaining({ id: 'panel-2', type: 'markdown' })],
        }),
      ])
    );
  });

  it('falls back to generic panel storage when a lens panel is already in API format', async () => {
    const savedObjectsClient = createSavedObjectsClient();
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () =>
        createDashboardClient({
          id: 'dashboard-2',
          data: dashboardStateWithLensApi,
        }),
    });

    const result = await dashboardSmlType.toAttachment(
      {
        type: 'dashboard',
        title: 'API Lens Dashboard',
        content: '...',
        attributes: {
          id: 'chunk-2',
          origin: { uri: 'dashboard://dashboard-2' },
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
          ingestion_method: 'crawled',
        },
        permissions: {
          kibana: {
            privileges: [{ space: 'default', name: ['ai_index:dashboard/read'], count: 1 }],
          },
        },
      },
      {
        request: {} as never,
        spaceId: 'default',
        savedObjectsClient,
      } as never
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: DASHBOARD_ATTACHMENT_TYPE,
        origin: 'dashboard-2',
      })
    );
    const attachmentData = result?.data as DashboardAttachmentData | undefined;

    expect(attachmentData?.panels).toEqual([
      expect.objectContaining({
        id: 'panel-3',
        type: LENS_EMBEDDABLE_TYPE,
        config: expect.objectContaining({
          attributes: expect.objectContaining({
            type: 'lnsXY',
            title: 'Request Rate',
          }),
        }),
      }),
    ]);
  });

  it('getPermissions returns the ai_index:dashboard/read action', () => {
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => createDashboardClient(),
    });

    const permissions = dashboardSmlType.getPermissions!('dashboard-1', {
      esClient: {} as never,
      logger: createLogger(),
      savedObjectsClient: createSavedObjectsClient(),
    } as never);

    expect(permissions).toEqual({
      kibana: { privileges: { name: ['ai_index:dashboard/read'] } },
    });
  });

  it('creates requestHandlerContext from savedObjectsClient for SML reads', async () => {
    const dashboardClient = createDashboardClient();
    const savedObjectsClient = createSavedObjectsClient();
    const dashboardSmlType = createDashboardSmlType({
      getDashboardClient: async () => dashboardClient,
    });

    const result = await dashboardSmlType.getSmlEntry('dashboard-1', {
      esClient: {} as never,
      logger: createLogger(),
      savedObjectsClient,
    } as never);

    expect(result).toEqual(
      expect.objectContaining({ type: 'dashboard', title: 'System Overview' })
    );
  });
});
