/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useCallback } from 'react';
import {
  EuiPageSection,
  EuiSpacer,
  EuiSplitPanel,
  EuiDescribedFormGroup,
  EuiFormRow,
  EuiTitle,
  EuiLink,
  EuiFlexItem,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import { isEmpty } from 'lodash';
import {
  AI_CHAT_EXPERIENCE_TYPE,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AGENT_BUILDER_EVENT_TYPES } from '@kbn/agent-builder-common/telemetry';
import { useEnabledFeatures } from '../contexts/enabled_features_context';
import { useKibana } from '../hooks/use_kibana';
import { GoToSpacesButton } from './go_to_spaces_button';
import { useSettingsContext } from '../contexts/settings_context';
import { BottomBarActions } from './bottom_bar_actions/bottom_bar_actions';
import { AIAssistantVisibility } from './ai_assistant_visibility/ai_assistant_visibility';
import { ChatExperience } from './chat_experience/chat_experience';
import { PrePromptWorkflowSection } from './pre_prompt_workflow_section';
import { DocumentationSection } from './documentation';
import { AnonymizationProfilesSection } from './anonymization_profiles_section';
import { TokenUsageTracking } from './token_usage_tracking/token_usage_tracking';
import { AgentBuilderTracingSection } from './agent_builder_tracing/agent_builder_tracing_section';

interface GenAiSettingsAppProps {
  setBreadcrumbs: ManagementAppMountParams['setBreadcrumbs'];
}

const TELEMETRY_SOURCE = 'stack_management' as const;

const isAIChatExperience = (value: unknown): value is AIChatExperience =>
  typeof value === 'string' &&
  (value === AIChatExperience.Classic || value === AIChatExperience.Agent);

export const GenAiSettingsApp: React.FC<GenAiSettingsAppProps> = ({ setBreadcrumbs }) => {
  const { services } = useKibana();
  const { application, http, productDocBase, analytics, genAiSettingsApi, notifications } =
    services;
  const {
    showSpacesIntegration,
    isPermissionsBased,
    showAiBreadcrumb,
    showAiAssistantsVisibilitySetting,
    showChatExperienceSetting,
    showAnonymizationProfilesSection,
  } = useEnabledFeatures();
  const { euiTheme } = useEuiTheme();
  const { fields, unsavedChanges, isSaving, cleanUnsavedChanges, saveAll } = useSettingsContext();

  // Determine current chat experience (including unsaved changes)
  const chatExperienceField = fields[AI_CHAT_EXPERIENCE_TYPE];
  const currentChatExperience =
    unsavedChanges[AI_CHAT_EXPERIENCE_TYPE]?.unsavedValue ??
    chatExperienceField?.savedValue ??
    chatExperienceField?.defaultValue ??
    AIChatExperience.Agent;
  const isAgentExperience = currentChatExperience === AIChatExperience.Agent;
  const hasAgentBuilderPrivileges = application.capabilities.agentBuilder?.manageAgents === true;

  const canManageSpaces = application.capabilities.management.kibana.spaces;

  useEffect(() => {
    const breadcrumbs = [
      ...(showAiBreadcrumb
        ? [
            {
              text: i18n.translate('genAiSettings.breadcrumbs.ai', {
                defaultMessage: 'AI',
              }),
            },
          ]
        : []),
      {
        text: i18n.translate('genAiSettings.breadcrumbs.genAiSettings', {
          defaultMessage: 'GenAI Settings',
        }),
      },
    ];

    setBreadcrumbs(breadcrumbs);
  }, [setBreadcrumbs, showAiBreadcrumb]);

  const handleNavigateToSpaces = useCallback(() => {
    const spacesPath = `/kibana/spaces/edit/${http.spaceId}${isPermissionsBased ? '/roles' : ''}`;

    application.navigateToApp('management', {
      path: spacesPath,
      openInNewTab: true,
    });
  }, [application, http.spaceId, isPermissionsBased]);

  async function handleSave() {
    const tokenUsageTrackingTurnedOn =
      unsavedChanges[GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING]?.unsavedValue === true;

    const tracingSettingChanged =
      unsavedChanges[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID]?.unsavedValue !== undefined;

    const savedChatExperience = isAIChatExperience(chatExperienceField?.savedValue)
      ? chatExperienceField.savedValue
      : undefined;
    const defaultChatExperience = isAIChatExperience(chatExperienceField?.defaultValue)
      ? (chatExperienceField.defaultValue as AIChatExperience)
      : undefined;
    const unsavedChatExperience = isAIChatExperience(
      unsavedChanges[AI_CHAT_EXPERIENCE_TYPE]?.unsavedValue
    )
      ? (unsavedChanges[AI_CHAT_EXPERIENCE_TYPE]?.unsavedValue as AIChatExperience)
      : undefined;
    const normalizedSavedChatExperience = savedChatExperience ?? AIChatExperience.Agent;

    // Telemetry should compare the effective "before" and "after" values.
    // - "before" should include the default if there is no saved value.
    // - "after" should reflect the unsaved change, or fall back to "before" if unchanged.
    const telemetryBeforeChatExperience =
      savedChatExperience ?? defaultChatExperience ?? AIChatExperience.Agent;
    const telemetryAfterChatExperience = unsavedChatExperience ?? telemetryBeforeChatExperience;
    const shouldTrackOptInConfirmed =
      telemetryBeforeChatExperience !== AIChatExperience.Agent &&
      telemetryAfterChatExperience === AIChatExperience.Agent;
    const shouldTrackOptOut =
      telemetryBeforeChatExperience === AIChatExperience.Agent &&
      telemetryAfterChatExperience !== AIChatExperience.Agent;

    const needsReload = await saveAll();

    if (tokenUsageTrackingTurnedOn) {
      try {
        await genAiSettingsApi('POST /internal/gen_ai_settings/install_token_usage_dashboard', {
          signal: null,
        });
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.gen_ai_settings.tokenUsageTracking.installDashboardError', {
            defaultMessage: 'Failed to install token usage dashboard',
          }),
          text: error?.body?.message ?? error?.message,
        });
      }
    }

    if (tracingSettingChanged) {
      try {
        await genAiSettingsApi(
          'POST /internal/gen_ai_settings/agent_builder/sync_tracing_platform_features',
          { signal: null }
        );
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.gen_ai_settings.agentBuilderTracing.syncFeaturesError', {
            defaultMessage: 'Failed to sync Agent Builder tracing features',
          }),
          text: error?.body?.message ?? error?.message,
        });
      }
    }

    if (shouldTrackOptInConfirmed) {
      analytics?.reportEvent(AGENT_BUILDER_EVENT_TYPES.OptInAction, {
        action: 'confirmed',
        source: TELEMETRY_SOURCE,
      });
    }
    if (shouldTrackOptOut) {
      analytics?.reportEvent(AGENT_BUILDER_EVENT_TYPES.OptOut, {
        source: TELEMETRY_SOURCE,
      });
    }
    if (needsReload) {
      // Only skip `step_reached` after reload if it could have been reported on this page load.
      // This prevents suppressing the Agent -> Classic transition, where `step_reached` should be
      // emitted after reload.
      const shouldSkipStepReachedOnReload =
        normalizedSavedChatExperience === AIChatExperience.Classic &&
        !(savedChatExperience === undefined && defaultChatExperience === AIChatExperience.Agent);

      if (shouldSkipStepReachedOnReload) {
        try {
          // We reload the page after saving; without this one-shot flag, `ChatExperience` would emit
          // `step_reached` both before and after the reload.
          window.sessionStorage.setItem('gen_ai_settings:skip_step_reached_once', `${Date.now()}`);
        } catch {
          // ignore
        }
      }
      window.location.reload();
    }
  }

  return (
    <>
      <div data-test-subj="genAiSettingsPage">
        <EuiTitle size="l">
          <h2 data-test-subj="genAiSettingsTitle">
            <FormattedMessage id="xpack.genAiSettings.pageTitle" defaultMessage="GenAI Settings" />
          </h2>
        </EuiTitle>

        <EuiPageSection
          paddingSize="none"
          css={{
            paddingTop: euiTheme.size.l,
          }}
        >
          <EuiSplitPanel.Outer hasBorder grow={false}>
            <EuiSplitPanel.Inner color="subdued">
              <EuiTitle size="s">
                <h3 data-test-subj="generalSectionTitle">
                  <FormattedMessage id="genAiSettings.general.title" defaultMessage="General" />
                </h3>
              </EuiTitle>
            </EuiSplitPanel.Inner>
            <EuiSplitPanel.Inner>
              {showSpacesIntegration && canManageSpaces && (
                <EuiDescribedFormGroup
                  fullWidth
                  data-test-subj="aiFeatureVisibilitySection"
                  title={
                    <h3 data-test-subj="aiFeatureVisibilityTitle">
                      <FormattedMessage
                        id="genAiSettings.aiFeatureVisibilityLabel"
                        defaultMessage="AI feature visibility"
                      />
                    </h3>
                  }
                  description={
                    <p>
                      {isPermissionsBased ? (
                        <FormattedMessage
                          id="genAiSettings.solutionViewDescriptionLabel"
                          defaultMessage="Turn AI-powered features on or off (for custom roles only) on the {permissionsTab} in the {spaces} settings. Create custom roles at {rolesLink}."
                          values={{
                            permissionsTab: (
                              <strong>
                                <FormattedMessage
                                  id="genAiSettings.permissionsTab"
                                  defaultMessage="Permissions tab"
                                />
                              </strong>
                            ),
                            spaces: (
                              <strong>
                                <FormattedMessage
                                  id="genAiSettings.spacesLabel"
                                  defaultMessage="Spaces"
                                />
                              </strong>
                            ),
                            rolesLink: (
                              <EuiLink
                                href={application.getUrlForApp('management', {
                                  path: '/security/roles',
                                })}
                              >
                                <FormattedMessage
                                  id="genAiSettings.rolesLink"
                                  defaultMessage="Stack Management > Roles"
                                />
                              </EuiLink>
                            ),
                          }}
                        />
                      ) : (
                        <FormattedMessage
                          id="genAiSettings.showAIAssistantDescriptionLabel"
                          defaultMessage="You can enable or disable AI-powered features from the {space} settings page."
                          values={{
                            space: (
                              <strong>
                                <FormattedMessage
                                  id="genAiSettings.spacesLabel"
                                  defaultMessage="Space"
                                />
                              </strong>
                            ),
                          }}
                        />
                      )}
                    </p>
                  }
                >
                  <EuiFormRow fullWidth>
                    <GoToSpacesButton
                      onNavigateToSpaces={handleNavigateToSpaces}
                      navigateToPermissions={isPermissionsBased}
                    />
                  </EuiFormRow>
                </EuiDescribedFormGroup>
              )}
              {showChatExperienceSetting && (
                <EuiFlexItem>
                  <ChatExperience />
                </EuiFlexItem>
              )}
              {showAiAssistantsVisibilitySetting && !isAgentExperience && (
                <EuiFlexItem>
                  <AIAssistantVisibility />
                </EuiFlexItem>
              )}
              <EuiFlexItem>
                <TokenUsageTracking />
              </EuiFlexItem>
            </EuiSplitPanel.Inner>
          </EuiSplitPanel.Outer>

          <PrePromptWorkflowSection />

          {hasAgentBuilderPrivileges && <AgentBuilderTracingSection />}

          {isAgentExperience && (showChatExperienceSetting || hasAgentBuilderPrivileges) && (
            <>
              <EuiSpacer size="l" />

              <DocumentationSection productDocBase={productDocBase} />
            </>
          )}

          {showAnonymizationProfilesSection && (
            <>
              <EuiSpacer size="l" />
              <EuiSplitPanel.Outer hasBorder grow={false}>
                <EuiSplitPanel.Inner color="subdued">
                  <EuiTitle size="s">
                    <h3 data-test-subj="anonymizationSectionTitle">
                      <FormattedMessage
                        id="genAiSettings.anonymization.sectionTitle"
                        defaultMessage="Anonymization"
                      />
                    </h3>
                  </EuiTitle>
                </EuiSplitPanel.Inner>
                <EuiSplitPanel.Inner>
                  <AnonymizationProfilesSection />
                </EuiSplitPanel.Inner>
              </EuiSplitPanel.Outer>
            </>
          )}
        </EuiPageSection>
      </div>
      {!isEmpty(unsavedChanges) && (
        <BottomBarActions
          isLoading={isSaving}
          onDiscardChanges={cleanUnsavedChanges}
          onSave={handleSave}
          saveLabel={i18n.translate('xpack.gen_ai_settings.settings.saveButton', {
            defaultMessage: 'Save changes',
          })}
          unsavedChangesCount={Object.keys(unsavedChanges).length}
          appTestSubj="genAiSettingsSaveBar"
        />
      )}
    </>
  );
};
