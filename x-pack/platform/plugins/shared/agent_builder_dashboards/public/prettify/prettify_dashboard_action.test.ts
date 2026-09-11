/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { AggregateQuery } from '@kbn/es-query';
import type { EmbeddableChatAccess } from '@kbn/agent-builder-browser';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import { PRETTIFY_DASHBOARD_ACTION_ID } from '@kbn/dashboard-plugin/public';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { IdGenerator } from '../attachment_types';
import {
  createPrettifyDashboardAction,
  PRETTIFY_DASHBOARD_PROMPT,
} from './prettify_dashboard_action';
import { captureDashboardScreenshot, type ImageAttachment } from './capture_dashboard_screenshot';
import { showScreenshotOverlay } from './screenshot_overlay';

jest.mock('./capture_dashboard_screenshot', () => ({
  ...jest.requireActual('./capture_dashboard_screenshot'),
  captureDashboardScreenshot: jest.fn(),
}));

jest.mock('./screenshot_overlay', () => ({
  showScreenshotOverlay: jest.fn(),
}));

const captureDashboardScreenshotMock = captureDashboardScreenshot as jest.MockedFunction<
  typeof captureDashboardScreenshot
>;

const showScreenshotOverlayMock = showScreenshotOverlay as jest.MockedFunction<
  typeof showScreenshotOverlay
>;

const esqlLens = {
  type: LENS_EMBEDDABLE_TYPE,
  id: 'a',
  grid: { x: 0, y: 0, w: 24, h: 15 },
  config: {
    type: 'metric',
    data_source: { type: 'esql', query: 'FROM logs | STATS count = COUNT(*)' },
  },
};

const child = (esql: AggregateQuery[]) => ({
  esql$: new BehaviorSubject(esql),
  approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
});

const layoutPanel = {
  type: LENS_EMBEDDABLE_TYPE,
  grid: { x: 0, y: 0, w: 24, h: 15 },
};

const createLayout = (panelIds: string[]) => ({
  panels: Object.fromEntries(panelIds.map((id) => [id, layoutPanel])),
  sections: {},
  pinnedPanels: {},
});

const createDashboardApi = ({
  viewMode = 'edit',
  children = { a: child([{ esql: 'FROM logs | LIMIT 10' }]) },
  panels = [esqlLens],
  layout = createLayout(Object.keys(children)),
}: {
  viewMode?: string;
  children?: Record<string, ReturnType<typeof child>>;
  panels?: unknown[];
  layout?: ReturnType<typeof createLayout>;
} = {}): DashboardApi =>
  ({
    viewMode$: new BehaviorSubject(viewMode),
    children$: new BehaviorSubject(children),
    layout$: new BehaviorSubject(layout),
    savedObjectId$: new BehaviorSubject('dash-1'),
    getSerializedState: () => ({
      attributes: {
        title: 'Test',
        panels,
      },
    }),
  } as unknown as DashboardApi);

const createDraftAttachmentId = (id = 'draft-attachment-id'): IdGenerator => ({
  current: id,
  next: () => id,
});

const screenshotAttachment = {
  id: 'image-1',
  type: AttachmentType.image,
  description: 'Dashboard screenshot',
  data: {
    file_id: 'file-1',
    name: 'dashboard-screenshot.png',
    mime_type: 'image/png' as const,
  },
} satisfies ImageAttachment;

const createAction = ({
  openChat = jest.fn(),
  getAgentBuilderAccess = jest.fn(
    async (): Promise<EmbeddableChatAccess> => ({
      hasRequiredLicense: true,
      hasLlmConnector: true,
    })
  ),
  canWriteDashboards = true,
  draftAttachmentId = createDraftAttachmentId(),
  addWarning = jest.fn(),
} = {}) => {
  const files = { filesClientFactory: { asScoped: jest.fn() } } as never;
  const rendering = {} as never;
  const toasts = { addWarning } as never;
  return {
    openChat,
    getAgentBuilderAccess,
    addWarning,
    action: createPrettifyDashboardAction({
      openChat,
      getAgentBuilderAccess,
      canWriteDashboards,
      draftAttachmentId,
      files,
      rendering,
      toasts,
    }),
  };
};

describe('createPrettifyDashboardAction', () => {
  let hideScreenshotOverlay: jest.Mock;

  beforeEach(() => {
    captureDashboardScreenshotMock.mockReset();
    captureDashboardScreenshotMock.mockResolvedValue(screenshotAttachment);
    hideScreenshotOverlay = jest.fn();
    showScreenshotOverlayMock.mockReset();
    showScreenshotOverlayMock.mockReturnValue(hideScreenshotOverlay);
  });

  it('is compatible when a child uses ES|QL', async () => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi(),
      })
    ).resolves.toBe(true);
  });

  it('is compatible when at least one child uses ES|QL', async () => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi({
          children: { a: child([{ esql: 'FROM logs | LIMIT 10' }]), c: child([]) },
        }),
      })
    ).resolves.toBe(true);
  });

  it('is incompatible when no child uses ES|QL', async () => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi({
          children: { c: child([]) },
        }),
      })
    ).resolves.toBe(false);
  });

  it('is incompatible when there are no children', async () => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi({
          children: {},
        }),
      })
    ).resolves.toBe(false);
  });

  it('is incompatible when an ES|QL child is not in layout$.panels', async () => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi({
          children: { a: child([{ esql: 'FROM logs | LIMIT 10' }]) },
          layout: createLayout([]),
        }),
      })
    ).resolves.toBe(false);
  });

  it.each(['view', 'print', 'preview'] as const)('is incompatible in %s mode', async (viewMode) => {
    const { action } = createAction();

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi({ viewMode }),
      })
    ).resolves.toBe(false);
  });

  it('is incompatible without write access', async () => {
    const { action } = createAction({ canWriteDashboards: false });

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi(),
      })
    ).resolves.toBe(false);
  });

  it('is incompatible without a required license', async () => {
    const { action } = createAction({
      getAgentBuilderAccess: jest.fn(async () => ({
        hasRequiredLicense: false,
        hasLlmConnector: true,
      })),
    });

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi(),
      })
    ).resolves.toBe(false);
  });

  it('is incompatible without an LLM connector', async () => {
    const { action } = createAction({
      getAgentBuilderAccess: jest.fn(async () => ({
        hasRequiredLicense: true,
        hasLlmConnector: false,
      })),
    });

    await expect(
      action.isCompatible!({
        dashboardApi: createDashboardApi(),
      })
    ).resolves.toBe(false);
  });

  it('opens chat with the dashboard and a screenshot attachment', async () => {
    const draftAttachmentId = createDraftAttachmentId('shared-draft-id');
    const { action, openChat } = createAction({ draftAttachmentId });
    const dashboardApi = createDashboardApi();

    await action.execute!({
      dashboardApi,
    });

    expect(captureDashboardScreenshotMock).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith({
      newConversation: true,
      initialMessage: PRETTIFY_DASHBOARD_PROMPT,
      autoSendInitialMessage: true,
      sessionTag: 'dashboard',
      attachments: [
        {
          id: 'shared-draft-id',
          origin: 'dash-1',
          type: DASHBOARD_ATTACHMENT_TYPE,
          data: expect.objectContaining({
            title: 'Test',
            panels: [
              expect.objectContaining({
                id: 'a',
                type: LENS_EMBEDDABLE_TYPE,
              }),
            ],
          }),
        },
        screenshotAttachment,
      ],
    });
  });

  it('opens chat without a screenshot and shows a warning when capture fails', async () => {
    captureDashboardScreenshotMock.mockRejectedValue(new Error('boom'));
    const { action, openChat, addWarning } = createAction();

    await action.execute!({
      dashboardApi: createDashboardApi(),
    });

    expect(addWarning).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ type: DASHBOARD_ATTACHMENT_TYPE })],
      })
    );
  });

  it('blocks the dashboard with an overlay while the screenshot is captured', async () => {
    let resolveCapture!: (attachment: ImageAttachment) => void;
    captureDashboardScreenshotMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCapture = resolve;
      })
    );
    const { action, openChat } = createAction();

    const pending = action.execute!({ dashboardApi: createDashboardApi() });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showScreenshotOverlayMock).toHaveBeenCalledTimes(1);
    expect(hideScreenshotOverlay).not.toHaveBeenCalled();

    resolveCapture(screenshotAttachment);
    await pending;

    expect(hideScreenshotOverlay).toHaveBeenCalledTimes(1);
    // the overlay must be gone before the chat flyout opens
    expect(hideScreenshotOverlay.mock.invocationCallOrder[0]).toBeLessThan(
      openChat.mock.invocationCallOrder[0]
    );
  });

  it('hides the overlay when the screenshot capture fails', async () => {
    captureDashboardScreenshotMock.mockRejectedValue(new Error('boom'));
    const { action } = createAction();

    await action.execute!({ dashboardApi: createDashboardApi() });

    expect(hideScreenshotOverlay).toHaveBeenCalledTimes(1);
  });

  it('does not open chat when the dashboard is ineligible', async () => {
    const { action, openChat } = createAction();

    await action.execute!({
      dashboardApi: createDashboardApi({
        children: { c: child([]) },
      }),
    });

    expect(openChat).not.toHaveBeenCalled();
    expect(showScreenshotOverlayMock).not.toHaveBeenCalled();
  });

  it('uses the prettify action id', () => {
    const { action } = createAction();
    expect(action.id).toBe(PRETTIFY_DASHBOARD_ACTION_ID);
  });

  it('getCompatibilityChangesSubject emits when layout$.panels length changes', () => {
    const { action } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    const subscription = action.getCompatibilityChangesSubject!({ dashboardApi })?.subscribe(next);

    (dashboardApi.layout$ as BehaviorSubject<ReturnType<typeof createLayout>>).next(
      createLayout([])
    );

    expect(next).toHaveBeenCalledTimes(1);
    subscription?.unsubscribe();
  });

  it('getCompatibilityChangesSubject does not emit when a panel is only repositioned', () => {
    const { action } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    const subscription = action.getCompatibilityChangesSubject!({ dashboardApi })?.subscribe(next);

    (dashboardApi.layout$ as BehaviorSubject<ReturnType<typeof createLayout>>).next({
      panels: {
        a: { type: LENS_EMBEDDABLE_TYPE, grid: { x: 8, y: 4, w: 24, h: 15 } },
      },
      sections: {},
      pinnedPanels: {},
    });

    expect(next).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });
});
