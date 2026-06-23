/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { setMockActions, setMockValues } from '../../../__mocks__';
import React from 'react';

import { screen, fireEvent } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { IngestionStatus, IngestionMethod, ConnectorStatus } from '@kbn/search-connectors';

import { useKibana } from '@kbn/kibana-react-plugin/public';
import { Status } from '../../../../common/types/api';
import { SyncsContextMenu } from './syncs_context_menu';
import { AppContextProvider } from '../../../app_context';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import type { AppDependencies, SearchConnectorsPluginStartDependencies } from '../../../types';

const appContext: AppDependencies = {
  isAgentlessEnabled: true,
  connectorTypes: [],
  kibanaVersion: '',
  isCloud: false,
  hasPlatinumLicense: false,
  plugins: {} as unknown as SearchConnectorsPluginStartDependencies,
};
jest.mock('@kbn/kibana-react-plugin/public');
const http = httpServiceMock.createSetupContract();

const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;
describe('SyncsContextMenu', () => {
  const startSync = jest.fn();
  const startIncrementalSync = jest.fn();
  const startAccessControlSync = jest.fn();
  const cancelSyncs = jest.fn();

  const mockValues = {
    hasDocumentLevelSecurityFeature: false,
    hasIncrementalSyncFeature: false,
    ingestionMethod: IngestionMethod.CONNECTOR,
    ingestionStatus: IngestionStatus.CONNECTED,
    isCanceling: false,
    isSyncing: false,
    isWaitingForSync: false,
    productFeatures: {
      hasDocumentLevelSecurityEnabled: true,
      hasIncrementalSyncEnabled: true,
    },
    status: Status.SUCCESS,
    connector: {
      index_name: 'index_name',
      status: ConnectorStatus.CONFIGURED,
    },
  };

  beforeEach(() => {
    useKibanaMock.mockReturnValue({
      services: {
        http,
      },
      overlays: {
        openFlyout: jest.fn(),
        openModal: jest.fn(),
      },
    } as any);
    setMockValues(mockValues);
    setMockActions({
      cancelSyncs,
      startAccessControlSync,
      startIncrementalSync,
      startSync,
    });
  });

  const renderMenu = () =>
    renderWithKibanaRenderContext(
      <AppContextProvider value={appContext}>
        <SyncsContextMenu />
      </AppContextProvider>
    );

  it('renders', () => {
    setMockValues({ ...mockValues, isWaitingForSync: true });
    renderMenu();

    expect(screen.getByTestId('enterpriseSearchSyncsContextMenuButton')).toBeInTheDocument();
    // Popover is closed — panel content not in DOM
    expect(
      screen.queryByTestId('entSearchContent-connector-header-sync-startSync')
    ).not.toBeInTheDocument();
  });

  it('Can cancel syncs', () => {
    setMockValues({ ...mockValues, isSyncing: true });
    renderMenu();

    fireEvent.click(screen.getByTestId('enterpriseSearchSyncsContextMenuButton'));

    // When syncing, Full Content item is hidden; only Cancel Syncs is shown
    expect(
      screen.queryByTestId('entSearchContent-connector-header-sync-startSync')
    ).not.toBeInTheDocument();
    const cancelButton = screen.getByTestId('entSearchContent-connector-header-sync-cancelSync');
    expect(cancelButton.closest('button')).not.toBeDisabled();

    fireEvent.click(cancelButton);
    expect(cancelSyncs).toHaveBeenCalled();
  });

  it('Can start a sync', () => {
    setMockValues({ ...mockValues, ingestionStatus: IngestionStatus.ERROR });
    renderMenu();

    fireEvent.click(screen.getByTestId('enterpriseSearchSyncsContextMenuButton'));

    const fullContentButton = screen.getByTestId(
      'entSearchContent-connector-header-sync-startSync'
    );
    expect(fullContentButton).toBeInTheDocument();
    expect(fullContentButton).not.toBeDisabled();

    fireEvent.click(fullContentButton);
    expect(startSync).toHaveBeenCalled();
  });

  it('Cannot start a sync without an index name', () => {
    setMockValues({
      ...mockValues,
      connector: { index_name: null, status: ConnectorStatus.CONFIGURED },
    });
    renderMenu();

    fireEvent.click(screen.getByTestId('enterpriseSearchSyncsContextMenuButton'));

    expect(screen.getByTestId('entSearchContent-connector-header-sync-startSync')).toBeDisabled();
  });

  it("Sync button is disabled when connector isn't configured", () => {
    setMockValues({ ...mockValues, connector: { status: null } });
    renderMenu();

    expect(screen.getByTestId('enterpriseSearchSyncsContextMenuButton')).toBeDisabled();
  });
});
