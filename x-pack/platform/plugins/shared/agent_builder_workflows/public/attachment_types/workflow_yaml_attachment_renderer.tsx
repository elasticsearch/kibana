/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Subscription } from 'rxjs';
import { combineLatest } from 'rxjs';
import type {
  ActionButton,
  AttachmentUIDefinition,
  CanvasRenderCallbacks,
} from '@kbn/agent-builder-browser/attachments';
import { ActionButtonType } from '@kbn/agent-builder-browser/attachments';
import { CodeEditor } from '@kbn/code-editor';
import type { ApplicationStart, CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { KibanaContextProvider, useKibana } from '@kbn/kibana-react-plugin/public';
import {
  useWorkflowsApi,
  useWorkflowsCapabilities,
  useWorkflowsMonacoTheme,
  WORKFLOW_READ_ONLY_MONACO_OPTIONS,
  WorkflowGraphPreview,
  type WorkflowApi,
} from '@kbn/workflows-ui';
import type { WorkflowYaml } from '@kbn/workflows';
import { parse as parseYaml } from 'yaml';
import { EuiCallOut } from '@elastic/eui';
import type { QueryClient } from '@kbn/react-query';
import { PLUGIN_ID as WORKFLOW_PLUGIN_ID } from '@kbn/workflows-management-plugin/common';
import type { WorkflowsBaseTelemetry } from '@kbn/workflows-management-plugin/public';

interface WorkflowYamlData {
  yaml: string;
  workflowId?: string;
  name?: string;
}

interface WorkflowYamlAttachment {
  id: string;
  type: string;
  data: WorkflowYamlData;
  origin?: string;
}

const extractErrorMessage = (error: unknown): string =>
  (error as { body?: { message?: string } })?.body?.message ||
  (error as Error)?.message ||
  'Unknown error';

interface SaveWorkflowParams {
  workflowApi: WorkflowApi;
  notifications: CoreStart['notifications'];
  yaml: string;
  workflowId?: string;
  isPersisted: boolean;
  updateOrigin: CanvasRenderCallbacks['updateOrigin'];
  telemetry: WorkflowsBaseTelemetry;
  queryClient: QueryClient;
}

const saveWorkflow = async ({
  workflowApi,
  notifications,
  yaml,
  workflowId,
  isPersisted,
  updateOrigin,
  telemetry,
  queryClient,
}: SaveWorkflowParams): Promise<string | undefined> => {
  try {
    let savedId = workflowId;
    if (workflowId && isPersisted) {
      const result = await workflowApi.updateWorkflow(workflowId, { yaml });
      queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
      telemetry.reportWorkflowUpdated({
        workflowId,
        workflowUpdate: { yaml },
        hasValidationErrors: result.validationErrors.length > 0,
        validationErrorCount: result.validationErrors.length,
        aiAssisted: true,
      });
    } else {
      const result = await workflowApi.createWorkflow({ yaml, id: workflowId });
      savedId = result.id;
      await updateOrigin(result.id);
      telemetry.reportWorkflowCreated({
        workflowId: result.id,
        aiAssisted: true,
      });
    }
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
    notifications.toasts.addSuccess(
      i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.saveSuccess', {
        defaultMessage: 'Workflow saved',
      }),
      { toastLifeTimeMs: 2000 }
    );
    return savedId;
  } catch (error) {
    notifications.toasts.addDanger({
      title: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.saveError', {
        defaultMessage: 'Failed to save workflow',
      }),
      text: extractErrorMessage(error),
    });
    return undefined;
  }
};

const WorkflowYamlCanvasContent: React.FC<{
  attachment: WorkflowYamlAttachment;
  isSidebar: boolean;
  registerActionButtons?: CanvasRenderCallbacks['registerActionButtons'];
  updateOrigin?: CanvasRenderCallbacks['updateOrigin'];
  application: ApplicationStart;
  isOnWorkflowPage: (workflowId: string) => boolean;
  telemetry: WorkflowsBaseTelemetry;
  queryClient: QueryClient;
}> = ({
  attachment,
  isSidebar,
  registerActionButtons,
  updateOrigin,
  application,
  isOnWorkflowPage,
  telemetry,
  queryClient,
}) => {
  useWorkflowsMonacoTheme();

  const workflowApi = useWorkflowsApi();
  const { canCreateWorkflow, canUpdateWorkflow, canReadWorkflow } = useWorkflowsCapabilities();
  const { notifications } = useKibana<{ notifications: CoreStart['notifications'] }>().services;

  // Defer button registration past the initial mount cycle so the parent
  // flyout's clearing effect (which also fires on mount) doesn't overwrite
  // our buttons. This mirrors the dashboard pattern where registration is
  // gated on an async dependency (dashboardApi).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const [savedWorkflowId, setSavedWorkflowId] = useState<string | undefined>(
    attachment.data.workflowId
  );
  const workflowId = savedWorkflowId ?? attachment.data.workflowId;

  const isPersisted = Boolean(attachment.origin);
  // TODO: replace with /workflows_management/public/entities/workflows/model/use_save_yaml.ts or something along the lines
  const [savingAction, setSavingAction] = useState<'save' | 'saveAsNew' | null>(null);

  // Stash the latest values in a ref so the handlers below stay referentially
  // stable across renders. Without this, every YAML stream chunk would rebuild
  // the handlers and re-run the button-registration effect.
  const latest = useRef({
    workflowApi,
    notifications,
    yaml: attachment.data.yaml,
    workflowId,
    isPersisted,
    updateOrigin,
    telemetry,
    queryClient,
    application,
  });
  latest.current = {
    workflowApi,
    notifications,
    yaml: attachment.data.yaml,
    workflowId,
    isPersisted,
    updateOrigin,
    telemetry,
    queryClient,
    application,
  };

  const handleSave = useCallback(async () => {
    const l = latest.current;
    if (!l.updateOrigin) {
      return;
    }

    setSavingAction('save');
    try {
      const id = await saveWorkflow({
        workflowApi: l.workflowApi,
        notifications: l.notifications,
        yaml: l.yaml,
        workflowId: l.workflowId,
        isPersisted: l.isPersisted,
        updateOrigin: l.updateOrigin,
        telemetry: l.telemetry,
        queryClient: l.queryClient,
      });
      if (id && !l.workflowId) {
        setSavedWorkflowId(id);
      }
    } finally {
      setSavingAction(null);
    }
  }, []);

  const handleSaveAsNew = useCallback(async () => {
    const l = latest.current;
    setSavingAction('saveAsNew');
    try {
      const result = await l.workflowApi.createWorkflow({ yaml: l.yaml });
      l.queryClient.invalidateQueries({ queryKey: ['workflows'] });
      l.telemetry.reportWorkflowCreated({
        workflowId: result.id,
        aiAssisted: true,
      });
      l.notifications.toasts.addSuccess(
        i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.saveAsNewSuccess', {
          defaultMessage: 'Workflow saved as new',
        }),
        { toastLifeTimeMs: 2000 }
      );
      l.application.navigateToApp(WORKFLOW_PLUGIN_ID, { path: result.id });
    } catch (error) {
      l.notifications.toasts.addDanger({
        title: i18n.translate(
          'workflowsManagement.attachmentRenderers.workflowYaml.saveAsNewError',
          { defaultMessage: 'Failed to save workflow' }
        ),
        text: extractErrorMessage(error),
      });
    } finally {
      setSavingAction(null);
    }
  }, []);

  const labels = useMemo(
    () => ({
      saving: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.saving', {
        defaultMessage: 'Saving...',
      }),
      override: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.override', {
        defaultMessage: 'Override',
      }),
      saveAsNew: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.saveAsNew', {
        defaultMessage: 'Save as new',
      }),
      save: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.save', {
        defaultMessage: 'Save',
      }),
      openInEditor: i18n.translate(
        'workflowsManagement.attachmentRenderers.workflowYaml.openInEditor',
        { defaultMessage: 'Open in editor' }
      ),
    }),
    []
  );

  const handleOpenInEditor = useCallback(() => {
    const l = latest.current;
    if (l.workflowId) {
      l.application.navigateToApp(WORKFLOW_PLUGIN_ID, { path: l.workflowId });
    }
  }, []);

  const showOpenInEditor =
    Boolean(workflowId) && isPersisted && !isOnWorkflowPage(workflowId ?? '') && canReadWorkflow;

  useEffect(() => {
    if (!ready || !registerActionButtons) {
      return;
    }

    const buttons: ActionButton[] = [];

    const isSaving = savingAction !== null;

    if (workflowId && isPersisted) {
      if (canUpdateWorkflow) {
        buttons.push({
          label: savingAction === 'save' ? labels.saving : labels.override,
          icon: 'save',
          type: ActionButtonType.PRIMARY,
          handler: handleSave,
          disabled: isSaving,
        });
      }
      if (canCreateWorkflow) {
        buttons.push({
          label: savingAction === 'saveAsNew' ? labels.saving : labels.saveAsNew,
          icon: 'copy',
          type: ActionButtonType.SECONDARY,
          handler: handleSaveAsNew,
          disabled: isSaving,
        });
      }
    } else if (canCreateWorkflow) {
      buttons.push({
        label: savingAction === 'save' ? labels.saving : labels.save,
        icon: 'save',
        type: ActionButtonType.PRIMARY,
        handler: handleSave,
        disabled: isSaving,
      });
    }

    if (showOpenInEditor) {
      buttons.push({
        label: labels.openInEditor,
        icon: 'external',
        type: ActionButtonType.SECONDARY,
        handler: handleOpenInEditor,
      });
    }

    registerActionButtons(buttons);
  }, [
    ready,
    workflowId,
    isPersisted,
    savingAction,
    showOpenInEditor,
    handleSave,
    handleSaveAsNew,
    handleOpenInEditor,
    registerActionButtons,
    canCreateWorkflow,
    canUpdateWorkflow,
    labels,
  ]);

  return (
    <div
      css={css`
        height: 100%;
        min-height: 400px;
        width: 100%;
      `}
    >
      <CodeEditor
        languageId="yaml"
        value={attachment.data.yaml}
        options={WORKFLOW_READ_ONLY_MONACO_OPTIONS}
      />
    </div>
  );
};

// Dense inline preview: stretches to the panel's full width and uses a
// horizontal (LR) dagre layout, so the whole workflow fits in a short strip.
// Sidebar keeps a smaller strip since the panel is narrower.
const INLINE_PREVIEW_HEIGHT_SIDEBAR = 180;
const INLINE_PREVIEW_HEIGHT_DEFAULT = 220;

// Guards against valid-YAML/wrong-shape (e.g. LLM emits `steps:` as a mapping):
// WorkflowGraphPreview iterates `workflow.steps` / `workflow.triggers`, which
// would throw "object is not iterable" — there's no error boundary in the
// inline attachment render path, so a throw crashes the whole chat message.
const parseWorkflowYaml = (yaml: string): WorkflowYaml | null => {
  try {
    const parsed = parseYaml(yaml);
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.steps === undefined || Array.isArray(parsed.steps)) &&
      (parsed.triggers === undefined || Array.isArray(parsed.triggers))
    ) {
      return parsed as WorkflowYaml;
    }
    return null;
  } catch {
    return null;
  }
};

const WorkflowYamlInlinePreview: React.FC<{
  attachment: WorkflowYamlAttachment;
  isSidebar: boolean;
}> = ({ attachment, isSidebar }) => {
  const parsed = React.useMemo(
    () => parseWorkflowYaml(attachment.data.yaml),
    [attachment.data.yaml]
  );

  if (!parsed) {
    return (
      // Rendered as part of the attachment body, not in response to a user
      // action, so it must not steal the screen reader on mount.
      <EuiCallOut
        announceOnMount={false}
        size="s"
        color="warning"
        iconType="warning"
        data-test-subj="workflowYamlInlinePreviewInvalid"
        title={i18n.translate(
          'workflowsManagement.attachmentRenderers.workflowYaml.inlinePreview.invalidYaml',
          { defaultMessage: 'Workflow YAML could not be parsed' }
        )}
      />
    );
  }

  const height = isSidebar ? INLINE_PREVIEW_HEIGHT_SIDEBAR : INLINE_PREVIEW_HEIGHT_DEFAULT;

  return <WorkflowGraphPreview workflow={parsed} height={height} />;
};

export const createWorkflowYamlAttachmentUiDefinition = ({
  core,
  telemetry,
  queryClient,
}: {
  core: CoreStart;
  telemetry: WorkflowsBaseTelemetry;
  queryClient: QueryClient;
}): AttachmentUIDefinition<WorkflowYamlAttachment> => {
  const { application } = core;
  let currentAppId: string | undefined;
  let currentLocation = '';
  let appContextSub: Subscription | undefined;
  const trackAppContext = () => {
    appContextSub?.unsubscribe();
    appContextSub = combineLatest([
      application.currentAppId$,
      application.currentLocation$,
    ]).subscribe(([appId, location]) => {
      currentAppId = appId;
      currentLocation = location;
    });
  };
  trackAppContext();

  const isOnWorkflowPage = (workflowId: string): boolean =>
    currentAppId === WORKFLOW_PLUGIN_ID && currentLocation.includes(workflowId);

  return {
    getLabel: (attachment) =>
      attachment.data.name ||
      i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.label', {
        defaultMessage: 'Workflow',
      }),

    getIcon: () => 'workflowsApp',

    renderInlineContent: ({ attachment, isSidebar }) => (
      <KibanaContextProvider services={core}>
        <WorkflowYamlInlinePreview attachment={attachment} isSidebar={isSidebar} />
      </KibanaContextProvider>
    ),

    getActionButtons: ({ attachment, isCanvas, openCanvas }) => {
      if (isCanvas) return [];

      const buttons: ActionButton[] = [];

      if (openCanvas) {
        buttons.push({
          label: i18n.translate('workflowsManagement.attachmentRenderers.workflowYaml.preview', {
            defaultMessage: 'Preview',
          }),
          icon: 'eye',
          type: ActionButtonType.SECONDARY,
          handler: openCanvas,
        });
      }

      if (
        attachment.data.workflowId &&
        attachment.origin &&
        !isOnWorkflowPage(attachment.data.workflowId)
      ) {
        buttons.push({
          label: i18n.translate(
            'workflowsManagement.attachmentRenderers.workflowYaml.openInEditor',
            { defaultMessage: 'Open in editor' }
          ),
          icon: 'external',
          type: ActionButtonType.SECONDARY,
          handler: () => {
            application.navigateToApp(WORKFLOW_PLUGIN_ID, { path: attachment.data.workflowId });
          },
        });
      }

      return buttons;
    },

    renderCanvasContent: ({ attachment, isSidebar }, { registerActionButtons, updateOrigin }) => (
      <KibanaContextProvider services={core}>
        <WorkflowYamlCanvasContent
          attachment={attachment}
          isSidebar={isSidebar}
          registerActionButtons={registerActionButtons}
          updateOrigin={updateOrigin}
          application={application}
          isOnWorkflowPage={isOnWorkflowPage}
          telemetry={telemetry}
          queryClient={queryClient}
        />
      </KibanaContextProvider>
    ),
  };
};
