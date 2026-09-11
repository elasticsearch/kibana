/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiProvider } from '@elastic/eui';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { coreMock, scopedHistoryMock } from '@kbn/core/public/mocks';
import { I18nProvider } from '@kbn/i18n-react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  CONTEXT_ENGINE_BACK_BUTTON_TEST_SUBJ,
  ContextEngineSubPageHeader,
} from './context_engine_page_header';

const renderHeader = (services: ReturnType<typeof coreMock.createStart>) =>
  render(
    <ChromeServiceProvider value={{ chrome: services.chrome }}>
      <I18nProvider>
        <EuiProvider>
          <KibanaContextProvider services={{ ...services, history: scopedHistoryMock.create() }}>
            <ContextEngineSubPageHeader
              backLabel="Cancel"
              backHref="/app/context_engine/"
              onBackClick={jest.fn()}
              pageTitle="Create AI index"
            />
          </KibanaContextProvider>
        </EuiProvider>
      </I18nProvider>
    </ChromeServiceProvider>
  );

describe('ContextEngineSubPageHeader', () => {
  let services: ReturnType<typeof coreMock.createStart>;

  beforeEach(() => {
    services = coreMock.createStart();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('always shows the in-page back button in the project layout', () => {
    services.chrome.getChromeStyle.mockReturnValue('project');

    renderHeader(services);

    expect(screen.getByTestId(CONTEXT_ENGINE_BACK_BUTTON_TEST_SUBJ)).toBeInTheDocument();
    expect(screen.getByText('Create AI index')).toBeInTheDocument();
  });

  it('suppresses the chrome fallback back button in the project layout', () => {
    services.chrome.getChromeStyle.mockReturnValue('project');
    services.chrome.appHeader.set.mockReturnValue(jest.fn());

    renderHeader(services);

    expect(services.chrome.appHeader.set).toHaveBeenCalledWith(
      expect.objectContaining({ back: false })
    );
  });

  it('shows the in-page back button in classic layout', () => {
    services.chrome.getChromeStyle.mockReturnValue('classic');

    renderHeader(services);

    expect(screen.getByTestId(CONTEXT_ENGINE_BACK_BUTTON_TEST_SUBJ)).toBeInTheDocument();
  });

  it('does not suppress the chrome back button outside the project layout', () => {
    services.chrome.getChromeStyle.mockReturnValue('classic');

    renderHeader(services);

    expect(services.chrome.appHeader.set).not.toHaveBeenCalled();
  });
});
