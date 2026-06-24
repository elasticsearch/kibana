/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { render, screen } from '@testing-library/react';
import { AuthorizationPrompt } from './authorization_prompt';

jest.mock('@kbn/response-ops-oauth-hooks', () => ({
  useConnectorOAuthConnect: jest.fn(() => ({
    connect: jest.fn(),
    cancelConnect: jest.fn(),
    isConnecting: false,
  })),
  OAuthRedirectMode: { NewTab: 'new_tab' },
}));

jest.mock('../../../../hooks/use_toasts', () => ({
  useToasts: () => ({ addErrorToast: jest.fn() }),
}));

jest.mock('../../../connectors/connector_type_icon', () => ({
  ConnectorTypeIcon: () => <span />,
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

const basePrompt = {
  id: 'auth-prompt-id',
  connector_id: 'connector-123',
  connector_name: 'Slack',
  connector_type: '.slack',
  auth_method: 'oauth_authorization_code' as const,
};

describe('AuthorizationPrompt', () => {
  it('shows Declined on the cancel button when answered false', () => {
    renderWithProviders(
      <AuthorizationPrompt
        prompt={basePrompt}
        onAuthorize={jest.fn()}
        onCancel={jest.fn()}
        isAnswered
        answeredValue={false}
      />
    );
    expect(screen.getByTestId('agentBuilderAuthorizationPromptCancelButton')).toHaveTextContent(
      'Declined'
    );
  });

  it('shows Authorized on the authorize button when answered true', () => {
    renderWithProviders(
      <AuthorizationPrompt
        prompt={basePrompt}
        onAuthorize={jest.fn()}
        onCancel={jest.fn()}
        isAnswered
        answeredValue
      />
    );
    expect(screen.getByTestId('agentBuilderAuthorizationPromptAuthorizeButton')).toHaveTextContent(
      'Authorized'
    );
  });
});
