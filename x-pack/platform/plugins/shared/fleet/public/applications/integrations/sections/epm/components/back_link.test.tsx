/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import { coreMock } from '@kbn/core/public/mocks';

import { useStartServices } from '../../../../../hooks';

import { BackLink } from './back_link';

jest.mock('../../../../../hooks', () => {
  return {
    ...jest.requireActual('../../../../../hooks'),
    useStartServices: jest.fn().mockReturnValue({
      application: { navigateToApp: jest.fn() },
    }),
  };
});

const renderBackLink = (
  ui: React.ReactElement,
  chrome?: ReturnType<typeof coreMock.createStart>['chrome']
) =>
  render(
    <MockAppHeaderProvider chrome={chrome}>
      <I18nProvider>{ui}</I18nProvider>
    </MockAppHeaderProvider>
  );

describe('BackLink', () => {
  beforeEach(() => {
    jest.mocked(useStartServices().application.navigateToApp).mockReset();
  });

  it('renders back to selection link when returnAppId and returnPath are present', async () => {
    const appId = 'observabilityOnboarding';
    const path = '?category=aws';
    const queryParams = new URLSearchParams();
    queryParams.set('returnAppId', appId);
    queryParams.set('returnPath', path);

    const { getByText } = renderBackLink(
      <BackLink queryParams={queryParams} integrationsPath="/browse" />
    );
    expect(getByText('Back to selection')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByText('Back to selection'));
    });
    await waitFor(() => {
      expect(useStartServices().application.navigateToApp).toHaveBeenCalledWith(appId, {
        path,
      });
    });
  });

  it('renders back to collection link when the return path names a known collection', async () => {
    const appId = 'observabilityOnboarding';
    const path = '?search=nginx&collection=nginx';
    const queryParams = new URLSearchParams();
    queryParams.set('returnAppId', appId);
    queryParams.set('returnPath', path);

    const { getByText } = renderBackLink(
      <BackLink queryParams={queryParams} integrationsPath="/browse" />
    );
    expect(getByText('Back to Nginx collection')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByText('Back to Nginx collection'));
    });
    await waitFor(() => {
      expect(useStartServices().application.navigateToApp).toHaveBeenCalledWith(appId, {
        path,
      });
    });
  });

  it('renders back to collection when returnPath is a full path containing a known collection', async () => {
    const appId = 'integrations';
    const path = '/browse?collection=nginx';
    const queryParams = new URLSearchParams();
    queryParams.set('returnAppId', appId);
    queryParams.set('returnPath', path);

    const { getByText } = renderBackLink(
      <BackLink queryParams={queryParams} integrationsPath="/browse" />
    );
    expect(getByText('Back to Nginx collection')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByText('Back to Nginx collection'));
    });
    await waitFor(() => {
      expect(useStartServices().application.navigateToApp).toHaveBeenCalledWith(appId, {
        path,
      });
    });
  });

  it('falls back to the selection link when the return path names an unknown collection', async () => {
    const appId = 'observabilityOnboarding';
    const path = '?collection=notagroup';
    const queryParams = new URLSearchParams();
    queryParams.set('returnAppId', appId);
    queryParams.set('returnPath', path);

    const { getByText } = renderBackLink(
      <BackLink queryParams={queryParams} integrationsPath="/browse" />
    );
    expect(getByText('Back to selection')).toBeInTheDocument();
  });

  it('renders back to integrations link when no query params are present', async () => {
    const appId = 'integrations';
    const path = '/browse';
    const queryParams = new URLSearchParams();
    const { getByText } = renderBackLink(
      <BackLink queryParams={queryParams} integrationsPath="/browse" />
    );
    expect(getByText('Back to integrations')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByText('Back to integrations'));
    });
    await waitFor(() => {
      expect(useStartServices().application.navigateToApp).toHaveBeenCalledWith(appId, {
        path,
      });
    });
  });

  it('renders back to collection link when collectionTitle is provided', async () => {
    const appId = 'integrations';
    const collectionPath = '/collection/nginx';
    const queryParams = new URLSearchParams();
    const { getByText } = renderBackLink(
      <BackLink
        queryParams={queryParams}
        integrationsPath={collectionPath}
        collectionTitle="Nginx"
      />
    );
    expect(getByText('Back to Nginx collection')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByText('Back to Nginx collection'));
    });
    await waitFor(() => {
      expect(useStartServices().application.navigateToApp).toHaveBeenCalledWith(appId, {
        path: collectionPath,
      });
    });
  });

  it('suppresses the chrome back button when return params are present', () => {
    const chrome = coreMock.createStart().chrome;
    chrome.getChromeStyle.mockReturnValue('project');
    chrome.appHeader.set.mockReturnValue(jest.fn());

    const queryParams = new URLSearchParams();
    queryParams.set('returnAppId', 'observabilityOnboarding');
    queryParams.set('returnPath', '?');

    renderBackLink(<BackLink queryParams={queryParams} integrationsPath="/browse" />, chrome);

    expect(chrome.appHeader.set).toHaveBeenCalledWith(expect.objectContaining({ back: false }));
  });

  it('does not suppress the chrome back button when return params are absent', () => {
    const chrome = coreMock.createStart().chrome;
    chrome.getChromeStyle.mockReturnValue('project');
    chrome.appHeader.set.mockReturnValue(jest.fn());

    renderBackLink(
      <BackLink queryParams={new URLSearchParams()} integrationsPath="/browse" />,
      chrome
    );

    expect(chrome.appHeader.set).not.toHaveBeenCalled();
  });
});
