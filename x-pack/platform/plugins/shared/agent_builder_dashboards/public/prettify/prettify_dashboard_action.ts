/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { distinctUntilChanged, EMPTY, map, merge, skip, switchMap } from 'rxjs';
import { i18n } from '@kbn/i18n';
import type { AgentBuilderPluginStart, EmbeddableChatAccess } from '@kbn/agent-builder-browser';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  dashboardStateToAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import type { CoreStart, ToastsStart } from '@kbn/core/public';
import {
  PRETTIFY_DASHBOARD_ACTION_ID,
  type DashboardApi,
  type PrettifyDashboardActionContext,
} from '@kbn/dashboard-plugin/public';
import type { FilesStart } from '@kbn/files-plugin/public';
import { apiPublishesEsql } from '@kbn/presentation-publishing';
import type { UiActionsActionDefinition as ActionDefinition } from '@kbn/ui-actions-plugin/public';
import type { IdGenerator } from '../attachment_types';
import { captureDashboardScreenshot } from './capture_dashboard_screenshot';
import { showScreenshotOverlay } from './screenshot_overlay';

export const PRETTIFY_DASHBOARD_PROMPT = '/dashboard-management prettify this dashboard';

export interface PrettifyDashboardActionDeps {
  openChat: AgentBuilderPluginStart['openChat'];
  getAgentBuilderAccess: AgentBuilderPluginStart['getAgentBuilderAccess'];
  canWriteDashboards: boolean;
  draftAttachmentId: IdGenerator;
  files: FilesStart;
  rendering: CoreStart['rendering'];
  toasts: ToastsStart;
}

const isPrettifiable = (
  dashboardApi: DashboardApi,
  access: EmbeddableChatAccess,
  canWrite: boolean
): boolean =>
  dashboardApi.viewMode$.getValue() === 'edit' &&
  canWrite &&
  access.hasRequiredLicense &&
  access.hasLlmConnector &&
  Object.entries(dashboardApi.children$.getValue()).some(
    ([id, child]) =>
      Boolean(dashboardApi.layout$.getValue().panels[id]) &&
      apiPublishesEsql(child) &&
      child.esql$.getValue().length > 0
  );

export const createPrettifyDashboardAction = ({
  openChat,
  getAgentBuilderAccess,
  canWriteDashboards,
  draftAttachmentId,
  files,
  rendering,
  toasts,
}: PrettifyDashboardActionDeps): ActionDefinition<PrettifyDashboardActionContext> => {
  return {
    id: PRETTIFY_DASHBOARD_ACTION_ID,
    type: PRETTIFY_DASHBOARD_ACTION_ID,
    order: 0,
    getDisplayName: () =>
      i18n.translate('xpack.agentBuilderDashboards.prettifyDashboard.buttonLabel', {
        defaultMessage: 'Enhance this dashboard',
      }),
    getIconType: () => 'sparkles',
    isCompatible: async ({ dashboardApi }) =>
      isPrettifiable(dashboardApi, await getAgentBuilderAccess(), canWriteDashboards),
    getCompatibilityChangesSubject: ({ dashboardApi }): Observable<undefined> =>
      merge(
        dashboardApi.viewMode$.pipe(skip(1)),
        dashboardApi.layout$.pipe(
          map((layout) => Object.keys(layout.panels).length),
          distinctUntilChanged(),
          skip(1)
        ),
        dashboardApi.children$.pipe(skip(1)),
        dashboardApi.children$.pipe(
          switchMap((children) => {
            const esqlChildren = Object.values(children).filter(apiPublishesEsql);
            return esqlChildren.length === 0
              ? EMPTY
              : merge(...esqlChildren.map((child) => child.esql$.pipe(skip(1))));
          })
        )
      ).pipe(map(() => undefined)),
    execute: async ({ dashboardApi }) => {
      if (!isPrettifiable(dashboardApi, await getAgentBuilderAccess(), canWriteDashboards)) {
        return;
      }

      const dashboardAttachment = {
        id: draftAttachmentId.current,
        origin: dashboardApi.savedObjectId$.getValue(),
        type: DASHBOARD_ATTACHMENT_TYPE,
        data: dashboardStateToAttachmentData(dashboardApi.getSerializedState().attributes),
      };

      const hideScreenshotOverlay = showScreenshotOverlay(rendering);
      const screenshot = await captureDashboardScreenshot({ dashboardApi, files })
        .catch(() => {
          toasts.addWarning(
            i18n.translate('xpack.agentBuilderDashboards.prettifyDashboard.screenshotFailed', {
              defaultMessage: 'Could not capture a dashboard screenshot. Continuing without it.',
            })
          );
          return undefined;
        })
        .finally(hideScreenshotOverlay);

      openChat({
        newConversation: true,
        initialMessage: PRETTIFY_DASHBOARD_PROMPT,
        autoSendInitialMessage: true,
        sessionTag: 'dashboard',
        attachments: screenshot ? [dashboardAttachment, screenshot] : [dashboardAttachment],
      });
    },
  };
};
