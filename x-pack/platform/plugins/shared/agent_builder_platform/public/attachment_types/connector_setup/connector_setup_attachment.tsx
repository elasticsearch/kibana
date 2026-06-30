/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import type {
  TriggersAndActionsUIPublicPluginStart,
  CreateConnectorFormHandle,
  CreateConnectorFormStatus,
} from '@kbn/triggers-actions-ui-plugin/public';
import {
  ActionButtonType,
  type ActionButton,
  type AttachmentRenderProps,
  type AttachmentUIDefinition,
  type CanvasRenderCallbacks,
  type HeaderBadge,
} from '@kbn/agent-builder-browser/attachments';
import { AGENTBUILDER_APP_ID } from '@kbn/agent-builder-plugin/public';
import {
  CONNECTOR_SETUP_ATTACHMENT_TYPE,
  type ConnectorSetupAttachment,
} from '../../../common/attachments';

const CONNECTORS_MANAGE_PATH = '/manage/connectors';

interface ConnectorSetupDeps {
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  application: CoreStart['application'];
}

const getDisplayName = (attachment: ConnectorSetupAttachment) =>
  attachment.data.connector_type_name ?? attachment.data.connector_type;

const ConnectorSetupInline: React.FC<AttachmentRenderProps<ConnectorSetupAttachment>> = ({
  attachment,
}) => {
  const { reason } = attachment.data;
  const isConnected = Boolean(attachment.origin);
  const displayName = getDisplayName(attachment);

  return (
    <EuiPanel hasShadow={false} hasBorder={false} paddingSize="m">
      <EuiText size="s" color="subdued">
        <p>
          {reason ??
            i18n.translate('xpack.agentBuilderPlatform.attachments.connectorSetup.inlinePrompt', {
              defaultMessage: 'Configure the {displayName} connector so the agent can use it here.',
              values: { displayName },
            })}
        </p>
      </EuiText>
      {isConnected ? (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" color="success">
            <p>
              {i18n.translate(
                'xpack.agentBuilderPlatform.attachments.connectorSetup.inlineConnected',
                {
                  defaultMessage: 'Connected — the agent can now use {displayName}.',
                  values: { displayName },
                }
              )}
            </p>
          </EuiText>
        </>
      ) : null}
    </EuiPanel>
  );
};

const ConnectorSetupCanvas: React.FC<
  AttachmentRenderProps<ConnectorSetupAttachment> & {
    deps: ConnectorSetupDeps;
    callbacks: CanvasRenderCallbacks;
  }
> = ({ attachment, deps, callbacks }) => {
  const { triggersActionsUi } = deps;
  const { registerActionButtons, updateOrigin, closeCanvas } = callbacks;
  const { connector_type: connectorType, suggested_name: suggestedName } = attachment.data;

  const handleRef = useRef<CreateConnectorFormHandle | null>(null);
  const [status, setStatus] = useState<CreateConnectorFormStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onSave = useCallback(async () => {
    if (!handleRef.current) {
      return;
    }
    setIsSaving(true);
    try {
      const created = await handleRef.current.submit();
      if (created) {
        // `useCreateConnector` (inside the form) already shows the success toast.
        await updateOrigin(created.id);
        closeCanvas();
      }
    } finally {
      setIsSaving(false);
    }
  }, [updateOrigin, closeCanvas]);

  // Re-register the Save button whenever validity/saving changes so its
  // disabled state mirrors the form.
  useEffect(() => {
    registerActionButtons([
      {
        label: i18n.translate('xpack.agentBuilderPlatform.attachments.connectorSetup.saveButton', {
          defaultMessage: 'Create connector',
        }),
        icon: 'check',
        type: ActionButtonType.PRIMARY,
        disabled: isSaving || (status?.isSubmitDisabled ?? true),
        handler: onSave,
      },
    ]);
  }, [registerActionButtons, onSave, isSaving, status?.isSubmitDisabled]);

  const formElement = useMemo(
    () =>
      triggersActionsUi.getAddConnectorForm({
        actionTypeId: connectorType,
        initialName: suggestedName,
        onStateChange: setStatus,
        onReady: (handle) => {
          handleRef.current = handle;
        },
      }),
    [triggersActionsUi, connectorType, suggestedName]
  );

  return (
    <EuiPanel hasShadow={false} hasBorder={false} paddingSize="m">
      {formElement}
    </EuiPanel>
  );
};

export const createConnectorSetupAttachmentDefinition = (
  deps: ConnectorSetupDeps
): AttachmentUIDefinition<ConnectorSetupAttachment> => ({
  getLabel: (attachment) =>
    getDisplayName(attachment) ||
    i18n.translate('xpack.agentBuilderPlatform.attachments.connectorSetup.label', {
      defaultMessage: 'Connector setup',
    }),
  getHeader: ({ attachment }) => {
    const isConnected = Boolean(attachment.origin);
    const badges: HeaderBadge[] = [
      isConnected
        ? {
            label: i18n.translate(
              'xpack.agentBuilderPlatform.attachments.connectorSetup.connectedBadge',
              { defaultMessage: 'Connected' }
            ),
            color: 'success',
            iconType: 'check',
          }
        : {
            label: i18n.translate(
              'xpack.agentBuilderPlatform.attachments.connectorSetup.setupBadge',
              { defaultMessage: 'Setup' }
            ),
          },
    ];
    return { icon: 'plugs', subtitle: attachment.data.connector_type, badges };
  },
  renderInlineContent: (props) => <ConnectorSetupInline {...props} />,
  canvasWidth: '600px',
  renderCanvasContent: (props, callbacks) => (
    <ConnectorSetupCanvas {...props} deps={deps} callbacks={callbacks} />
  ),
  getActionButtons: ({ attachment, isCanvas, openCanvas }) => {
    if (isCanvas) {
      return [];
    }

    if (attachment.origin) {
      return [
        {
          label: i18n.translate(
            'xpack.agentBuilderPlatform.attachments.connectorSetup.manageButton',
            { defaultMessage: 'Manage connector' }
          ),
          icon: 'popout',
          type: ActionButtonType.SECONDARY,
          href: deps.application.getUrlForApp(AGENTBUILDER_APP_ID, {
            path: CONNECTORS_MANAGE_PATH,
          }),
          openInNewTab: true,
          handler: () => {
            // navigation handled by href
          },
        },
      ];
    }

    if (!openCanvas) {
      return [];
    }

    const configureButton: ActionButton = {
      label: i18n.translate(
        'xpack.agentBuilderPlatform.attachments.connectorSetup.configureButton',
        {
          defaultMessage: 'Configure connector',
        }
      ),
      icon: 'gear',
      type: ActionButtonType.PRIMARY,
      handler: () => openCanvas(),
    };
    return [configureButton];
  },
});

export { CONNECTOR_SETUP_ATTACHMENT_TYPE };
