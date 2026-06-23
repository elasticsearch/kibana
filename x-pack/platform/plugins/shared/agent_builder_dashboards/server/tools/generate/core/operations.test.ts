/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  AttachmentPanel,
  DashboardAttachmentData,
  DashboardSection,
} from '@kbn/agent-builder-dashboards-common';
import { isSection } from '@kbn/agent-builder-dashboards-common';
import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown/server';
import type { PanelContentAttempt } from './resolve_panel';
import type { ResolvePanelContent } from './operations/panels';
import {
  executeDashboardOperations,
  dashboardOperationSchema,
  type DashboardOperation,
} from './operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from './failure_types';

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const waitForNextEventLoopTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const getSections = (panels: DashboardAttachmentData['panels']): DashboardSection[] =>
  panels.filter(isSection);

const getPanelsOnly = (panels: DashboardAttachmentData['panels']): AttachmentPanel[] =>
  panels.filter((p): p is AttachmentPanel => !isSection(p));

describe('executeDashboardOperations', () => {
  const logger = createMockLogger();
  const createLensPanel = (id: string, gridY = 0): AttachmentPanel => ({
    type: LENS_EMBEDDABLE_TYPE,
    id,
    config: { type: 'metric' },
    grid: { x: 0, y: gridY, w: 24, h: 9 },
  });

  const createMarkdownPanel = (
    id: string,
    content: string,
    grid: AttachmentPanel['grid'] = { x: 0, y: 0, w: 48, h: 5 }
  ): AttachmentPanel => ({
    id,
    type: MARKDOWN_EMBEDDABLE_TYPE,
    config: { content },
    grid,
  });

  const createSection = (
    id: string,
    title: string,
    gridY: number,
    panels: AttachmentPanel[] = []
  ): DashboardSection => ({
    id,
    title,
    collapsed: false,
    grid: { y: gridY },
    panels,
  });

  const createResolvedPanelContent = (
    panelContent: Pick<AttachmentPanel, 'type' | 'config'>
  ): PanelContentAttempt => ({
    type: 'success',
    panelContent,
  });

  const createResolvePanelContent = (
    resultsByIdentifier: Record<string, PanelContentAttempt> = {}
  ): ResolvePanelContent => {
    return async ({ identifier }) =>
      resultsByIdentifier[identifier] ??
      createResolvedPanelContent({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'metric' } });
  };

  it('executes operations in order', async () => {
    const baseDashboardData: DashboardAttachmentData = {
      title: 'Original title',
      description: 'Original description',
      panels: [
        {
          ...createLensPanel('existing-panel'),
        },
      ],
    };

    const operations: DashboardOperation[] = [
      { operation: 'set_metadata', title: 'Updated title' },
      { operation: 'remove_panels', panelIds: ['existing-panel'] },
      {
        operation: 'add_panels',
        panels: [
          {
            source: 'config',
            type: 'vis',
            config: { type: 'metric' },
            grid: { x: 0, y: 0, w: 24, h: 9 },
          },
          {
            source: 'config',
            type: 'markdown',
            config: { content: '### Updated summary' },
            grid: { x: 0, y: 9, w: 48, h: 5 },
          },
        ],
      },
    ];

    const result = await executeDashboardOperations({
      dashboardData: baseDashboardData,
      operations,
      logger,
    });

    expect(result.dashboardData.title).toBe('Updated title');
    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        grid: { x: 0, y: 9, w: 48, h: 5 },
      }),
    ]);
  });

  it('adds config-source panels successfully', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 0, y: 9, w: 12, h: 5 },
            },
          ],
        },
      ],
      logger,
    });

    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 9, w: 12, h: 5 },
      }),
    ]);
    expect(result.failures).toEqual([]);
  });

  it('adds mixed panel kinds in input order across top-level and section targets', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [createSection('section-a', 'Section A', 8)],
      },
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'markdown',
              config: { content: '### Summary' },
              grid: { x: 0, y: 0, w: 24, h: 4 },
            },
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              sectionId: 'section-a',
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
            {
              source: 'request',
              type: 'vis',
              query: 'show total requests',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 0, y: 9, w: 24, h: 9 },
            },
            {
              source: 'request',
              type: 'vis',
              query: 'show p95 latency',
              sectionId: 'section-a',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show total requests': createResolvedPanelContent({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
        }),
        'show p95 latency': {
          type: 'failure',
          failure: {
            type: 'add_panels',
            identifier: 'show p95 latency',
            error: 'ES|QL generation failed',
          },
        },
      }),
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Summary' },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 9, w: 24, h: 9 },
      }),
    ]);
    expect(getSections(result.dashboardData.panels)[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_panels',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
  });

  it('preserves dashboard metadata while mutating panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Existing title',
        description: 'Existing description',
        panels: [createSection('section-1', 'Section 1', 10)],
      },
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 0, y: 0, w: 12, h: 5 },
            },
          ],
        },
      ],
      logger,
    });

    const sections = getSections(result.dashboardData.panels);
    expect(sections).toEqual([
      {
        id: 'section-1',
        title: 'Section 1',
        collapsed: false,
        grid: { y: 10 },
        panels: [],
      },
    ]);
    expect(result.dashboardData.panels).toHaveLength(2); // 1 section + 1 panel
  });

  it('adds an empty section with generated sectionId and default collapsed=false', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
        },
      ],
      logger,
    });

    const sections = getSections(result.dashboardData.panels);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      id: expect.any(String),
      title: 'Overview',
      collapsed: false,
      grid: { y: 12 },
      panels: [],
    });
  });

  it('adds a section with inline visualization panels in a single operation', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show total requests',
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
            {
              source: 'request',
              type: 'vis',
              query: 'show error rate',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show total requests': createResolvedPanelContent({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
        }),
        'show error rate': createResolvedPanelContent({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'bar' },
        }),
      }),
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);

    expect(panelsOnly).toEqual([]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      id: expect.any(String),
      title: 'Overview',
      collapsed: false,
      grid: { y: 12 },
      panels: [
        expect.objectContaining({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        }),
        expect.objectContaining({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'bar' },
          grid: { x: 24, y: 0, w: 24, h: 9 },
        }),
      ],
    });
  });

  it('records inline visualization failures when adding a section and keeps successful panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show total requests',
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
            {
              source: 'request',
              type: 'vis',
              query: 'show p95 latency',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show total requests': createResolvedPanelContent({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
        }),
        'show p95 latency': {
          type: 'failure',
          failure: {
            type: 'add_section',
            identifier: 'show p95 latency',
            error: 'ES|QL generation failed',
          },
        },
      }),
    });

    const sections = getSections(result.dashboardData.panels);

    expect(sections).toHaveLength(1);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_section',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
  });

  it('adds non-visualization section panels without invoking the visualization resolver', async () => {
    const resolvePanelContent = jest.fn<
      ReturnType<ResolvePanelContent>,
      Parameters<ResolvePanelContent>
    >();

    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            {
              source: 'config',
              type: 'markdown',
              config: { content: '### Section Summary' },
              grid: { x: 0, y: 0, w: 24, h: 4 },
            },
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    expect(resolvePanelContent).not.toHaveBeenCalled();
    expect(getSections(result.dashboardData.panels)[0].panels).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Section Summary' },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
    ]);
  });

  it('resolves inline panels for multiple section creations in parallel', async () => {
    const firstSectionPanel = createDeferred<PanelContentAttempt>();
    const secondSectionPanel = createDeferred<PanelContentAttempt>();
    const resolvePanelContent = jest.fn<
      ReturnType<ResolvePanelContent>,
      Parameters<ResolvePanelContent>
    >(async ({ nlQuery }) => {
      if (nlQuery === 'show total requests') {
        return firstSectionPanel.promise;
      }

      return secondSectionPanel.promise;
    });

    const resultPromise = executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show total requests',
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
          ],
        },
        {
          operation: 'add_section',
          title: 'Errors',
          grid: { y: 1 },
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show error rate',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    await Promise.resolve();

    expect(resolvePanelContent).toHaveBeenCalledTimes(2);
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'vis',
        operationType: 'add_section',
        identifier: 'show total requests',
      })
    );
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'vis',
        operationType: 'add_section',
        identifier: 'show error rate',
      })
    );

    secondSectionPanel.resolve(
      createResolvedPanelContent({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'bar' },
      })
    );
    firstSectionPanel.resolve(
      createResolvedPanelContent({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
      })
    );

    const result = await resultPromise;

    expect(getSections(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        title: 'Overview',
        panels: [expect.objectContaining({ config: { type: 'metric' } })],
      }),
      expect.objectContaining({
        title: 'Errors',
        panels: [expect.objectContaining({ config: { type: 'bar' } })],
      }),
    ]);
  });

  it('pre-resolves top-level visualization creations alongside section creations', async () => {
    const sectionPanel = createDeferred<PanelContentAttempt>();
    const topLevelPanel = createDeferred<PanelContentAttempt>();
    const resolvePanelContent = jest.fn<
      ReturnType<ResolvePanelContent>,
      Parameters<ResolvePanelContent>
    >(async ({ nlQuery }) => {
      if (nlQuery === 'show total requests') {
        return sectionPanel.promise;
      }

      return topLevelPanel.promise;
    });

    const resultPromise = executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [],
      },
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show total requests',
              grid: { x: 0, y: 0, w: 24, h: 9 },
            },
          ],
        },
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'request',
              type: 'vis',
              query: 'show error rate',
              grid: { x: 0, y: 1, w: 24, h: 9 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    await Promise.resolve();

    expect(resolvePanelContent).toHaveBeenCalledTimes(2);
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationType: 'add_section',
        identifier: 'show total requests',
      })
    );
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationType: 'add_panels',
        identifier: 'show error rate',
      })
    );

    topLevelPanel.resolve(
      createResolvedPanelContent({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'bar' },
      })
    );
    sectionPanel.resolve(
      createResolvedPanelContent({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
      })
    );

    const result = await resultPromise;

    expect(getSections(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        title: 'Overview',
        panels: [expect.objectContaining({ config: { type: 'metric' } })],
      }),
    ]);
    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({ config: { type: 'bar' } }),
    ]);
  });

  it('throws once up front when visualization creation operations are present without a resolver', async () => {
    await expect(
      executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [],
        },
        operations: [
          {
            operation: 'add_section',
            title: 'Overview',
            grid: { y: 0 },
            panels: [
              {
                source: 'request',
                type: 'vis',
                query: 'show total requests',
                grid: { x: 0, y: 0, w: 24, h: 9 },
              },
            ],
          },
          {
            operation: 'add_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                query: 'show error rate',
                grid: { x: 24, y: 0, w: 24, h: 9 },
              },
            ],
          },
        ],
        logger,
      })
    ).rejects.toThrow('Inline panel resolver is required for panel creation operations.');
  });

  it('adds config-source panels into a target section when sectionId is provided', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [createSection('section-a', 'Section A', 8)],
      },
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'vis',
              config: { type: 'metric' },
              sectionId: 'section-a',
              grid: { x: 12, y: 0, w: 12, h: 5 },
            },
          ],
        },
      ],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);
    expect(panelsOnly).toEqual([]);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 12, y: 0, w: 12, h: 5 },
      }),
    ]);
  });

  it('removes section and promotes panels when panelAction=promote', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [
          createLensPanel('top-1', 0),
          createSection('section-a', 'Section A', 20, [
            createLensPanel('section-a-1', 0),
            createLensPanel('section-a-2', 9),
          ]),
        ],
      },
      operations: [{ operation: 'remove_section', id: 'section-a', panelAction: 'promote' }],
      logger,
    });
    const sections = getSections(result.dashboardData.panels);
    expect(sections).toHaveLength(0);
    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({ id: 'top-1', grid: { x: 0, y: 0, w: 24, h: 9 } }),
      expect.objectContaining({ id: 'section-a-1', grid: { x: 0, y: 9, w: 24, h: 9 } }),
      expect.objectContaining({ id: 'section-a-2', grid: { x: 0, y: 18, w: 24, h: 9 } }),
    ]);
  });

  it('removes section and deletes contained panels when panelAction=delete', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [
          createLensPanel('top-1'),
          createSection('section-a', 'Section A', 10, [createLensPanel('section-a-1', 0)]),
        ],
      },
      operations: [{ operation: 'remove_section', id: 'section-a', panelAction: 'delete' }],
      logger,
    });

    const sections = getSections(result.dashboardData.panels);
    expect(sections).toHaveLength(0);
    expect(result.dashboardData.panels).toEqual([expect.objectContaining({ id: 'top-1' })]);
  });

  it('removes matching panelIds from top-level and section panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [
          createLensPanel('top-1'),
          createSection('section-a', 'Section A', 8, [
            createLensPanel('section-a-1', 0),
            createLensPanel('section-a-2', 9),
          ]),
        ],
      },
      operations: [{ operation: 'remove_panels', panelIds: ['section-a-1', 'top-1'] }],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);
    expect(panelsOnly).toEqual([]);
    expect(sections).toEqual([
      {
        id: 'section-a',
        title: 'Section A',
        collapsed: false,
        grid: { y: 8 },
        panels: [expect.objectContaining({ id: 'section-a-2' })],
      },
    ]);
  });

  it('adds markdown panel into a target section when sectionId is provided', async () => {
    const result = await executeDashboardOperations({
      dashboardData: {
        title: 'Test dashboard',
        description: 'Description',
        panels: [createSection('section-a', 'Section A', 0)],
      },
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'config',
              type: 'markdown',
              config: { content: '### Section Summary' },
              grid: { x: 0, y: 0, w: 24, h: 4 },
              sectionId: 'section-a',
            },
          ],
        },
      ],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);
    expect(panelsOnly).toEqual([]);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Section Summary' },
        grid: { x: 0, y: 0, w: 24, h: 4 },
      }),
    ]);
  });

  describe('update_panel_layouts', () => {
    it('updates panel grid without changing its current location', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [
            createSection('section-a', 'Section A', 0, [createLensPanel('section-panel-1', 0)]),
          ],
        },
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: [
              {
                panelId: 'section-panel-1',
                grid: { x: 12, y: 4, w: 12, h: 6 },
              },
            ],
          },
        ],
        logger,
      });

      const sections = getSections(result.dashboardData.panels);
      expect(sections[0].panels).toEqual([
        expect.objectContaining({
          id: 'section-panel-1',
          grid: { x: 12, y: 4, w: 12, h: 6 },
          config: { type: 'metric' },
        }),
      ]);
    });

    it('moves a top-level panel into a section', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [createLensPanel('top-1'), createSection('section-a', 'Section A', 10)],
        },
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: [
              {
                panelId: 'top-1',
                sectionId: 'section-a',
                grid: { x: 24, y: 0, w: 24, h: 9 },
              },
            ],
          },
        ],
        logger,
      });

      const panelsOnly = getPanelsOnly(result.dashboardData.panels);
      const sections = getSections(result.dashboardData.panels);

      expect(panelsOnly).toEqual([]);
      expect(sections[0].panels).toEqual([
        expect.objectContaining({
          id: 'top-1',
          grid: { x: 24, y: 0, w: 24, h: 9 },
          config: { type: 'metric' },
        }),
      ]);
    });

    it('promotes a section panel to the top level when sectionId is null', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [
            createSection('section-a', 'Section A', 0, [createLensPanel('section-panel-1', 0)]),
          ],
        },
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: [
              {
                panelId: 'section-panel-1',
                sectionId: null,
                grid: { x: 0, y: 20, w: 24, h: 9 },
              },
            ],
          },
        ],
        logger,
      });

      const panelsOnly = getPanelsOnly(result.dashboardData.panels);
      const sections = getSections(result.dashboardData.panels);

      expect(sections[0].panels).toEqual([]);
      expect(panelsOnly).toEqual([
        expect.objectContaining({
          id: 'section-panel-1',
          grid: { x: 0, y: 20, w: 24, h: 9 },
          config: { type: 'metric' },
        }),
      ]);
    });

    it('records a failure when the target panel is missing', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [],
        },
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: [{ panelId: 'missing-panel', grid: { x: 0, y: 0, w: 24, h: 9 } }],
          },
        ],
        logger,
      });

      expect(result.failures).toEqual([
        {
          type: 'update_panel_layouts',
          identifier: 'missing-panel',
          error: 'Panel "missing-panel" not found.',
        },
      ]);
    });
  });

  describe('inline visualization operations', () => {
    it('creates inline visualization panels at the top level and inside sections', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createSection('section-a', 'Section A', 0)],
        },
        operations: [
          {
            operation: 'add_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                query: 'show total requests',
                grid: { x: 0, y: 0, w: 24, h: 9 },
              },
              {
                source: 'request',
                type: 'vis',
                query: 'show error rate',
                sectionId: 'section-a',
                grid: { x: 24, y: 0, w: 24, h: 9 },
              },
            ],
          },
        ],
        logger,
        resolvePanelContent: createResolvePanelContent({
          'show total requests': createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
          }),
          'show error rate': createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'bar' },
          }),
        }),
      });

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      const sections = getSections(result.dashboardData.panels);

      expect(topLevelPanels).toEqual([
        expect.objectContaining({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        }),
      ]);
      expect(sections[0].panels).toEqual([
        expect.objectContaining({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'bar' },
          grid: { x: 24, y: 0, w: 24, h: 9 },
        }),
      ]);
    });

    it('edits inline visualization panels while preserving id and grid', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [
            createLensPanel('panel-1', 5),
            createSection('section-a', 'Section A', 0, [createLensPanel('section-panel-1', 0)]),
          ],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'turn this into a bar chart',
              },
              {
                source: 'request',
                type: 'vis',
                panelId: 'section-panel-1',
                query: 'turn this into a line chart',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent: createResolvePanelContent({
          'panel-1': createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'bar' },
          }),
          'section-panel-1': createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'line' },
          }),
        }),
      });

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      const sections = getSections(result.dashboardData.panels);

      expect(topLevelPanels[0]).toEqual(
        expect.objectContaining({
          id: 'panel-1',
          grid: { x: 0, y: 5, w: 24, h: 9 },
          config: { type: 'bar' },
        })
      );
      expect(sections[0].panels[0]).toEqual(
        expect.objectContaining({
          id: 'section-panel-1',
          grid: { x: 0, y: 0, w: 24, h: 9 },
          config: { type: 'line' },
        })
      );
    });

    it('resolves repeated visualization edits against the latest panel state', async () => {
      const seenConfigSteps: string[] = [];

      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createLensPanel('panel-1', 5)],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'make this a bar chart',
              },
            ],
          },
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'now make this a line chart',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent: async (params) => {
          const { nlQuery } = params;
          const config = params.existingPanel?.config as
            | { attributes?: { testStep?: string }; testStep?: string }
            | undefined;
          const configStep = config?.attributes?.testStep ?? config?.testStep ?? 'initial';
          seenConfigSteps.push(configStep);

          if (nlQuery === 'make this a bar chart') {
            return createResolvedPanelContent({
              type: LENS_EMBEDDABLE_TYPE,
              config: { type: 'metric', testStep: 'after-first-edit' },
            });
          }

          return createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: {
              type: 'metric',
              testStep: configStep === 'after-first-edit' ? 'after-second-edit' : 'stale-edit',
            },
          });
        },
      });

      expect(seenConfigSteps).toEqual(['initial', 'after-first-edit']);
      expect(getPanelsOnly(result.dashboardData.panels)[0]).toEqual(
        expect.objectContaining({
          id: 'panel-1',
          config: { type: 'metric', testStep: 'after-second-edit' },
          grid: { x: 0, y: 5, w: 24, h: 9 },
        })
      );
    });

    it('does not resolve visualization edits for panels removed earlier in the sequence', async () => {
      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >(async () =>
        createResolvedPanelContent({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } })
      );

      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createLensPanel('panel-1', 5)],
        },
        operations: [
          { operation: 'remove_panels', panelIds: ['panel-1'] },
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'make this a bar chart',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(getPanelsOnly(result.dashboardData.panels)).toEqual([]);
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: 'Panel "panel-1" not found.',
        },
      ]);
    });

    it('skips failed inline visualization resolutions and records the failure', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [],
        },
        operations: [
          {
            operation: 'add_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                query: 'show total requests',
                grid: { x: 0, y: 0, w: 24, h: 9 },
              },
              {
                source: 'request',
                type: 'vis',
                query: 'show p95 latency',
                grid: { x: 24, y: 0, w: 24, h: 9 },
              },
            ],
          },
        ],
        logger,
        resolvePanelContent: createResolvePanelContent({
          'show total requests': createResolvedPanelContent({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
          }),
          'show p95 latency': {
            type: 'failure',
            failure: {
              type: 'add_panels',
              identifier: 'show p95 latency',
              error: 'ES|QL generation failed',
            },
          },
        }),
      });

      expect(getPanelsOnly(result.dashboardData.panels)).toHaveLength(1);
      expect(result.failures).toEqual([
        {
          type: 'add_panels',
          identifier: 'show p95 latency',
          error: 'ES|QL generation failed',
        },
      ]);
    });

    it('records a failure when editing a non-lens panel inline', async () => {
      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [
            {
              type: 'aiOpsLogRateAnalysis',
              id: 'panel-1',
              config: { seriesType: 'log_rate' },
              grid: { x: 0, y: 5, w: 24, h: 9 },
            },
          ],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              { source: 'request', type: 'vis', panelId: 'panel-1', query: 'refine this analysis' },
            ],
          },
        ],
        logger,
        resolvePanelContent: createResolvePanelContent({
          'panel-1': {
            type: 'failure',
            failure: {
              type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
              identifier: 'panel-1',
              error:
                'Panel "panel-1" with type "aiOpsLogRateAnalysis" is not supported for inline visualization editing.',
            },
          },
        }),
      });

      expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
        expect.objectContaining({
          id: 'panel-1',
          type: 'aiOpsLogRateAnalysis',
          config: { seriesType: 'log_rate' },
          grid: { x: 0, y: 5, w: 24, h: 9 },
        }),
      ]);
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error:
            'Panel "panel-1" with type "aiOpsLogRateAnalysis" is not supported for inline visualization editing.',
        },
      ]);
    });

    it('resolves multiple panel edits in one edit_panels op in parallel', async () => {
      const deferredByPanelId = new Map<
        string,
        ReturnType<typeof createDeferred<PanelContentAttempt>>
      >([
        ['panel-1', createDeferred<PanelContentAttempt>()],
        ['panel-2', createDeferred<PanelContentAttempt>()],
      ]);

      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >(({ identifier }) => {
        const deferred = deferredByPanelId.get(identifier);
        if (!deferred) {
          throw new Error(`Unexpected identifier "${identifier}" in test resolver`);
        }
        return deferred.promise;
      });

      const operationPromise = executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createLensPanel('panel-1', 0), createLensPanel('panel-2', 9)],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'make this a bar chart',
              },
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-2',
                query: 'make this a line chart',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      // Gives the operation a chance to start both parallel resolver calls.
      await waitForNextEventLoopTurn();

      expect(resolvePanelContent).toHaveBeenCalledTimes(2);

      deferredByPanelId
        .get('panel-1')!
        .resolve(
          createResolvedPanelContent({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } })
        );
      deferredByPanelId
        .get('panel-2')!
        .resolve(
          createResolvedPanelContent({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'line' } })
        );

      const result = await operationPromise;

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      expect(topLevelPanels[0]).toEqual(
        expect.objectContaining({ id: 'panel-1', config: { type: 'bar' } })
      );
      expect(topLevelPanels[1]).toEqual(
        expect.objectContaining({ id: 'panel-2', config: { type: 'line' } })
      );
      expect(result.failures).toEqual([]);
    });

    it('records a failure for each occurrence when a panelId is duplicated within one op', async () => {
      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >(async ({ identifier }) =>
        createResolvedPanelContent({
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'bar', identifier },
        })
      );

      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createLensPanel('panel-1', 0), createLensPanel('panel-2', 9)],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              { source: 'request', type: 'vis', panelId: 'panel-1', query: 'first edit' },
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-2',
                query: 'edit a different panel',
              },
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'second edit of same panel',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      const duplicateError =
        'Panel "panel-1" appears multiple times in this edit_panels operation. Edit each panel at most once per operation.';

      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: duplicateError,
        },
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: duplicateError,
        },
      ]);

      // The duplicated panel must not be touched; the non-duplicated panel still resolves.
      expect(resolvePanelContent).toHaveBeenCalledTimes(1);
      expect(resolvePanelContent).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'panel-2' })
      );

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      expect(topLevelPanels[0]).toEqual(
        expect.objectContaining({ id: 'panel-1', config: { type: 'metric' } })
      );
      expect(topLevelPanels[1]).toEqual(
        expect.objectContaining({
          id: 'panel-2',
          config: { type: 'bar', identifier: 'panel-2' },
        })
      );
    });

    it('edits a markdown panel content in place by panelId', async () => {
      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >();

      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createMarkdownPanel('md-1', 'old text')],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'config',
                type: 'markdown',
                panelId: 'md-1',
                config: { content: '### Updated summary' },
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([]);

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      expect(topLevelPanels[0]).toEqual(
        expect.objectContaining({
          id: 'md-1',
          type: MARKDOWN_EMBEDDABLE_TYPE,
          config: { content: '### Updated summary' },
          grid: { x: 0, y: 0, w: 48, h: 5 },
        })
      );
    });

    it('records a failure when a markdown config-source edit targets a non-markdown panel', async () => {
      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >();

      const result = await executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createLensPanel('panel-1', 0)],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'config',
                type: 'markdown',
                panelId: 'panel-1',
                config: { content: 'new text' },
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: `Panel "panel-1" with type "${LENS_EMBEDDABLE_TYPE}" cannot be edited as markdown. Use source: "request" for ES|QL-backed Lens panels.`,
        },
      ]);

      // Lens panel must be left untouched
      expect(getPanelsOnly(result.dashboardData.panels)[0]).toEqual(
        expect.objectContaining({
          id: 'panel-1',
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
        })
      );
    });

    it('mixes markdown and visualization edits in one op, parallelizing only the visualization resolves', async () => {
      const deferred = createDeferred<PanelContentAttempt>();
      const resolvePanelContent = jest.fn<
        ReturnType<ResolvePanelContent>,
        Parameters<ResolvePanelContent>
      >(() => deferred.promise);

      const operationPromise = executeDashboardOperations({
        dashboardData: {
          title: 'Test',
          description: 'Desc',
          panels: [createMarkdownPanel('md-1', 'old text'), createLensPanel('panel-1', 5)],
        },
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'config',
                type: 'markdown',
                panelId: 'md-1',
                config: { content: '### New summary' },
              },
              {
                source: 'request',
                type: 'vis',
                panelId: 'panel-1',
                query: 'turn into a bar chart',
              },
            ],
          },
        ],
        logger,
        resolvePanelContent,
      });

      // Gives the operation a chance to subscribe to the visualization resolve.
      await waitForNextEventLoopTurn();

      expect(resolvePanelContent).toHaveBeenCalledTimes(1);
      expect(resolvePanelContent).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'panel-1' })
      );

      deferred.resolve(
        createResolvedPanelContent({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } })
      );

      const result = await operationPromise;
      expect(result.failures).toEqual([]);

      const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
      expect(topLevelPanels[0]).toEqual(
        expect.objectContaining({
          id: 'md-1',
          config: { content: '### New summary' },
        })
      );
      expect(topLevelPanels[1]).toEqual(
        expect.objectContaining({ id: 'panel-1', config: { type: 'bar' } })
      );
    });
  });

  it('throws when add_panels markdown item references an invalid sectionId', async () => {
    await expect(
      executeDashboardOperations({
        dashboardData: {
          title: 'Test dashboard',
          description: 'Description',
          panels: [],
        },
        operations: [
          {
            operation: 'add_panels',
            panels: [
              {
                source: 'config',
                type: 'markdown',
                config: { content: '### Summary' },
                grid: { x: 0, y: 0, w: 48, h: 5 },
                sectionId: 'nonexistent-section',
              },
            ],
          },
        ],
        logger,
      })
    ).rejects.toThrow('Section "nonexistent-section" not found.');
  });

  it('accepts a markdown config-source panel with content and optional settings', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'markdown',
          config: { content: '## Hi', settings: { open_links_in_new_tab: true } },
          grid: { x: 0, y: 0, w: 48, h: 5 },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a markdown config-source panel whose config is missing content', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'markdown',
          config: { settings: { open_links_in_new_tab: false } },
          grid: { x: 0, y: 0, w: 48, h: 5 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a vis config-source panel whose config is a Lens API config', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'vis',
          config: { type: 'metric', title: 'Total requests' },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a vis config-source panel whose config is the whole visualization attachment', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'vis',
          config: {
            query: 'count of requests',
            visualization: { type: 'metric', title: 'Total requests' },
            chart_type: 'metric',
            esql: 'FROM logs | STATS count = COUNT(*)',
          },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a vis config-source panel whose config is not a Lens API config', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'vis',
          config: { title: 'Total requests' },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
