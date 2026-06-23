/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen, fireEvent } from '@testing-library/react';

import { IngestionStatus, IngestionMethod, ConnectorStatus } from '@kbn/search-connectors';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { Status } from '../../../../../../common/types/api';

import { SyncsContextMenu } from './syncs_context_menu';

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
    isAgentlessEnabled: false,
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
    setMockValues(mockValues);
    setMockActions({
      cancelSyncs,
      startAccessControlSync,
      startIncrementalSync,
      startSync,
    });
  });

  it('renders', () => {
    setMockValues({ ...mockValues, isWaitingForSync: true });
    renderWithKibanaRenderContext(<SyncsContextMenu />);

    expect(screen.getByTestId('enterpriseSearchSyncsContextMenuButton')).toBeInTheDocument();
    // Popover is closed — panel content not in DOM
    expect(
      screen.queryByTestId('entSearchContent-connector-header-sync-startSync')
    ).not.toBeInTheDocument();
  });

  it('Can cancel syncs', () => {
    setMockValues({ ...mockValues, isSyncing: true });
    renderWithKibanaRenderContext(<SyncsContextMenu />);

    fireEvent.click(screen.getByTestId('enterpriseSearchSyncsContextMenuButton'));

    // When syncing, Full Content item is hidden; only Cancel Syncs is shown
    expect(
      screen.queryByTestId('entSearchContent-connector-header-sync-startSync')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Cancel Syncs')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel Syncs'));
    expect(cancelSyncs).toHaveBeenCalled();
  });

  it('Can start a sync', () => {
    setMockValues({ ...mockValues, ingestionStatus: IngestionStatus.ERROR });
    renderWithKibanaRenderContext(<SyncsContextMenu />);

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
    renderWithKibanaRenderContext(<SyncsContextMenu />);

    fireEvent.click(screen.getByTestId('enterpriseSearchSyncsContextMenuButton'));

    expect(screen.getByTestId('entSearchContent-connector-header-sync-startSync')).toBeDisabled();
  });

  it("Sync button is disabled when connector isn't configured", () => {
    setMockValues({ ...mockValues, connector: { status: null } });
    renderWithKibanaRenderContext(<SyncsContextMenu />);

    expect(screen.getByTestId('enterpriseSearchSyncsContextMenuButton')).toBeDisabled();
  });
});
