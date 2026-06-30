/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { GenAiSettingsApp } from './gen_ai_settings_app';
import { useEnabledFeatures } from '../contexts/enabled_features_context';
import { SettingsContextProvider } from '../contexts/settings_context';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AGENT_BUILDER_EVENT_TYPES } from '@kbn/agent-builder-common/telemetry';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE,
  AI_CHAT_EXPERIENCE_TYPE,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
} from '@kbn/management-settings-ids';
import { WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows';

// Mock the context hook
jest.mock('../contexts/enabled_features_context');
const mockUseEnabledFeatures = useEnabledFeatures as jest.MockedFunction<typeof useEnabledFeatures>;

// Mock productDocBase
const mockProductDocBase = {
  installation: {
    getStatus: jest.fn().mockResolvedValue({
      overall: 'uninstalled',
    }),
    install: jest.fn().mockResolvedValue({}),
    uninstall: jest.fn().mockResolvedValue({}),
  },
};

describe('GenAiSettingsApp', () => {
  const coreStart = coreMock.createStart();
  const setBreadcrumbs = jest.fn();

  const createSettingsMock = (overrides = {}) => ({
    'genAiSettings:defaultAIConnector': {
      value: 'NO_DEFAULT_CONNECTOR',
      type: 'string',
    },
    'genAiSettings:defaultAIConnectorOnly': {
      value: false,
      type: 'boolean',
    },
    'agentBuilder:prePromptWorkflowIds': {
      value: [],
      type: 'array',
    },
    [AI_CHAT_EXPERIENCE_TYPE]: {
      value: AIChatExperience.Classic,
      type: 'select',
      options: [AIChatExperience.Classic, AIChatExperience.Agent],
    },
    [AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE]: {
      value: 'default',
      type: 'select',
      options: ['default'],
    },
    [GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING]: {
      value: false,
      type: 'boolean',
    },
    ...overrides,
  });

  const createFeatureFlagsMock = (overrides = {}) => ({
    showSpacesIntegration: true,
    isPermissionsBased: false,
    showAiBreadcrumb: true,
    showAiAssistantsVisibilitySetting: true,
    showChatExperienceSetting: true,
    showAnonymizationProfilesSection: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      management: {
        kibana: {
          spaces: true,
        },
      },
      observabilityAIAssistant: { show: true },
      securitySolutionAssistant: { 'ai-assistant': true },
      securitySolution: { show: true, crud: true },
      agentBuilder: { show: true },
      anonymization: { show: true, manage: true },
      advancedSettings: { show: true, save: true },
    };

    // Mock feature flags to enable AI Agents by default
    jest
      .spyOn(coreStart.featureFlags, 'getBooleanValue')
      .mockImplementation((_flagName: string, _fallbackValue: boolean) => true as boolean);

    // Mock settings client with default settings
    coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);
    coreStart.application.getUrlForApp.mockImplementation((appId, options) => {
      if (appId === 'workflows') {
        return `/app/workflows${options?.path ?? ''}`;
      }
      return `/app/${appId}${options?.path ?? ''}`;
    });

    // Default mock for enabled features
    mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());
  });

  const renderComponent = (props = {}, servicesOverrides: Record<string, unknown> = {}) => {
    const services = {
      ...coreStart,
      productDocBase: mockProductDocBase,
      agentBuilder: {
        tools: {
          listWorkflows: jest.fn().mockResolvedValue({ results: [] }),
        },
      },
      analytics: { reportEvent: jest.fn() },
      ...servicesOverrides,
    };
    return renderWithI18n(
      <QueryClientProvider client={new QueryClient()}>
        <KibanaContextProvider services={services}>
          <SettingsContextProvider>
            <GenAiSettingsApp setBreadcrumbs={setBreadcrumbs} {...props} />
          </SettingsContextProvider>
        </KibanaContextProvider>
      </QueryClientProvider>
    );
  };

  describe('breadcrumbs', () => {
    it('should set breadcrumbs correctly based on showAiBreadcrumb', () => {
      renderComponent();

      expect(setBreadcrumbs).toHaveBeenCalledWith([
        {
          text: 'AI',
        },
        {
          text: 'GenAI Settings',
        },
      ]);

      jest.clearAllMocks();

      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock({ showAiBreadcrumb: false }));

      renderComponent();

      expect(setBreadcrumbs).toHaveBeenCalledWith([
        {
          text: 'GenAI Settings',
        },
      ]);
    });
  });

  describe('content rendering', () => {
    it('should render all expected sections with default settings', () => {
      renderComponent();

      // Main page section
      expect(screen.getByTestId('genAiSettingsPage')).toBeInTheDocument();
      expect(screen.getByTestId('genAiSettingsTitle')).toBeInTheDocument();

      // Feature visibility section (with default settings)
      expect(screen.getByTestId('aiFeatureVisibilitySection')).toBeInTheDocument();
      expect(screen.getByTestId('goToSpacesButton')).toBeInTheDocument();
      expect(screen.queryByTestId('agentBuilderSectionTitle')).not.toBeInTheDocument();

      expect(screen.queryByTestId('anonymizationProfilesSection')).not.toBeInTheDocument();
    });

    it('should conditionally render sections based on settings', () => {
      mockUseEnabledFeatures.mockReturnValue(
        createFeatureFlagsMock({ showSpacesIntegration: false })
      );

      const firstRender = renderComponent();
      expect(screen.queryByTestId('aiFeatureVisibilitySection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goToSpacesButton')).not.toBeInTheDocument();
      firstRender.unmount();

      mockUseEnabledFeatures.mockReturnValue(
        createFeatureFlagsMock({ showAnonymizationProfilesSection: false })
      );
      const secondRender = renderComponent();
      expect(screen.queryByTestId('anonymizationProfilesSection')).not.toBeInTheDocument();
      secondRender.unmount();

      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        management: {
          kibana: {
            spaces: false,
          },
        },
      };

      const thirdRender = renderComponent();
      expect(screen.queryByTestId('aiFeatureVisibilitySection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('goToSpacesButton')).not.toBeInTheDocument();
      thirdRender.unmount();
    });
  });

  describe('Anonymization Profiles section', () => {
    beforeEach(() => {
      mockUseEnabledFeatures.mockReturnValue(
        createFeatureFlagsMock({ showAnonymizationProfilesSection: true })
      );
    });

    it('switches to read-only mode when manage capability is absent', async () => {
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        anonymization: { show: true, manage: false },
      };

      renderComponent();

      expect(await screen.findByTestId('anonymizationProfilesSection')).toBeInTheDocument();
      expect(screen.getByText('Read only')).toBeInTheDocument();
      expect(screen.getByTestId('anonymizationProfilesCreateProfile')).toBeDisabled();
    });

    it('opens create profile flyout in manage mode', async () => {
      renderComponent();

      fireEvent.click(await screen.findByTestId('anonymizationProfilesCreateProfile'));
      expect(await screen.findByTestId('anonymizationProfilesProfileFlyout')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByTestId('anonymizationProfilesProfileFlyout')).not.toBeInTheDocument();
      });
    });
  });

  describe('pre-execution workflow section gating', () => {
    it('renders pre-execution workflow section when required advanced settings are enabled', async () => {
      jest.spyOn(coreStart.settings.client, 'get').mockImplementation((key, fallback) => {
        if (
          key === WORKFLOWS_UI_SETTING_ID ||
          key === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
        ) {
          return true;
        }
        return fallback;
      });

      renderComponent();

      expect(await screen.findByTestId('agentBuilderSectionTitle')).toBeInTheDocument();
      expect(await screen.findByTestId('genAiSettingsPrePromptWorkflowPicker')).toBeInTheDocument();
    });

    it('does not render pre-execution workflow section when workflows UI advanced setting is disabled', () => {
      jest.spyOn(coreStart.settings.client, 'get').mockImplementation((key, fallback) => {
        if (key === WORKFLOWS_UI_SETTING_ID) {
          return false;
        }
        return fallback;
      });
      jest
        .spyOn(coreStart.featureFlags, 'getBooleanValue')
        .mockImplementation((_flagName, _fallbackValue) => true);

      renderComponent();

      expect(screen.queryByTestId('agentBuilderSectionTitle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('genAiSettingsPrePromptWorkflowPicker')).not.toBeInTheDocument();
    });

    it('does not render pre-execution workflow section when experimental features setting is disabled', () => {
      jest.spyOn(coreStart.settings.client, 'get').mockImplementation((key, fallback) => {
        if (key === WORKFLOWS_UI_SETTING_ID) {
          return true;
        }
        if (key === AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) {
          return false;
        }
        return fallback;
      });

      renderComponent();

      expect(screen.queryByTestId('agentBuilderSectionTitle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('genAiSettingsPrePromptWorkflowPicker')).not.toBeInTheDocument();
    });
  });

  describe('permissions-based view', () => {
    it('should render permissions button when isPermissionsBased is true and canManageSpaces is true', () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock({ isPermissionsBased: true }));
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        management: {
          kibana: {
            spaces: true,
          },
        },
      };

      renderComponent();
      expect(screen.getByTestId('goToPermissionsTabButton')).toBeInTheDocument();
    });

    it('should not render permissions button when canManageSpaces is false', () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock({ isPermissionsBased: true }));
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        management: {
          kibana: {
            spaces: false,
          },
        },
      };

      renderComponent();
      expect(screen.queryByTestId('goToPermissionsTabButton')).not.toBeInTheDocument();
    });
  });

  describe('AI Chat Experience Setting', () => {
    it('should render chat experience setting section when showChatExperienceSetting is true', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      renderComponent();

      expect(
        await screen.findByTestId(
          'management-settings-editField-aiAssistant:preferredChatExperience'
        )
      ).toBeInTheDocument();
    });

    it('should not render chat experience setting section when showChatExperienceSetting is false', () => {
      mockUseEnabledFeatures.mockReturnValue(
        createFeatureFlagsMock({ showChatExperienceSetting: false })
      );

      renderComponent();

      expect(
        screen.queryByTestId('management-settings-editField-aiAssistant:preferredChatExperience')
      ).not.toBeInTheDocument();
    });
  });

  describe('AI Assistant Visibility conditional rendering', () => {
    it('renders AI Assistant Visibility when chat experience is Classic', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

      renderComponent();

      expect(
        await screen.findByTestId(
          `management-settings-editField-${AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE}`
        )
      ).toBeInTheDocument();
    });

    it('hides AI Assistant Visibility when chat experience is changed to Agents', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

      renderComponent();

      // Initially, both fields should be visible (Classic mode)
      const visibilityField = await screen.findByTestId(
        `management-settings-editField-${AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE}`
      );
      expect(visibilityField).toBeInTheDocument();

      const chatExperienceField = await screen.findByTestId(
        `management-settings-editField-${AI_CHAT_EXPERIENCE_TYPE}`
      );
      expect(chatExperienceField).toBeInTheDocument();

      // Change the select value to Agent
      fireEvent.change(chatExperienceField, { target: { value: AIChatExperience.Agent } });

      // After changing to Agent, the AI Assistant Visibility field should be hidden
      await waitFor(() => {
        expect(
          screen.queryByTestId(
            `management-settings-editField-${AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE}`
          )
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Documentation Section conditional rendering', () => {
    it('hides Documentation section when chat experience is Classic', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

      renderComponent();

      // Settings fields load asynchronously; until then `currentChatExperience` falls back to Agent.
      await waitFor(() => {
        expect(screen.queryByTestId('documentationSection')).not.toBeInTheDocument();
      });
    });

    it('shows Documentation section when chat experience is Agent', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(
        createSettingsMock({
          [AI_CHAT_EXPERIENCE_TYPE]: {
            value: AIChatExperience.Classic,
            userValue: AIChatExperience.Agent, // userValue maps to savedValue
            type: 'select',
            options: [AIChatExperience.Classic, AIChatExperience.Agent],
          },
        }) as any
      );

      renderComponent();

      // Documentation section should be visible in Agent mode
      expect(await screen.findByTestId('documentationSection')).toBeInTheDocument();
    });
  });

  it('returns opt out telemetry when saving a switch from Agent to Classic', async () => {
    const reportEvent = jest.fn();
    mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

    coreStart.settings.client.getAll.mockReturnValue(
      createSettingsMock({
        [AI_CHAT_EXPERIENCE_TYPE]: {
          value: AIChatExperience.Classic,
          userValue: AIChatExperience.Agent,
          type: 'select',
          options: [AIChatExperience.Classic, AIChatExperience.Agent],
        },
      }) as any
    );

    renderComponent({}, { analytics: { reportEvent } });

    const chatExperienceSelect = await screen.findByTestId(
      `management-settings-editField-${AI_CHAT_EXPERIENCE_TYPE}`
    );
    fireEvent.change(chatExperienceSelect, { target: { value: AIChatExperience.Classic } });

    const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.OptOut, {
        source: 'stack_management',
      });
    });
  });

  it('returns opt out telemetry when saving a switch from default Agent to Classic (no userValue)', async () => {
    const reportEvent = jest.fn();
    mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

    coreStart.settings.client.getAll.mockReturnValue(
      createSettingsMock({
        [AI_CHAT_EXPERIENCE_TYPE]: {
          value: AIChatExperience.Agent,
          type: 'select',
          options: [AIChatExperience.Classic, AIChatExperience.Agent],
        },
      }) as any
    );

    renderComponent({}, { analytics: { reportEvent } });

    const chatExperienceSelect = await screen.findByTestId(
      `management-settings-editField-${AI_CHAT_EXPERIENCE_TYPE}`
    );
    fireEvent.change(chatExperienceSelect, { target: { value: AIChatExperience.Classic } });

    const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(reportEvent).toHaveBeenCalledWith(AGENT_BUILDER_EVENT_TYPES.OptOut, {
        source: 'stack_management',
      });
    });
  });

  describe('Token usage tracking', () => {
    it('installs the token usage dashboard when the user turns the setting on', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

      const genAiSettingsApi = jest.fn().mockResolvedValue({ installed: true });

      renderComponent({}, { genAiSettingsApi });

      const tokenUsageSwitch = await screen.findByTestId(
        `management-settings-editField-${GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING}`
      );
      fireEvent.click(tokenUsageSwitch);

      const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(genAiSettingsApi).toHaveBeenCalledWith(
          'POST /internal/gen_ai_settings/install_token_usage_dashboard',
          { signal: null }
        );
      });
    });

    it('does not install the dashboard when token usage tracking is not changed', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(
        createSettingsMock({
          [AI_CHAT_EXPERIENCE_TYPE]: {
            value: AIChatExperience.Classic,
            userValue: AIChatExperience.Agent,
            type: 'select',
            options: [AIChatExperience.Classic, AIChatExperience.Agent],
          },
        }) as any
      );

      const genAiSettingsApi = jest.fn().mockResolvedValue({ installed: false });

      renderComponent({}, { genAiSettingsApi });

      const chatExperienceSelect = await screen.findByTestId(
        `management-settings-editField-${AI_CHAT_EXPERIENCE_TYPE}`
      );
      fireEvent.change(chatExperienceSelect, { target: { value: AIChatExperience.Classic } });

      const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(saveButton).toBeInTheDocument();
      });

      expect(genAiSettingsApi).not.toHaveBeenCalled();
    });

    it('shows a danger toast when the install request fails', async () => {
      mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

      coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

      const genAiSettingsApi = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('boom'), { body: { message: 'boom' } }));
      const addDanger = jest.spyOn(coreStart.notifications.toasts, 'addDanger');

      renderComponent({}, { genAiSettingsApi });

      const tokenUsageSwitch = await screen.findByTestId(
        `management-settings-editField-${GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING}`
      );
      fireEvent.click(tokenUsageSwitch);

      const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(addDanger).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to install token usage dashboard',
            text: 'boom',
          })
        );
      });
    });
  });

  it('returns confirmed opt in telemetry when saving a switch to Agent', async () => {
    const reportEvent = jest.fn();
    mockUseEnabledFeatures.mockReturnValue(createFeatureFlagsMock());

    coreStart.settings.client.getAll.mockReturnValue(createSettingsMock() as any);

    renderComponent({}, { analytics: { reportEvent } });

    const chatExperienceSelect = await screen.findByTestId(
      `management-settings-editField-${AI_CHAT_EXPERIENCE_TYPE}`
    );
    fireEvent.change(chatExperienceSelect, { target: { value: AIChatExperience.Agent } });

    const saveButton = await screen.findByTestId('genAiSettingsSaveBarBottomBarActionsButton');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(reportEvent).toHaveBeenLastCalledWith(AGENT_BUILDER_EVENT_TYPES.OptInAction, {
        action: 'confirmed',
        source: 'stack_management',
      });
    });
  });
});
