/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
  type EuiThemeComputed,
} from '@elastic/eui';
import type {
  AgentAccessControl,
  AgentAccessControlEntry,
  AgentDefinition,
} from '@kbn/agent-builder-common';
import { AccessForm } from './access_form';
import { AccessControlModeContextStrip } from './access_control_mode_context_strip';
import { useAgentAccessControl } from '../../../hooks/agents/use_agent_access_control';
import { useUpdateAgentAccessControl } from '../../../hooks/agents/use_update_agent_access_control';
import {
  accessFlyoutCancel,
  accessFlyoutHiddenBody,
  accessFlyoutHiddenTitle,
  accessFlyoutLoadErrorBody,
  accessFlyoutLoadErrorTitle,
  accessFlyoutSave,
  accessFlyoutSaveErrorTitle,
  accessFlyoutTitle,
} from './access_i18n';

interface AccessFlyoutProps {
  agent: AgentDefinition;
  onClose: () => void;
}

const entriesSignature = (entries: AgentAccessControlEntry[]): string =>
  JSON.stringify(
    [...entries]
      .map((e) => ({ type: e.type, name: e.name, role: e.role }))
      .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`))
  );

const skeletonStyles = (euiTheme: EuiThemeComputed) => css`
  display: flex;
  flex-direction: column;
  gap: ${euiTheme.size.s};
  padding-top: ${euiTheme.size.l};
`;

const skeletonRowStyles = (euiTheme: EuiThemeComputed, width: string) => css`
  height: ${euiTheme.size.l};
  width: ${width};
  border-radius: ${euiTheme.border.radius.small};
  background-color: ${euiTheme.colors.lightestShade};
`;

const LoadingSkeleton: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  return (
    <div css={skeletonStyles(euiTheme)} data-test-subj="agentBuilderAclSkeleton">
      <div css={skeletonRowStyles(euiTheme, '40%')} />
      <div css={skeletonRowStyles(euiTheme, '70%')} />
      <div css={skeletonRowStyles(euiTheme, '60%')} />
    </div>
  );
};

export const AccessFlyout: React.FC<AccessFlyoutProps> = ({ agent, onClose }) => {
  const flyoutTitleId = `agentBuilderAclFlyoutTitle_${agent.id}`;

  const { data, isLoading, isError } = useAgentAccessControl(agent.id);
  const [draft, setDraft] = useState<AgentAccessControl | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Seed the draft once when the server responds. After that, dirty state lives in `draft`.
  useEffect(() => {
    if (data?.access_control && draft === null) {
      setDraft(data.access_control);
    }
  }, [data, draft]);

  const updateMutation = useUpdateAgentAccessControl({
    agentId: agent.id,
    onSuccess: () => {
      setSaveErrorMessage(null);
      onClose();
    },
    onError: (err: Error & { body?: { message?: string } }) => {
      setSaveErrorMessage(err.body?.message ?? err.message ?? '');
    },
  });

  const isBusy = isLoading || updateMutation.isLoading;
  const isDirty =
    draft !== null &&
    data?.access_control != null &&
    entriesSignature(draft.entries) !== entriesSignature(data.access_control.entries);

  const handleSave = () => {
    if (!draft) return;
    setSaveErrorMessage(null);
    updateMutation.mutate({ entries: draft.entries });
  };

  const renderBody = () => {
    if (isLoading || draft === null) {
      return <LoadingSkeleton />;
    }
    if (isError || !data) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="error"
          title={accessFlyoutLoadErrorTitle}
        >
          <EuiText size="s">{accessFlyoutLoadErrorBody}</EuiText>
        </EuiCallOut>
      );
    }
    if (!data.permissions.update_access_control) {
      // The user can read the agent but not manage its ACL. Server has already redacted
      // entries — this is its own first-class state, not an error. Be honest about it.
      return (
        <EuiCallOut
          announceOnMount
          color="primary"
          iconType="lock"
          title={accessFlyoutHiddenTitle}
          data-test-subj="agentBuilderAclHidden"
        >
          <EuiText size="s">{accessFlyoutHiddenBody}</EuiText>
        </EuiCallOut>
      );
    }
    return (
      <>
        {saveErrorMessage ? (
          <>
            <EuiCallOut
              announceOnMount
              color="danger"
              iconType="error"
              title={accessFlyoutSaveErrorTitle}
            >
              <EuiText size="s">{saveErrorMessage}</EuiText>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}
        <AccessForm
          agent={agent}
          entries={draft.entries}
          isDisabled={updateMutation.isLoading}
          onChange={(entries) => setDraft((prev) => (prev ? { ...prev, entries } : prev))}
        />
      </>
    );
  };

  return (
    <EuiFlyout
      onClose={onClose}
      ownFocus
      aria-labelledby={flyoutTitleId}
      data-test-subj="agentBuilderAclFlyout"
      size="m"
      paddingSize="l"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id={flyoutTitleId}>{accessFlyoutTitle(agent.name)}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody
        banner={
          !isLoading && draft !== null && !isError && data?.permissions.update_access_control ? (
            <AccessControlModeContextStrip agent={agent} />
          ) : undefined
        }
      >
        {renderBody()}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose} disabled={updateMutation.isLoading}>
              {accessFlyoutCancel}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSave}
              isLoading={updateMutation.isLoading}
              isDisabled={!isDirty || isBusy || !data?.permissions.update_access_control}
              data-test-subj="agentBuilderAclSaveButton"
            >
              {accessFlyoutSave}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
