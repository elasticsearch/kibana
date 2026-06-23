/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import {
  AgentAccessControlMode,
  AGENT_BUILDER_UI_EBT,
  ACCESS_CONTROL_MODE_BADGE_COLOR,
  ACCESS_CONTROL_MODE_ICON,
  type AgentDefinition,
} from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { FormProvider, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { useAgentBuilderServices } from '../../../../hooks/use_agent_builder_service';
import { useToasts } from '../../../../hooks/use_toasts';
import { queryKeys } from '../../../../query_keys';
import { labels } from '../../../../utils/i18n';
import { FLYOUT_WIDTH } from '../../common/constants';
import { AccessSection } from './access_section';
import { CustomInstructionsSection } from './custom_instructions_section';
import { CustomizationSection } from './customization_section';
import { IdentificationSection } from './identification_section';
import { TagsSection } from './tags_section';
import type { EditDetailsFormData } from './types';

const { editDetails: flyoutLabels } = labels.agentOverview;

interface EditDetailsFlyoutProps {
  agent: AgentDefinition;
  onClose: () => void;
  canChangeAccessControlMode: boolean;
  showWorkflowSection: boolean;
}

export const EditDetailsFlyout: React.FC<EditDetailsFlyoutProps> = ({
  agent,
  onClose,
  canChangeAccessControlMode,
  showWorkflowSection,
}) => {
  const { euiTheme } = useEuiTheme();
  const flyoutTitleId = useGeneratedHtmlId();
  const { agentService } = useAgentBuilderServices();
  const { addSuccessToast, addErrorToast } = useToasts();
  const queryClient = useQueryClient();

  const methods = useForm<EditDetailsFormData>({
    defaultValues: {
      name: agent.name,
      description: agent.description,
      avatar_symbol: agent.avatar_symbol ?? '',
      avatar_color: agent.avatar_color ?? '',
      labels: agent.labels ?? [],
      access_control: agent.access_control ?? {
        access_mode: AgentAccessControlMode.Private,
        entries: [],
      },
      configuration: {
        enable_elastic_capabilities: agent.configuration?.enable_elastic_capabilities ?? false,
        workflow_ids: agent.configuration?.workflow_ids ?? [],
        instructions: agent.configuration?.instructions ?? '',
      },
    },
    mode: 'onBlur',
  });

  const { handleSubmit, formState } = methods;

  const updateMutation = useMutation({
    mutationFn: (data: EditDetailsFormData) =>
      agentService.update(agent.id, {
        name: data.name,
        description: data.description,
        avatar_symbol: data.avatar_symbol || undefined,
        avatar_color: data.avatar_color || undefined,
        labels: data.labels,
        access_control: data.access_control,
        configuration: {
          enable_elastic_capabilities: data.configuration.enable_elastic_capabilities,
          workflow_ids: data.configuration.workflow_ids,
          instructions: data.configuration.instructions,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.byId(agent.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agentProfiles.all });
      addSuccessToast({ title: flyoutLabels.successToast });
      onClose();
    },
    onError: () => {
      addErrorToast({ title: flyoutLabels.errorToast });
    },
  });

  const isShared = agent.access_control?.access_mode === AgentAccessControlMode.Shared;

  const contentPadding = css`
    padding: ${euiTheme.size.s};
  `;

  return (
    <FormProvider {...methods}>
      <EuiFlyout
        onClose={onClose}
        size={FLYOUT_WIDTH}
        aria-labelledby={flyoutTitleId}
        data-test-subj="editDetailsFlyout"
      >
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id={flyoutTitleId}>{flyoutLabels.title}</h2>
          </EuiTitle>
        </EuiFlyoutHeader>

        <EuiFlyoutBody
          banner={
            isShared ? (
              <EuiCallOut
                announceOnMount={false}
                color="warning"
                size="s"
                title={
                  <span>
                    {flyoutLabels.sharedWarningPrefix}
                    <EuiBadge
                      iconType={ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Shared]}
                      color={ACCESS_CONTROL_MODE_BADGE_COLOR[AgentAccessControlMode.Shared]}
                    >
                      {flyoutLabels.sharedWarningBadge}
                    </EuiBadge>
                    {flyoutLabels.sharedWarningSuffix}
                  </span>
                }
                data-test-subj="editDetailsSharedWarning"
              />
            ) : undefined
          }
        >
          <div css={contentPadding}>
            <IdentificationSection />

            <EuiHorizontalRule margin="xl" />
            <AccessSection canChangeAccessControlMode={canChangeAccessControlMode} />

            <EuiHorizontalRule margin="xl" />
            <CustomizationSection showWorkflowSection={showWorkflowSection} />

            <EuiHorizontalRule margin="xl" />
            <CustomInstructionsSection />

            <EuiHorizontalRule margin="xl" />
            <TagsSection />
          </div>
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                onClick={onClose}
                data-test-subj="editDetailsCancelButton"
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.flyout,
                  action: AGENT_BUILDER_UI_EBT.action.agentOverview.EDIT_FLYOUT_CANCEL,
                  detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                })}
              >
                {flyoutLabels.cancelButton}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                onClick={handleSubmit((data) => updateMutation.mutate(data))}
                isLoading={updateMutation.isLoading}
                isDisabled={!formState.isDirty}
                data-test-subj="editDetailsSaveButton"
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.flyout,
                  action: AGENT_BUILDER_UI_EBT.action.agentOverview.EDIT_FLYOUT_SAVE,
                  detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                })}
              >
                {flyoutLabels.saveButton}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>
    </FormProvider>
  );
};
