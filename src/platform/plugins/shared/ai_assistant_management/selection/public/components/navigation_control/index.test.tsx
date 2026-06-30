/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { AIAssistantHeaderButton } from '.';
import { I18nProvider } from '@kbn/i18n-react';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AIAssistantType } from '../../../common/ai_assistant_type';
import {
  AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE,
  AI_CHAT_EXPERIENCE_TYPE,
} from '@kbn/management-settings-ids';

// workaround because of JSDOM not supporting :focus-visible
// https://github.com/jsdom/jsdom/issues/3426
const matchesOriginal = HTMLElement.prototype.matches;
HTMLElement.prototype.matches = function (this: HTMLElement, query: string) {
  if (query === ':focus-visible') return false;
  return matchesOriginal.call(this, query);
} as typeof HTMLElement.prototype.matches;

describe('AIAssistantHeaderButton', () => {
  const mockCoreStart = coreMock.createStart();

  const mockTriggerOpenChat = jest.fn();

  const defaultProps = {
    coreStart: mockCoreStart,
    isSecurityAIAssistantEnabled: true,
    isObservabilityAIAssistantEnabled: true,
    triggerOpenChat: mockTriggerOpenChat,
  };

  const renderComponent = (props = {}) => {
    return render(
      <I18nProvider>
        <AIAssistantHeaderButton {...defaultProps} {...props} />
      </I18nProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCoreStart.settings.client.set.mockResolvedValue(true);
    mockCoreStart.application.capabilities = {
      ...mockCoreStart.application.capabilities,
      agentBuilder: { show: true, manageAgents: true },
    };
  });

  describe('Header Button', () => {
    it('should render the AI Assistant button', () => {
      renderComponent();
      expect(screen.getByTestId('aiAssistantHeaderButton')).toBeInTheDocument();
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    it('should open modal when button is clicked', async () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });
  });

  describe('Selection Modal', () => {
    beforeEach(async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });

    it('should render modal title and description', () => {
      expect(screen.getByText('Select a chat experience')).toBeInTheDocument();
      expect(screen.getByText(/Choose which chat experience/i)).toBeInTheDocument();
    });

    it('should render Observability card', () => {
      expect(screen.getByTestId('aiAssistantObservabilityCard')).toBeInTheDocument();
      expect(screen.getByText('Observability and Search AI Assistant')).toBeInTheDocument();
    });

    it('should render Security card', () => {
      expect(screen.getByTestId('aiAssistantSecurityCard')).toBeInTheDocument();
      expect(screen.getByText('Security AI Assistant')).toBeInTheDocument();
    });

    it('should render AI Agent card', async () => {
      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantAgentCard')).toBeInTheDocument();
      });
      expect(screen.getByText('AI Agent')).toBeInTheDocument();
    });

    it('should close modal when Cancel button is clicked', () => {
      fireEvent.click(screen.getByTestId('aiAssistantCancelButton'));

      expect(screen.queryByTestId('aiAssistantModalTitle')).not.toBeInTheDocument();
    });
  });

  describe('Card Selection', () => {
    beforeEach(async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });

    it('should disable Continue button initially when no card selected', () => {
      const continueButton = screen.getByTestId('aiAssistantApplyButton');
      expect(continueButton).toBeDisabled();
    });

    it('should enable Continue button when any card is selected', () => {
      const observabilityCard = screen.getByTestId('aiAssistantObservabilityCard');
      fireEvent.click(observabilityCard);

      const continueButton = screen.getByTestId('aiAssistantApplyButton');
      expect(continueButton).not.toBeDisabled();
    });
  });

  describe('AI Agent Card - Disabled State', () => {
    it('should be disabled when manageAgents is false', async () => {
      mockCoreStart.application.capabilities = {
        ...mockCoreStart.application.capabilities,
        agentBuilder: { show: true, manageAgents: false },
      };
      renderComponent({
        isSecurityAIAssistantEnabled: true,
        isObservabilityAIAssistantEnabled: false,
      });

      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantAgentCard')).toBeInTheDocument();
      });

      const agentCard = screen.getByTestId('aiAssistantAgentCard');
      expect(agentCard.querySelector('[disabled]')).toBeTruthy();
    });

    it('should be disabled when security AI assistant is disabled', async () => {
      mockCoreStart.application.capabilities = {
        ...mockCoreStart.application.capabilities,
        agentBuilder: { show: true, manageAgents: false },
      };
      renderComponent({
        isSecurityAIAssistantEnabled: false,
        isObservabilityAIAssistantEnabled: true,
      });

      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantAgentCard')).toBeInTheDocument();
      });

      const agentCard = screen.getByTestId('aiAssistantAgentCard');
      expect(agentCard.querySelector('[disabled]')).toBeTruthy();
    });

    it('should be enabled when manageAgents is true', async () => {
      mockCoreStart.application.capabilities = {
        ...mockCoreStart.application.capabilities,
        agentBuilder: { show: true, manageAgents: true },
      };
      renderComponent();

      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantAgentCard')).toBeInTheDocument();
      });

      const agentCard = screen.getByTestId('aiAssistantAgentCard');
      expect(agentCard.querySelector('[disabled]')).toBeFalsy();
    });
  });

  describe('AI Agent Selection Flow', () => {
    beforeEach(async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });

    it('should apply settings directly when AI Agent is selected and Continue is clicked', async () => {
      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantAgentCard')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('aiAssistantAgentCard'));
      fireEvent.click(screen.getByTestId('aiAssistantApplyButton'));

      await waitFor(() => {
        expect(mockCoreStart.settings.client.set).toHaveBeenCalled();
        expect(mockTriggerOpenChat).toHaveBeenCalledWith(AIChatExperience.Agent);
      });
    });
  });

  describe('Settings Application', () => {
    beforeEach(async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });

    it('should save settings and trigger chat when assistant is selected', async () => {
      fireEvent.click(screen.getByTestId('aiAssistantObservabilityCard'));
      fireEvent.click(screen.getByTestId('aiAssistantApplyButton'));

      await waitFor(() => {
        expect(mockCoreStart.settings.client.set).toHaveBeenCalledWith(
          AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE,
          AIAssistantType.Observability
        );
        expect(mockCoreStart.settings.client.set).toHaveBeenCalledWith(
          AI_CHAT_EXPERIENCE_TYPE,
          AIChatExperience.Classic
        );
        expect(mockTriggerOpenChat).toHaveBeenCalledWith(AIAssistantType.Observability);
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('aiAssistantHeaderButton'));

      await waitFor(() => {
        expect(screen.getByTestId('aiAssistantModalTitle')).toBeInTheDocument();
      });
    });

    it('should show error toast when settings save fails with error message', async () => {
      const errorMessage = 'Failed to save settings';
      mockCoreStart.settings.client.set.mockRejectedValueOnce(new Error(errorMessage));

      fireEvent.click(screen.getByTestId('aiAssistantObservabilityCard'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('aiAssistantApplyButton'));
      });

      await waitFor(() => {
        expect(mockCoreStart.notifications.toasts.addError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            title: expect.stringContaining('Failed to apply AI assistant settings'),
          })
        );
      });
    });

    it('should show error toast when settings save fails with HTTP error body', async () => {
      const httpError = {
        body: { message: 'HTTP error occurred' },
        message: 'Request failed',
      };
      mockCoreStart.settings.client.set.mockRejectedValueOnce(httpError);

      fireEvent.click(screen.getByTestId('aiAssistantObservabilityCard'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('aiAssistantApplyButton'));
      });

      await waitFor(() => {
        expect(mockCoreStart.notifications.toasts.addError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            title: expect.stringContaining('Failed to apply AI assistant settings'),
          })
        );
      });
    });

    it('should show error toast with Unknown error when error has no message', async () => {
      mockCoreStart.settings.client.set.mockRejectedValueOnce({});

      fireEvent.click(screen.getByTestId('aiAssistantObservabilityCard'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('aiAssistantApplyButton'));
      });

      await waitFor(() => {
        expect(mockCoreStart.notifications.toasts.addError).toHaveBeenCalled();
      });
    });
  });
});
