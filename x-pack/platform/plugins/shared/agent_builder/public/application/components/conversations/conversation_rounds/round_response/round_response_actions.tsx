/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import copy from 'copy-to-clipboard';
import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import type { ConversationRound } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { useToasts } from '../../../../hooks/use_toasts';
import { useConversationStream } from '../../../../hooks/use_conversation_stream';
import { useKibana } from '../../../../hooks/use_kibana';
import { useExperimentalFeatures } from '../../../../hooks/use_experimental_features';
import { RoundMetadataPopover } from './round_metadata_popover';
import { RoundTraceButton } from './round_trace_button';

const labels = {
  copy: i18n.translate('xpack.agentBuilder.roundResponseActions.copy', {
    defaultMessage: 'Copy response',
  }),
  copySuccess: i18n.translate('xpack.agentBuilder.roundResponseActions.copySuccess', {
    defaultMessage: 'Response copied to clipboard',
  }),
  regenerate: i18n.translate('xpack.agentBuilder.roundResponseActions.regenerate', {
    defaultMessage: 'Regenerate response',
  }),
};

const ADD_TO_DATASET_METADATA_SOURCE = 'agent_builder';

interface RoundResponseActionsProps {
  content: string;
  isVisible: boolean;
  isLastRound?: boolean;
  rawRound?: ConversationRound;
}

export const RoundResponseActions: React.FC<RoundResponseActionsProps> = ({
  content,
  isVisible,
  isLastRound,
  rawRound,
}) => {
  const { addSuccessToast } = useToasts();
  const { regenerate, isRegenerating, isResponseLoading } = useConversationStream();
  const { services } = useKibana();
  const isExperimentalEnabled = useExperimentalFeatures();

  const handleCopy = useCallback(() => {
    const isSuccess = copy(content);
    if (isSuccess) {
      addSuccessToast(labels.copySuccess);
    }
  }, [content, addSuccessToast]);

  const handleResend = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // Disable regenerate button while any response is loading
  const isRegenerateDisabled = isRegenerating || isResponseLoading;

  // Normalise trace_id — backend models it as `string | string[]` to keep the
  // door open for multi-trace rounds; only the first id is meaningful today.
  const traceId = useMemo(() => {
    const id = rawRound?.trace_id;
    if (!id) return undefined;
    return Array.isArray(id) ? id[0] : id;
  }, [rawRound?.trace_id]);

  // `services.plugins.evals` is optional — the evals plugin isn't installed
  // in every Kibana deployment. When absent, the 'Add to Dataset' button hides.
  const addToDatasetAction = useMemo(() => {
    if (!rawRound || !services.plugins.evals?.getAddToDatasetAction) return null;
    return services.plugins.evals.getAddToDatasetAction({
      initialExample: {
        input: { round: rawRound },
        output: { steps: rawRound.steps },
        metadata: {
          source: ADD_TO_DATASET_METADATA_SOURCE,
          trace_id: traceId ?? null,
        },
      },
    });
  }, [rawRound, services.plugins.evals, traceId]);

  const showTraceButton = isExperimentalEnabled && Boolean(traceId);
  const showAddToDatasetButton = isExperimentalEnabled && addToDatasetAction !== null;

  return (
    <EuiFlexGroup
      direction="row"
      gutterSize="xs"
      alignItems="center"
      responsive={false}
      css={css`
        opacity: ${isVisible ? 1 : 0};
        transition: opacity 0.2s ease;
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiToolTip content={labels.copy} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="copy"
            aria-label={labels.copy}
            onClick={handleCopy}
            color="text"
            data-test-subj="roundResponseCopyButton"
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.conversation.COPY_RESPONSE,
              detail: 'conversation',
            })}
          />
        </EuiToolTip>
      </EuiFlexItem>
      {isLastRound && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={labels.regenerate} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="refresh"
              aria-label={labels.regenerate}
              onClick={handleResend}
              color="text"
              isDisabled={isRegenerateDisabled}
              isLoading={isRegenerating}
              data-test-subj="roundResponseRegenerateButton"
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                action: AGENT_BUILDER_UI_EBT.action.conversation.REGENERATE,
                detail: 'conversation',
              })}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {showTraceButton && traceId && (
        <EuiFlexItem grow={false}>
          <RoundTraceButton traceId={traceId} />
        </EuiFlexItem>
      )}
      {showAddToDatasetButton && addToDatasetAction && (
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType={addToDatasetAction.iconType}
            color="text"
            aria-label={addToDatasetAction.label}
            onClick={addToDatasetAction.onClick}
            data-test-subj="roundAddToDatasetButton"
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.conversation.ROUND_ADD_TO_DATASET,
              detail: 'conversation',
            })}
          />
        </EuiFlexItem>
      )}
      {rawRound && (
        <EuiFlexItem grow={false}>
          <RoundMetadataPopover rawRound={rawRound} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
