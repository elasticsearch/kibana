/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiSuperSelect,
  EuiComboBox,
  EuiColorPicker,
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiMarkdownEditor,
  EuiHorizontalRule,
  EuiSwitch,
  EuiLink,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  agentBuilderDefaultAgentId,
  AgentAccessControlMode,
  AGENT_BUILDER_UI_EBT,
  ACCESS_CONTROL_MODE_ICON,
  type UserIdAndName,
} from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import type { Control, FormState } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';
import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { AccessForm } from '../../access/access_form';
import { labels } from '../../../../utils/i18n';
import { useAgentLabels } from '../../../../hooks/agents/use_agent_labels';
import { useAgentBuilderServices } from '../../../../hooks/use_agent_builder_service';
import { useKibana } from '../../../../hooks/use_kibana';
import { WorkflowPicker } from '../../../tools/form/components/workflow/workflow_picker';
import { isPreExecutionWorkflowEnabled } from '../../../../utils/is_pre_execution_workflow_enabled';
import { ACCESS_CONTROL_MODE_LABELS } from '../../../../utils/access_control_mode_i18n';
import type { AgentFormData } from '../agent_form';
import { truncateAvatarSymbol } from '../agent_form_validation';

interface AgentSettingsTabProps {
  control: Control<AgentFormData>;
  formState: FormState<AgentFormData>;
  isCreateMode: boolean;
  isFormDisabled: boolean;
  canChangeAccessControl: boolean;
  owner?: UserIdAndName;
  agentId?: string;
}

export const AgentSettingsTab: React.FC<AgentSettingsTabProps> = ({
  control,
  formState,
  isCreateMode,
  isFormDisabled,
  canChangeAccessControl,
  owner,
  agentId,
}) => {
  const { labels: existingLabels, isLoading: labelsLoading } = useAgentLabels();
  const { docLinksService } = useAgentBuilderServices();
  const {
    services: { uiSettings },
  } = useKibana();

  const currentAccessControlMode = useWatch({ control, name: 'access_control.access_mode' });

  // Lightweight projection used only by AccessForm to filter selectable access control roles.
  // The real entries come from the form's `access_control.entries` field via Controller
  // (seeded from the loaded agent in `useAgentEdit`), not from local state.
  const accessFormAgent = useMemo(
    () => ({
      access_control: { access_mode: currentAccessControlMode, entries: [] },
    }),
    [currentAccessControlMode]
  );

  const showAgentWorkflowsSection = useMemo(() => {
    return isPreExecutionWorkflowEnabled(uiSettings);
  }, [uiSettings]);

  /* Enable shrinking; default min-width:auto blocks it and causes overflow */
  const formFlexColumnStyles = css`
    min-width: 0;
  `;
  const renderAccessControlModeOption = ({ icon, label }: { icon: EuiIconType; label: string }) => (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type={icon} aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>{label}</EuiFlexItem>
    </EuiFlexGroup>
  );
  const accessControlModeOptions = [
    {
      value: AgentAccessControlMode.Public,
      inputDisplay: renderAccessControlModeOption({
        icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Public],
        label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Public],
      }),
    },
    {
      value: AgentAccessControlMode.Shared,
      inputDisplay: renderAccessControlModeOption({
        icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Shared],
        label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Shared],
      }),
    },
    {
      value: AgentAccessControlMode.Private,
      inputDisplay: renderAccessControlModeOption({
        icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Private],
        label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Private],
      }),
    },
  ];

  return (
    <>
      <EuiSpacer size="l" />
      <EuiFlexGroup
        direction="row"
        gutterSize="xl"
        alignItems="flexStart"
        aria-labelledby="system-references-section-title"
      >
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiIcon type="bullseye" aria-hidden={true} />
              <EuiTitle size="xs">
                <h2 id="system-references-section-title">
                  {i18n.translate('xpack.agentBuilder.agents.form.settings.systemReferencesTitle', {
                    defaultMessage: 'System references',
                  })}
                </h2>
              </EuiTitle>
            </EuiFlexGroup>
            <EuiText size="s" color="subdued">
              {i18n.translate(
                'xpack.agentBuilder.agents.form.settings.systemReferencesDescription',
                {
                  defaultMessage:
                    "Used behind the scenes to identify and guide the agent's behavior. Not shown to end users.",
                }
              )}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiPanel paddingSize="m" hasBorder={false} hasShadow={false} color="subdued">
              <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
                <EuiTitle size="xxs">
                  <span>
                    {i18n.translate('xpack.agentBuilder.agents.form.settings.agentIdLabel', {
                      defaultMessage: 'Agent ID',
                    })}
                  </span>
                </EuiTitle>
                <EuiText size="s" color="subdued">
                  {i18n.translate('xpack.agentBuilder.agents.form.settings.agentIdDescription', {
                    defaultMessage: 'Unique ID to reference the agent in code or configurations.',
                  })}
                </EuiText>
                <EuiSpacer size="s" />
                <EuiTitle size="xxs">
                  <span>
                    {i18n.translate('xpack.agentBuilder.agents.form.settings.instructionsLabel', {
                      defaultMessage: 'Instructions',
                    })}
                  </span>
                </EuiTitle>

                <EuiText size="s" color="subdued">
                  {i18n.translate(
                    'xpack.agentBuilder.agents.form.settings.instructionsDescription',
                    {
                      defaultMessage:
                        'Guides how this agent behaves when interacting with tools or responding to queries. Use this to set tone, priorities, or special behaviors.',
                    }
                  )}
                </EuiText>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={2} css={formFlexColumnStyles}>
          <EuiFormRow
            label={i18n.translate('xpack.agentBuilder.agents.form.idLabel', {
              defaultMessage: 'Agent ID',
            })}
            isInvalid={!!formState.errors.id}
            error={formState.errors.id?.message}
          >
            <Controller
              name="id"
              control={control}
              render={({ field: { ref, ...rest } }) => (
                <EuiFieldText
                  {...rest}
                  inputRef={ref}
                  disabled={isFormDisabled || !isCreateMode}
                  placeholder={
                    isCreateMode
                      ? i18n.translate('xpack.agentBuilder.agents.form.idPlaceholder', {
                          defaultMessage: 'Enter agent ID',
                        })
                      : ''
                  }
                  isInvalid={!!formState.errors.id}
                  aria-label={i18n.translate('xpack.agentBuilder.agents.form.idAriaLabel', {
                    defaultMessage: 'Agent ID input field',
                  })}
                  data-test-subj="agentSettingsIdInput"
                />
              )}
            />
          </EuiFormRow>

          <EuiFormRow
            label={i18n.translate('xpack.agentBuilder.agents.form.customInstructionsLabel', {
              defaultMessage: 'Custom Instructions',
            })}
            labelAppend={
              <EuiText size="xs" color="subdued">
                {labels.common.optional}
              </EuiText>
            }
            isInvalid={!!formState.errors.configuration?.instructions}
            error={formState.errors.configuration?.instructions?.message}
          >
            <Controller
              name="configuration.instructions"
              control={control}
              render={({ field: { onChange, value } }) => (
                <EuiMarkdownEditor
                  onChange={onChange}
                  value={value ?? ''}
                  readOnly={isFormDisabled}
                  aria-label={i18n.translate(
                    'xpack.agentBuilder.agents.form.customInstructionsEditorLabel',
                    {
                      defaultMessage: 'Custom Instructions Editor',
                    }
                  )}
                />
              )}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule />

      <EuiFlexGroup
        direction="row"
        gutterSize="xl"
        alignItems="flexStart"
        aria-labelledby="elastic-capabilities-section-title"
      >
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiIcon type="sparkles" aria-hidden={true} />
              <EuiTitle size="xs">
                <h2 id="elastic-capabilities-section-title">
                  {i18n.translate(
                    'xpack.agentBuilder.agents.form.settings.elasticCapabilitiesTitle',
                    {
                      defaultMessage: 'Elastic capabilities',
                    }
                  )}
                </h2>
              </EuiTitle>
            </EuiFlexGroup>
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.agentBuilder.agents.form.settings.elasticCapabilitiesDescription"
                defaultMessage="Automatically assign all current and future Elastic-built tools, skills, and plugins to the agent. Disable to manage assignments manually. {learnMoreLink}"
                values={{
                  learnMoreLink: (
                    <EuiLink
                      href={docLinksService.elasticCapabilities}
                      target="_blank"
                      aria-label={i18n.translate(
                        'xpack.agentBuilder.agents.form.settings.elasticCapabilitiesDocumentationAriaLabel',
                        {
                          defaultMessage:
                            'Learn more about Elastic capabilities in the documentation',
                        }
                      )}
                    >
                      {i18n.translate(
                        'xpack.agentBuilder.agents.form.settings.elasticCapabilitiesLearnMoreLabel',
                        {
                          defaultMessage: 'Learn more.',
                        }
                      )}
                    </EuiLink>
                  ),
                }}
              />
            </EuiText>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={2} css={formFlexColumnStyles}>
          <Controller
            name="configuration.enable_elastic_capabilities"
            control={control}
            render={({ field: { onChange, value } }) => (
              <EuiSwitch
                label={i18n.translate(
                  'xpack.agentBuilder.agents.form.settings.enableElasticCapabilitiesLabel',
                  {
                    defaultMessage: 'Enable Elastic capabilities',
                  }
                )}
                checked={Boolean(value)}
                onChange={(e) => onChange(e.target.checked)}
                disabled={isFormDisabled}
                data-test-subj="agentSettingsEnableElasticCapabilitiesSwitch"
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.pageContent,
                  action: AGENT_BUILDER_UI_EBT.action.agentOverview.ELASTIC_CAPABILITIES_TOGGLE,
                  detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                })}
              />
            )}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule />

      <EuiFlexGroup
        direction="row"
        gutterSize="xl"
        alignItems="flexStart"
        aria-labelledby="organization-access-section-title"
      >
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiIcon type="tag" aria-hidden={true} />
              <EuiTitle size="xs">
                <h2 id="organization-access-section-title">
                  {i18n.translate(
                    'xpack.agentBuilder.agents.form.settings.organizationAccessTitle',
                    { defaultMessage: 'Organization' }
                  )}
                </h2>
              </EuiTitle>
            </EuiFlexGroup>
            <EuiText size="s" color="subdued">
              {i18n.translate(
                'xpack.agentBuilder.agents.form.settings.organizationAccessDescription',
                {
                  defaultMessage:
                    'Use labels to organize agents and control who can view and interact with them.',
                }
              )}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiPanel paddingSize="s" hasBorder={false} hasShadow={false} color="subdued">
              <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
                <EuiTitle size="xxs">
                  <span>
                    {i18n.translate(
                      'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningLabel',
                      {
                        defaultMessage: 'Access control levels',
                      }
                    )}
                  </span>
                </EuiTitle>
                <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      <strong>
                        {i18n.translate(
                          'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningPublicLabel',
                          {
                            defaultMessage: 'Public:',
                          }
                        )}
                      </strong>{' '}
                      {i18n.translate(
                        'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningPublicDescription',
                        {
                          defaultMessage: 'Anyone can view and edit.',
                        }
                      )}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      <strong>
                        {i18n.translate(
                          'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningSharedLabel',
                          {
                            defaultMessage: 'Shared:',
                          }
                        )}
                      </strong>{' '}
                      {i18n.translate(
                        'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningSharedDescription',
                        {
                          defaultMessage:
                            'Anyone can view. Only the owner, an administrator, or people you explicitly grant access to can edit.',
                        }
                      )}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      <strong>
                        {i18n.translate(
                          'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningPrivateLabel',
                          {
                            defaultMessage: 'Private:',
                          }
                        )}
                      </strong>{' '}
                      {i18n.translate(
                        'xpack.agentBuilder.agents.form.settings.accessControlModeMeaningPrivateDescription',
                        {
                          defaultMessage:
                            'Only the owner, an administrator, or people you explicitly grant access to can view and edit.',
                        }
                      )}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={2} css={formFlexColumnStyles}>
          <EuiFormRow
            fullWidth
            label={i18n.translate('xpack.agentBuilder.agents.form.labelsLabel', {
              defaultMessage: 'Labels',
            })}
            labelAppend={
              <EuiText size="xs" color="subdued">
                {labels.common.optional}
              </EuiText>
            }
            isInvalid={!!formState.errors.labels}
            error={formState.errors.labels?.message}
          >
            <Controller
              name="labels"
              control={control}
              render={({ field }) => (
                <EuiComboBox
                  fullWidth
                  placeholder={i18n.translate('xpack.agentBuilder.agents.form.labelsPlaceholder', {
                    defaultMessage: 'Add one or more labels',
                  })}
                  selectedOptions={(field.value || []).map((l: string) => ({ label: l }))}
                  options={existingLabels.map((label) => ({ label }))}
                  onCreateOption={(searchValue: string) => {
                    const newLabel = searchValue.trim();
                    if (!newLabel) return;
                    const next = Array.from(new Set([...(field.value || []), newLabel]));
                    field.onChange(next);
                  }}
                  onChange={(options) => field.onChange(options.map((o) => o.label))}
                  isDisabled={isFormDisabled || labelsLoading}
                  isClearable
                  isLoading={labelsLoading}
                  aria-label={i18n.translate('xpack.agentBuilder.agents.form.labelsAriaLabel', {
                    defaultMessage: 'Agent labels selection',
                  })}
                  data-test-subj="agentSettingsLabelsComboBox"
                />
              )}
            />
          </EuiFormRow>

          <EuiFormRow
            label={i18n.translate('xpack.agentBuilder.agents.form.accessControlModeLabel', {
              defaultMessage: 'Access control',
            })}
            helpText={
              agentId === agentBuilderDefaultAgentId
                ? i18n.translate(
                    'xpack.agentBuilder.agents.form.accessControlModeDefaultAgentReason',
                    {
                      defaultMessage: 'The default agent is always accessible to all users.',
                    }
                  )
                : !canChangeAccessControl
                ? i18n.translate('xpack.agentBuilder.agents.form.accessControlModeDisabledReason', {
                    defaultMessage:
                      'Only the owner or an administrator can change the access control mode.',
                  })
                : undefined
            }
            isInvalid={!!formState.errors.access_control?.access_mode}
            error={formState.errors.access_control?.access_mode?.message}
          >
            <Controller
              name="access_control.access_mode"
              control={control}
              render={({ field: { onChange, value } }) => (
                <EuiSuperSelect
                  fullWidth
                  options={accessControlModeOptions}
                  valueOfSelected={value}
                  onChange={onChange}
                  disabled={isFormDisabled || !canChangeAccessControl}
                  aria-label={i18n.translate(
                    'xpack.agentBuilder.agents.form.accessControlModeAriaLabel',
                    {
                      defaultMessage: 'Agent access control mode',
                    }
                  )}
                  data-test-subj="agentSettingsAccessControlModeSelect"
                />
              )}
            />
          </EuiFormRow>

          {!isCreateMode && agentId !== agentBuilderDefaultAgentId && (
            <>
              <EuiSpacer size="m" />
              <Controller
                name="access_control.entries"
                control={control}
                render={({ field }) => (
                  <AccessForm
                    agent={accessFormAgent}
                    entries={field.value ?? []}
                    ownerName={owner?.username}
                    isDisabled={isFormDisabled || !canChangeAccessControl}
                    onChange={field.onChange}
                  />
                )}
              />
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule />

      <EuiFlexGroup
        direction="row"
        gutterSize="xl"
        alignItems="flexStart"
        aria-labelledby="presentation-section-title"
      >
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiIcon type="brush" aria-hidden={true} />
              <EuiTitle size="xs">
                <h2 id="presentation-section-title">
                  {i18n.translate('xpack.agentBuilder.agents.form.settings.presentationTitle', {
                    defaultMessage: 'Presentation',
                  })}
                </h2>
              </EuiTitle>
            </EuiFlexGroup>
            <EuiText size="s" color="subdued">
              {i18n.translate('xpack.agentBuilder.agents.form.settings.presentationDescription', {
                defaultMessage:
                  'Set how your agent shows up to users — choose a name, avatar, and a friendly description.',
              })}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiPanel paddingSize="m" hasBorder={false} hasShadow={false} color="subdued">
              <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
                <EuiTitle size="xxs">
                  <span>
                    {i18n.translate(
                      'xpack.agentBuilder.agents.form.settings.presentationNameDescriptionLabel',
                      {
                        defaultMessage: 'Display name and description',
                      }
                    )}
                  </span>
                </EuiTitle>
                <EuiText size="s" color="subdued">
                  {i18n.translate(
                    'xpack.agentBuilder.agents.form.settings.presentationNameDescriptionDescription',
                    {
                      defaultMessage:
                        'The human-friendly name and short, friendly introduction your users see when they search for and interact with this agent.',
                    }
                  )}
                </EuiText>
                <EuiSpacer size="s" />
                <EuiTitle size="xxs">
                  <span>
                    {i18n.translate(
                      'xpack.agentBuilder.agents.form.settings.presentationAvatarLabel',
                      {
                        defaultMessage: 'Avatar color and symbol',
                      }
                    )}
                  </span>
                </EuiTitle>

                <EuiText size="s" color="subdued">
                  {i18n.translate(
                    'xpack.agentBuilder.agents.form.settings.presentationAvatarDescription',
                    {
                      defaultMessage:
                        "Customize the agent's avatar color and symbol (emoji or 2-letter code) to help visually distinguish and identify it in the UI.",
                    }
                  )}
                </EuiText>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={2} css={formFlexColumnStyles}>
          <EuiFormRow
            label={i18n.translate('xpack.agentBuilder.agents.form.nameLabel', {
              defaultMessage: 'Display name',
            })}
            isInvalid={!!formState.errors.name}
            error={formState.errors.name?.message}
          >
            <Controller
              name="name"
              control={control}
              render={({ field: { ref, ...rest } }) => (
                <EuiFieldText
                  {...rest}
                  inputRef={ref}
                  disabled={isFormDisabled}
                  isInvalid={!!formState.errors.name}
                  aria-label={i18n.translate('xpack.agentBuilder.agents.form.nameAriaLabel', {
                    defaultMessage: 'Agent display name input field',
                  })}
                  data-test-subj="agentSettingsDisplayNameInput"
                />
              )}
            />
          </EuiFormRow>

          <EuiFormRow
            label={i18n.translate('xpack.agentBuilder.agents.form.descriptionLabel', {
              defaultMessage: 'Display description',
            })}
            isInvalid={!!formState.errors.description}
            error={formState.errors.description?.message}
          >
            <Controller
              name="description"
              control={control}
              render={({ field: { ref, ...rest } }) => (
                <EuiTextArea
                  {...rest}
                  inputRef={ref}
                  rows={4}
                  disabled={isFormDisabled}
                  isInvalid={!!formState.errors.configuration?.instructions}
                  aria-label={i18n.translate(
                    'xpack.agentBuilder.agents.form.descriptionAriaLabel',
                    {
                      defaultMessage: 'Agent display description text area',
                    }
                  )}
                  data-test-subj="agentSettingsDescriptionInput"
                />
              )}
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          <EuiFlexGroup direction="row" gutterSize="s" alignItems="flexStart">
            <EuiFlexItem grow={1}>
              <EuiFormRow
                label={i18n.translate('xpack.agentBuilder.agents.form.avatarColorLabel', {
                  defaultMessage: 'Avatar color',
                })}
                labelAppend={
                  <EuiText size="xs" color="subdued">
                    {labels.common.optional}
                  </EuiText>
                }
                isInvalid={!!formState.errors.avatar_color}
                error={formState.errors.avatar_color?.message}
              >
                <Controller
                  name="avatar_color"
                  control={control}
                  render={({ field: { onChange, value } }) => (
                    <EuiColorPicker
                      onChange={onChange}
                      color={value}
                      disabled={isFormDisabled}
                      isInvalid={!!formState.errors.avatar_color}
                      aria-label={i18n.translate(
                        'xpack.agentBuilder.agents.form.avatarColorAriaLabel',
                        {
                          defaultMessage: 'Agent avatar color picker',
                        }
                      )}
                    />
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={1}>
              <EuiFormRow
                label={i18n.translate('xpack.agentBuilder.agents.form.avatarSymbolLabel', {
                  defaultMessage: 'Avatar symbol',
                })}
                labelAppend={
                  <EuiText size="xs" color="subdued">
                    {labels.common.optional}
                  </EuiText>
                }
                isInvalid={!!formState.errors.avatar_symbol}
                error={formState.errors.avatar_symbol?.message}
              >
                <Controller
                  name="avatar_symbol"
                  control={control}
                  render={({ field: { ref, ...rest } }) => (
                    <EuiFieldText
                      {...rest}
                      onChange={(event) => {
                        rest.onChange(truncateAvatarSymbol(event.target.value));
                      }}
                      inputRef={ref}
                      disabled={isFormDisabled}
                      isInvalid={!!formState.errors.avatar_symbol}
                      aria-label={i18n.translate(
                        'xpack.agentBuilder.agents.form.avatarSymbolAriaLabel',
                        {
                          defaultMessage: 'Agent avatar symbol input field',
                        }
                      )}
                    />
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {showAgentWorkflowsSection && (
        <>
          <EuiHorizontalRule />

          <EuiFlexGroup
            direction="row"
            gutterSize="xl"
            alignItems="flexStart"
            aria-labelledby="workflow-section-title"
          >
            <EuiFlexItem grow={1}>
              <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
                <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
                  <EuiIcon type="play" aria-hidden={true} />
                  <EuiTitle size="xs">
                    <h2 id="workflow-section-title">
                      {i18n.translate('xpack.agentBuilder.agents.form.settings.workflowTitle', {
                        defaultMessage: 'Pre-execution workflow',
                      })}
                    </h2>
                  </EuiTitle>
                </EuiFlexGroup>
                <EuiText size="s" color="subdued">
                  {i18n.translate('xpack.agentBuilder.agents.form.settings.workflowDescription', {
                    defaultMessage:
                      'Runs immediately when the agent is invoked, before the first LLM call.',
                  })}
                </EuiText>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={2} css={formFlexColumnStyles}>
              <EuiFormRow
                fullWidth
                label={i18n.translate('xpack.agentBuilder.agents.form.settings.workflowLabel', {
                  defaultMessage: 'Workflows',
                })}
                labelAppend={
                  <EuiText size="xs" color="subdued">
                    {labels.common.optional}
                  </EuiText>
                }
                isInvalid={!!formState.errors.configuration?.workflow_ids}
                error={formState.errors.configuration?.workflow_ids?.message}
              >
                <WorkflowPicker
                  name="configuration.workflow_ids"
                  singleSelection={false}
                  isDisabled={isFormDisabled}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};
