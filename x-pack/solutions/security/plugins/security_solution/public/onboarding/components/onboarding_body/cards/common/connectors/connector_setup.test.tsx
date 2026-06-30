/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorSetup } from './connector_setup';
import type { ActionType } from '@kbn/actions-plugin/common';
import { createMockConnectorType } from '@kbn/actions-plugin/server/application/connector/mocks';
import { useKibana } from '../../../../../../common/lib/kibana';
jest.mock('../../../../../../common/lib/kibana', () => ({
  useKibana: jest.fn(),
}));

jest.mock('@kbn/elastic-assistant/impl/connectorland/add_connector_modal', () => ({
  AddConnectorModal: jest.fn(() => <div data-test-subj="addConnectorModal">{'Mock Modal'}</div>),
}));

describe('ConnectorSetup', () => {
  const mockActionTypeRegistry = {
    get: jest.fn(() => ({ iconClass: 'testIcon' })),
  };

  const mockActionTypes: ActionType[] = [
    createMockConnectorType({
      id: 'testType1',
      name: 'Test Action 1',
      supportedFeatureIds: ['alerting'],
    }),
    createMockConnectorType({
      id: 'testType2',
      name: 'Test Action 2',
      minimumLicenseRequired: 'gold',
      supportedFeatureIds: ['alerting'],
    }),
  ];

  beforeEach(() => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        triggersActionsUi: { actionTypeRegistry: mockActionTypeRegistry },
      },
    });
  });

  it('renders correctly', () => {
    render(<ConnectorSetup actionTypes={mockActionTypes} onConnectorSaved={jest.fn()} />);

    expect(mockActionTypeRegistry.get).toHaveBeenCalledWith('testType1');
    expect(mockActionTypeRegistry.get).toHaveBeenCalledWith('testType2');

    expect(screen.getByTestId('createConnectorButton')).toBeInTheDocument();
  });

  it('opens the modal when the button is clicked', async () => {
    render(<ConnectorSetup actionTypes={mockActionTypes} onConnectorSaved={jest.fn()} />);

    await userEvent.click(screen.getByTestId('createConnectorButton'));

    expect(screen.getByTestId('addConnectorModal')).toBeInTheDocument();
  });

  it('calls onConnectorSaved when a connector is saved', async () => {
    const mockOnConnectorSaved = jest.fn();
    render(
      <ConnectorSetup actionTypes={mockActionTypes} onConnectorSaved={mockOnConnectorSaved} />
    );
    await userEvent.click(screen.getByTestId('createConnectorButton'));

    mockOnConnectorSaved({ id: '1', name: 'New Connector' });

    expect(mockOnConnectorSaved).toHaveBeenCalledWith({ id: '1', name: 'New Connector' });
  });
});
