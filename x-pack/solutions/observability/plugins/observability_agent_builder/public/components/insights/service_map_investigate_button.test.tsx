/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { EuiThemeProvider } from '@elastic/eui';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { useUiSetting$ } from '@kbn/kibana-react-plugin/public';
import { OBSERVABILITY_SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE_ID } from '../../../common';
import { ServiceMapInvestigateButton } from './service_map_investigate_button';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { useGenAIConnectors } from '../../hooks/use_genai_connectors';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useUiSetting$: jest.fn(),
}));

jest.mock('../../hooks/use_kibana');
jest.mock('../../hooks/use_license');
jest.mock('../../hooks/use_genai_connectors');

const mockUseUiSetting$ = useUiSetting$ as jest.Mock;
const mockUseKibana = useKibana as jest.Mock;
const mockUseLicense = useLicense as jest.Mock;
const mockUseGenAIConnectors = useGenAIConnectors as jest.Mock;

const mockOpenChat = jest.fn();

const setupMocks = ({
  hasEnterpriseLicense = true,
  hasConnectors = true,
  isAgentExperience = true,
  hasCapability = true,
  hasAgentBuilder = true,
}: {
  hasEnterpriseLicense?: boolean;
  hasConnectors?: boolean;
  isAgentExperience?: boolean;
  hasCapability?: boolean;
  hasAgentBuilder?: boolean;
} = {}) => {
  mockUseLicense.mockReturnValue({
    hasAtLeast: (level: string) => (level === 'enterprise' ? hasEnterpriseLicense : false),
  });

  mockUseUiSetting$.mockReturnValue([
    isAgentExperience ? AIChatExperience.Agent : AIChatExperience.Classic,
  ]);

  mockUseGenAIConnectors.mockReturnValue({ hasConnectors });

  mockUseKibana.mockReturnValue({
    services: {
      agentBuilder: hasAgentBuilder ? { openChat: mockOpenChat } : undefined,
      application: {
        capabilities: {
          agentBuilder: { show: hasCapability },
        },
      },
    },
  });
};

const defaultProps = {
  rangeFrom: 'now-1h',
  rangeTo: 'now',
};

const renderButton = (
  props: Partial<React.ComponentProps<typeof ServiceMapInvestigateButton>> = {}
) =>
  render(
    <EuiThemeProvider>
      <ServiceMapInvestigateButton {...defaultProps} {...props} />
    </EuiThemeProvider>
  );

describe('ServiceMapInvestigateButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the button when all guard conditions are met', () => {
    setupMocks();
    const { getByTestId } = renderButton();
    expect(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton')).toBeInTheDocument();
  });

  it('has label "Investigate map"', () => {
    setupMocks();
    const { getByText } = renderButton();
    expect(getByText('Investigate map')).toBeInTheDocument();
  });

  it('calls agentBuilder.openChat with service-map-context attachment on click', () => {
    setupMocks();
    const { getByTestId } = renderButton({
      rangeFrom: 'now-1h',
      rangeTo: 'now',
      environment: 'production',
      kuery: 'service.name: "frontend"',
      serviceGroupId: 'sg-1',
      highlightedServiceNames: ['frontend', 'checkout'],
    });

    fireEvent.click(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton'));

    expect(mockOpenChat).toHaveBeenCalledWith(
      expect.objectContaining({
        newConversation: true,
        autoSendInitialMessage: true,
        attachments: [
          expect.objectContaining({
            type: OBSERVABILITY_SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE_ID,
            data: {
              timeRange: { from: 'now-1h', to: 'now' },
              environment: 'production',
              kuery: 'service.name: "frontend"',
              serviceGroupId: 'sg-1',
              highlightedServiceNames: ['frontend', 'checkout'],
            },
          }),
        ],
      })
    );
  });

  it('truncates highlightedServiceNames to the attachment schema cap', () => {
    setupMocks();
    const highlightedServiceNames = Array.from({ length: 60 }, (_, i) => `service-${i}`);
    const { getByTestId } = renderButton({
      rangeFrom: 'now-1h',
      rangeTo: 'now',
      highlightedServiceNames,
    });

    fireEvent.click(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton'));

    // Beyond the cap the server rejects the whole attachment, so the button trims it.
    const callData = mockOpenChat.mock.calls[0][0].attachments[0].data;
    expect(callData.highlightedServiceNames).toHaveLength(50);
    expect(callData.highlightedServiceNames[0]).toBe('service-0');
    expect(callData.highlightedServiceNames[49]).toBe('service-49');
  });

  it('omits empty optional fields from attachment data', () => {
    setupMocks();
    const { getByTestId } = renderButton({ rangeFrom: 'now-1h', rangeTo: 'now' });

    fireEvent.click(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton'));

    const callData = mockOpenChat.mock.calls[0][0].attachments[0].data;
    expect(callData).toEqual({ timeRange: { from: 'now-1h', to: 'now' } });
    expect(callData).not.toHaveProperty('environment');
    expect(callData).not.toHaveProperty('kuery');
    expect(callData).not.toHaveProperty('serviceGroupId');
    expect(callData).not.toHaveProperty('highlightedServiceNames');
  });

  it('omits highlightedServiceNames when array is empty', () => {
    setupMocks();
    const { getByTestId } = renderButton({
      rangeFrom: 'now-1h',
      rangeTo: 'now',
      highlightedServiceNames: [],
    });

    fireEvent.click(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton'));

    const callData = mockOpenChat.mock.calls[0][0].attachments[0].data;
    expect(callData).not.toHaveProperty('highlightedServiceNames');
  });

  it('uses a custom prompt when provided', () => {
    setupMocks();
    const { getByTestId } = renderButton({ prompt: 'Custom investigation prompt' });

    fireEvent.click(getByTestId('observabilityAgentBuilderServiceMapInvestigateButton'));

    expect(mockOpenChat).toHaveBeenCalledWith(
      expect.objectContaining({ initialMessage: 'Custom investigation prompt' })
    );
  });

  it('returns null when enterprise license is missing', () => {
    setupMocks({ hasEnterpriseLicense: false });
    const { queryByTestId } = renderButton();
    expect(
      queryByTestId('observabilityAgentBuilderServiceMapInvestigateButton')
    ).not.toBeInTheDocument();
  });

  it('returns null when no GenAI connectors are configured', () => {
    setupMocks({ hasConnectors: false });
    const { queryByTestId } = renderButton();
    expect(
      queryByTestId('observabilityAgentBuilderServiceMapInvestigateButton')
    ).not.toBeInTheDocument();
  });

  it('returns null when chat experience is not set to agent', () => {
    setupMocks({ isAgentExperience: false });
    const { queryByTestId } = renderButton();
    expect(
      queryByTestId('observabilityAgentBuilderServiceMapInvestigateButton')
    ).not.toBeInTheDocument();
  });

  it('returns null when agentBuilder capability is not present', () => {
    setupMocks({ hasCapability: false });
    const { queryByTestId } = renderButton();
    expect(
      queryByTestId('observabilityAgentBuilderServiceMapInvestigateButton')
    ).not.toBeInTheDocument();
  });

  it('returns null when agentBuilder plugin is not available', () => {
    setupMocks({ hasAgentBuilder: false });
    const { queryByTestId } = renderButton();
    expect(
      queryByTestId('observabilityAgentBuilderServiceMapInvestigateButton')
    ).not.toBeInTheDocument();
  });
});
