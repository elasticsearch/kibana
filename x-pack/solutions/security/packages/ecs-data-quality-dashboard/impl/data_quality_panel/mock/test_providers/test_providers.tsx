/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { actionTypeRegistryMock } from '@kbn/triggers-actions-ui-plugin/public/application/action_type_registry.mock';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import type { AssistantAvailability } from '@kbn/elastic-assistant';
import { AssistantProvider } from '@kbn/elastic-assistant';
import React from 'react';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { Theme } from '@elastic/charts';
import { coreMock, docLinksServiceMock } from '@kbn/core/public/mocks';
import type { UserProfileService } from '@kbn/core/public';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { of } from 'rxjs';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiThemeProvider } from '@elastic/eui';

import type { AssistantProviderProps } from '@kbn/elastic-assistant/impl/assistant_context';
import { useAssistantContextValue } from '@kbn/elastic-assistant/impl/assistant_context';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { DataQualityProviderProps } from '../../data_quality_context';
import { DataQualityProvider } from '../../data_quality_context';
import { ResultsRollupContext } from '../../contexts/results_rollup_context';
import { IndicesCheckContext } from '../../contexts/indices_check_context';
import type { UseIndicesCheckReturnValue } from '../../hooks/use_indices_check/types';
import type { UseResultsRollupReturnValue } from '../../hooks/use_results_rollup/types';
import { getMergeResultsRollupContextProps } from './utils/get_merged_results_rollup_context_props';
import { getMergedDataQualityContextProps } from './utils/get_merged_data_quality_context_props';
import { getMergedIndicesCheckContextProps } from './utils/get_merged_indices_check_context_props';
import { HistoricalResultsContext } from '../../data_quality_details/indices_details/pattern/contexts/historical_results_context';
import { initialFetchHistoricalResultsReducerState } from '../../data_quality_details/indices_details/pattern/hooks/use_historical_results';
import type {
  FetchHistoricalResultsReducerState,
  UseHistoricalResultsReturnValue,
} from '../../data_quality_details/indices_details/pattern/hooks/use_historical_results/types';

interface TestExternalProvidersProps {
  children: React.ReactNode;
}

window.scrollTo = jest.fn();

/** A utility for wrapping children in the providers required to run tests */
const TestExternalProvidersComponent: React.FC<TestExternalProvidersProps> = ({ children }) => {
  const actionTypeRegistry = actionTypeRegistryMock.create();
  const mockGetComments = jest.fn(() => []);
  const mockHttp = httpServiceMock.createStartContract({ basePath: '/test' });
  const mockNavigateToApp = jest.fn();
  const mockAssistantAvailability: AssistantAvailability = {
    hasSearchAILakeConfigurations: false,
    hasAssistantPrivilege: false,
    hasConnectorsAllPrivilege: true,
    hasConnectorsReadPrivilege: true,
    hasUpdateAIAssistantAnonymization: true,
    hasManageGlobalKnowledgeBase: true,
    isAssistantEnabled: true,
    isAssistantVisible: true,
    isAssistantManagementEnabled: true,
  };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: () => {},
    },
  });

  const chrome = chromeServiceMock.createStartContract();
  chrome.getChromeStyle$.mockReturnValue(of('classic'));

  const docLinks = docLinksServiceMock.createStartContract();

  const assistantProviderProps = {
    actionTypeRegistry,
    assistantAvailability: mockAssistantAvailability,
    augmentMessageCodeBlocks: {
      mount: jest.fn().mockReturnValue(() => {}),
    },
    basePath: 'https://localhost:5601/kbn',
    docLinks,
    getComments: mockGetComments,
    http: mockHttp,
    navigateToApp: mockNavigateToApp,
    productDocBase: {
      installation: {
        getStatus: jest.fn(),
        install: jest.fn(),
        uninstall: jest.fn(),
        getDefaultInferenceId: jest.fn(),
      },
    },
    currentAppId: 'securitySolutionUI',
    userProfileService: jest.fn() as unknown as UserProfileService,
    getUrlForApp: jest.fn(),
    chrome,
    settings: {
      client: {
        get: jest.fn(),
        get$: jest.fn().mockReturnValue(of(undefined)),
        getUpdate$: jest.fn().mockReturnValue(of()),
      },
    } as unknown as SettingsStart,
  };

  return (
    <KibanaRenderContextProvider {...coreMock.createStart()}>
      <I18nProvider>
        <EuiThemeProvider>
          <QueryClientProvider client={queryClient}>
            <TestAssistantProvider assistantProviderProps={assistantProviderProps}>
              {children}
            </TestAssistantProvider>
          </QueryClientProvider>
        </EuiThemeProvider>
      </I18nProvider>
    </KibanaRenderContextProvider>
  );
};

TestExternalProvidersComponent.displayName = 'TestExternalProvidersComponent';

export const TestExternalProviders = React.memo(TestExternalProvidersComponent);

export const TestAssistantProvider = ({
  assistantProviderProps,
  children,
}: {
  assistantProviderProps: AssistantProviderProps;
  children: React.ReactNode;
}) => {
  const assistantContextValue = useAssistantContextValue(assistantProviderProps);

  return <AssistantProvider value={assistantContextValue}>{children}</AssistantProvider>;
};

export interface TestDataQualityProvidersProps {
  children: React.ReactNode;
  dataQualityContextProps?: Partial<DataQualityProviderProps>;
  indicesCheckContextProps?: Partial<UseIndicesCheckReturnValue>;
  resultsRollupContextProps?: Partial<UseResultsRollupReturnValue>;
}

const TestDataQualityProvidersComponent: React.FC<TestDataQualityProvidersProps> = ({
  children,
  dataQualityContextProps,
  resultsRollupContextProps,
  indicesCheckContextProps,
}) => {
  const http = httpServiceMock.createSetupContract({ basePath: '/test' });
  const { toasts } = notificationServiceMock.createSetupContract();
  const mockTelemetryEvents = {
    reportDataQualityIndexChecked: jest.fn(),
    reportDataQualityCheckAllCompleted: jest.fn(),
  };

  const {
    isILMAvailable,
    addSuccessToast,
    canUserCreateAndReadCases,
    endDate,
    formatBytes,
    formatNumber,
    isAssistantEnabled,
    lastChecked,
    openCreateCaseFlyout,
    patterns,
    setLastChecked,
    startDate,
    theme,
    baseTheme,
    ilmPhases,
    selectedIlmPhaseOptions,
    setSelectedIlmPhaseOptions,
    defaultStartTime,
    defaultEndTime,
  } = getMergedDataQualityContextProps(dataQualityContextProps);

  const mergedResultsRollupContextProps =
    getMergeResultsRollupContextProps(resultsRollupContextProps);

  return (
    <DataQualityProvider
      httpFetch={http.fetch}
      toasts={toasts}
      isILMAvailable={isILMAvailable}
      telemetryEvents={mockTelemetryEvents}
      addSuccessToast={addSuccessToast}
      canUserCreateAndReadCases={canUserCreateAndReadCases}
      endDate={endDate}
      formatBytes={formatBytes}
      formatNumber={formatNumber}
      isAssistantEnabled={isAssistantEnabled}
      lastChecked={lastChecked}
      openCreateCaseFlyout={openCreateCaseFlyout}
      patterns={patterns}
      setLastChecked={setLastChecked}
      startDate={startDate}
      theme={theme}
      baseTheme={baseTheme as Theme}
      ilmPhases={ilmPhases}
      selectedIlmPhaseOptions={selectedIlmPhaseOptions}
      setSelectedIlmPhaseOptions={setSelectedIlmPhaseOptions}
      defaultStartTime={defaultStartTime}
      defaultEndTime={defaultEndTime}
    >
      <ResultsRollupContext.Provider value={mergedResultsRollupContextProps}>
        <IndicesCheckContext.Provider
          value={getMergedIndicesCheckContextProps(
            mergedResultsRollupContextProps.patternIndexNames,
            indicesCheckContextProps
          )}
        >
          {children}
        </IndicesCheckContext.Provider>
      </ResultsRollupContext.Provider>
    </DataQualityProvider>
  );
};

TestDataQualityProvidersComponent.displayName = 'TestDataQualityProvidersComponent';

export const TestDataQualityProviders = React.memo(TestDataQualityProvidersComponent);

export interface TestHistoricalResultsProviderProps {
  children: React.ReactNode;
  historicalResultsState?: FetchHistoricalResultsReducerState;
  fetchHistoricalResults?: UseHistoricalResultsReturnValue['fetchHistoricalResults'];
}

const TestHistoricalResultsProviderComponent: React.FC<TestHistoricalResultsProviderProps> = ({
  children,
  historicalResultsState = initialFetchHistoricalResultsReducerState,
  fetchHistoricalResults = jest.fn(),
}) => {
  return (
    <HistoricalResultsContext.Provider
      value={{
        historicalResultsState,
        fetchHistoricalResults,
      }}
    >
      {children}
    </HistoricalResultsContext.Provider>
  );
};

TestHistoricalResultsProviderComponent.displayName = 'TestHistoricalResultsProviderComponent';

export const TestHistoricalResultsProvider = React.memo(TestHistoricalResultsProviderComponent);
