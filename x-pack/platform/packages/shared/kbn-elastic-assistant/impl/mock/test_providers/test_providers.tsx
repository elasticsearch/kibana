/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/* eslint-disable no-console */
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { I18nProvider } from '@kbn/i18n-react';
import { actionTypeRegistryMock } from '@kbn/triggers-actions-ui-plugin/public/application/action_type_registry.mock';
import React from 'react';

import { EuiThemeProvider as ThemeProvider } from '@elastic/eui';

import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { UserProfileService } from '@kbn/core/public';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { of } from 'rxjs';
import { docLinksServiceMock } from '@kbn/core/public/mocks';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { AssistantProviderProps } from '../../assistant_context';
import { AssistantProvider, useAssistantContextValue } from '../../assistant_context';
import type { AssistantAvailability } from '../../assistant_context/types';
import { AssistantSpaceIdProvider } from '../../assistant/use_space_aware_context';
import { MOCK_CURRENT_USER } from '../../assistant/use_conversation/sample_conversations';

interface Props {
  assistantAvailability?: AssistantAvailability;
  children: React.ReactNode;
  providerContext?: Partial<AssistantProviderProps>;
}

window.scrollTo = jest.fn();
window.HTMLElement.prototype.scrollIntoView = jest.fn();

export const mockAssistantAvailability: AssistantAvailability = {
  hasSearchAILakeConfigurations: false,
  hasAssistantPrivilege: false,
  hasConnectorsAllPrivilege: true,
  hasConnectorsReadPrivilege: true,
  hasUpdateAIAssistantAnonymization: true,
  hasManageGlobalKnowledgeBase: true,
  hasAgentBuilderPrivilege: true,
  hasAgentBuilderManagePrivilege: true,
  isAssistantEnabled: true,
  isAssistantVisible: true,
  isAssistantManagementEnabled: true,
};

/** A utility for wrapping children in the providers required to run tests */
export const TestProvidersComponent: React.FC<Props> = ({
  assistantAvailability = mockAssistantAvailability,
  children,
  providerContext,
}) => {
  const actionTypeRegistry = actionTypeRegistryMock.create();
  actionTypeRegistry.get = jest.fn().mockReturnValue({
    id: '12345',
    actionTypeId: '.gen-ai',
    actionTypeTitle: 'OpenAI',
    iconClass: 'logoGenAI',
  });
  const mockGetComments = jest.fn(() => []);
  const mockHttp = httpServiceMock.createStartContract({ basePath: '/test' });
  const mockNavigateToApp = jest.fn();
  const mockGetUrlForApp = jest.fn();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {},
    },
  });

  const chrome = chromeServiceMock.createStartContract();
  chrome.getChromeStyle$.mockReturnValue(of('classic'));
  const docLinks = docLinksServiceMock.createStartContract();

  const assistantProviderProps = {
    actionTypeRegistry,
    assistantAvailability,
    augmentMessageCodeBlocks: {
      mount: jest.fn().mockReturnValue(() => {}),
    },
    basePath: 'https://localhost:5601/kbn',
    docLinks,
    getComments: mockGetComments,
    getUrlForApp: mockGetUrlForApp,
    http: mockHttp,
    navigateToApp: mockNavigateToApp,
    ...providerContext,
    currentAppId: 'test',
    productDocBase: {
      installation: {
        getStatus: jest.fn(),
        install: jest.fn(),
        uninstall: jest.fn(),
        getDefaultInferenceId: jest.fn(),
      },
    },
    userProfileService: jest.fn() as unknown as UserProfileService,
    chrome,
    settings: {
      client: {
        get: jest.fn(),
        get$: jest.fn().mockReturnValue(of(undefined)),
        getUpdate$: jest.fn().mockReturnValue(of()),
      },
    } as unknown as SettingsStart,
  } as AssistantProviderProps;

  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TestAssistantProviders assistantProviderProps={assistantProviderProps}>
            <AssistantSpaceIdProvider spaceId="default">{children}</AssistantSpaceIdProvider>
          </TestAssistantProviders>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  );
};

TestProvidersComponent.displayName = 'TestProvidersComponent';

export const TestProviders = React.memo(TestProvidersComponent);

const TestAssistantProviders = ({
  assistantProviderProps,
  children,
}: {
  assistantProviderProps: AssistantProviderProps;
  children: React.ReactNode;
}) => {
  const assistantContextValue = useAssistantContextValue(assistantProviderProps);
  return (
    <AssistantProvider value={{ ...assistantContextValue, currentUser: MOCK_CURRENT_USER }}>
      {children}
    </AssistantProvider>
  );
};
