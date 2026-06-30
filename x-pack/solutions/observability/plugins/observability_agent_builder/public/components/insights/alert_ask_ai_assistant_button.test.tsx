/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EuiThemeProvider } from '@elastic/eui';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { OBSERVABILITY_ALERT_ATTACHMENT_TYPE_ID } from '../../../common';
import { AlertAskAiAssistantButton } from './alert_ask_ai_assistant_button';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { useGenAIConnectors } from '../../hooks/use_genai_connectors';

jest.mock('../../hooks/use_kibana');
jest.mock('../../hooks/use_license');
jest.mock('../../hooks/use_genai_connectors');

const mockUseUiSetting$ = jest.fn();
jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useUiSetting$: () => mockUseUiSetting$(),
}));

const mockUseKibana = useKibana as jest.Mock;
const mockUseLicense = useLicense as jest.Mock;
const mockUseGenAIConnectors = useGenAIConnectors as jest.Mock;

const BUTTON_SELECTOR = 'observabilityAgentBuilderAlertAskAiAssistantButton';

const openChat = jest.fn();

interface Overrides {
  hasConnectors?: boolean;
  hasAgentBuilder?: boolean;
  chatExperience?: AIChatExperience;
  hasCapability?: boolean;
  hasEnterpriseLicense?: boolean;
}

function setup({
  hasConnectors = true,
  hasAgentBuilder = true,
  chatExperience = AIChatExperience.Agent,
  hasCapability = true,
  hasEnterpriseLicense = true,
}: Overrides = {}) {
  mockUseGenAIConnectors.mockReturnValue({ hasConnectors });
  mockUseUiSetting$.mockReturnValue([chatExperience]);
  mockUseLicense.mockReturnValue({
    getLicense: () => ({
      hasAtLeast: (tier: string) => (tier === 'enterprise' ? hasEnterpriseLicense : true),
    }),
  });
  mockUseKibana.mockReturnValue({
    services: {
      agentBuilder: hasAgentBuilder ? { openChat } : undefined,
      application: { capabilities: { agentBuilder: { show: hasCapability } } },
    },
  });

  return render(
    <EuiThemeProvider>
      <AlertAskAiAssistantButton alertId="alert-1" alertTitle="High latency" />
    </EuiThemeProvider>
  );
}

describe('AlertAskAiAssistantButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders when all guard conditions pass', () => {
    setup();
    expect(screen.getByTestId(BUTTON_SELECTOR)).toBeInTheDocument();
  });

  it.each([
    ['no GenAI connectors', { hasConnectors: false }],
    ['no agentBuilder service', { hasAgentBuilder: false }],
    ['chat experience is not Agent', { chatExperience: AIChatExperience.Classic }],
    ['no agentBuilder capability', { hasCapability: false }],
    ['no enterprise license', { hasEnterpriseLicense: false }],
  ])('renders nothing when %s', (_label, overrides) => {
    setup(overrides as Overrides);
    expect(screen.queryByTestId(BUTTON_SELECTOR)).not.toBeInTheDocument();
  });

  it('opens the agent chat with the alert attachment and auto-sends the prompt on click', () => {
    setup();
    fireEvent.click(screen.getByTestId(BUTTON_SELECTOR));

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({
        newConversation: true,
        autoSendInitialMessage: true,
        initialMessage: 'Investigate this alert',
        attachments: [
          {
            type: OBSERVABILITY_ALERT_ATTACHMENT_TYPE_ID,
            data: { alertId: 'alert-1', attachmentLabel: 'High latency' },
          },
        ],
      })
    );
  });

  it('uses a custom prompt when provided', () => {
    mockUseGenAIConnectors.mockReturnValue({ hasConnectors: true });
    mockUseUiSetting$.mockReturnValue([AIChatExperience.Agent]);
    mockUseLicense.mockReturnValue({ getLicense: () => ({ hasAtLeast: () => true }) });
    mockUseKibana.mockReturnValue({
      services: {
        agentBuilder: { openChat },
        application: { capabilities: { agentBuilder: { show: true } } },
      },
    });

    render(
      <EuiThemeProvider>
        <AlertAskAiAssistantButton alertId="alert-2" prompt="Why did this fire?" />
      </EuiThemeProvider>
    );

    fireEvent.click(screen.getByTestId(BUTTON_SELECTOR));
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({ initialMessage: 'Why did this fire?' })
    );
  });
});
