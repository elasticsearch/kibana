/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { actionTypeRegistryMock } from '@kbn/triggers-actions-ui-plugin/public/application/action_type_registry.mock';
import React from 'react';
import type { AssistantAvailability } from '@kbn/elastic-assistant';
import { AssistantProvider } from '@kbn/elastic-assistant';
import type { UserProfileService } from '@kbn/core/public';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { of } from 'rxjs';
import { useAssistantContextValue } from '@kbn/elastic-assistant/impl/assistant_context';
import { docLinksServiceMock } from '@kbn/core/public/mocks';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';

interface Props {
  assistantAvailability?: AssistantAvailability;
  children: React.ReactNode;
}

window.scrollTo = jest.fn();
window.HTMLElement.prototype.scrollIntoView = jest.fn();

/** A utility for wrapping children in the providers required to run tests */
export const MockAssistantProviderComponent: React.FC<Props> = ({
  assistantAvailability,
  children,
}) => {
  const actionTypeRegistry = actionTypeRegistryMock.create();
  const mockHttp = httpServiceMock.createStartContract({ basePath: '/test' });
  const mockNavigateToApp = jest.fn();
  const defaultAssistantAvailability: AssistantAvailability = {
    hasSearchAILakeConfigurations: false,
    hasAssistantPrivilege: false,
    hasAgentBuilderPrivilege: false,
    hasConnectorsAllPrivilege: true,
    hasConnectorsReadPrivilege: true,
    hasUpdateAIAssistantAnonymization: true,
    hasManageGlobalKnowledgeBase: true,
    isAssistantEnabled: true,
    isAssistantVisible: true,
    isAssistantManagementEnabled: true,
  };
  const chrome = chromeServiceMock.createStartContract();
  chrome.getChromeStyle$.mockReturnValue(of('classic'));
  const docLinks = docLinksServiceMock.createStartContract();

  const mockUserProfileService = {
    getCurrent: jest.fn(() => Promise.resolve({ avatar: 'avatar' })),
  } as unknown as UserProfileService;

  const assistantContextValue = useAssistantContextValue({
    actionTypeRegistry,
    assistantAvailability: assistantAvailability ?? defaultAssistantAvailability,
    augmentMessageCodeBlocks: {
      mount: jest.fn().mockReturnValue(() => {}),
    },
    basePath: 'https://localhost:5601/kbn',
    docLinks,
    getComments: jest.fn(() => []),
    http: mockHttp,
    navigateToApp: mockNavigateToApp,
    currentAppId: 'test',
    productDocBase: {
      installation: {
        getStatus: jest.fn(),
        install: jest.fn(),
        uninstall: jest.fn(),
        getDefaultInferenceId: jest.fn(),
      },
    },
    userProfileService: mockUserProfileService,
    chrome,
    getUrlForApp: jest.fn(),
    settings: {
      client: {
        get: jest.fn(),
        get$: jest.fn().mockReturnValue(of(undefined)),
        getUpdate$: jest.fn().mockReturnValue(of()),
      },
    } as unknown as SettingsStart,
  });

  return <AssistantProvider value={assistantContextValue}>{children}</AssistantProvider>;
};

MockAssistantProviderComponent.displayName = 'MockAssistantProviderComponent';

export const MockAssistantProvider = React.memo(MockAssistantProviderComponent);
