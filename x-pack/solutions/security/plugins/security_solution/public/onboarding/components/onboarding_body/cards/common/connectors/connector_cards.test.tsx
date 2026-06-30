/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorCards } from './connector_cards';
import { useLoadActionTypes } from '@kbn/elastic-assistant/impl/connectorland/use_load_action_types';
import type { AIConnector } from './types';
import { createMockActionConnector } from '@kbn/alerts-ui-shared/src/common/test_utils/connector.mock';

jest.mock('@kbn/elastic-assistant/impl/connectorland/use_load_action_types');
jest.mock('@kbn/elastic-assistant/impl/connectorland/use_load_action_types', () => ({
  useLoadActionTypes: jest.fn(),
}));

jest.mock('../../../../../../common/lib/kibana/kibana_react', () => ({
  useKibana: () => ({
    services: {
      settings: {
        client: { get: jest.fn() },
      },
      http: {
        get: jest.fn(),
      },
      notifications: {
        toasts: {
          addDanger: jest.fn(),
          addSuccess: jest.fn(),
        },
      },
      triggersActionsUi: {
        actionTypeRegistry: {
          get: jest.fn(() => ({ iconClass: 'testIcon' })),
        },
      },
    },
  }),
}));

const mockConnectors: AIConnector[] = [
  createMockActionConnector({
    id: '1',
    name: 'Connector 1',
    actionTypeId: 'testType',
  }),
  createMockActionConnector({
    id: '2',
    name: 'Connector 2',
    actionTypeId: 'testType',
  }),
];

describe('ConnectorCards', () => {
  beforeEach(() => {
    (useLoadActionTypes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'testType1',
          name: 'Test Action 1',
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          supportedFeatureIds: ['alerting'],
          isSystemActionType: false,
        },
      ],
      isLoading: false,
      error: null,
    });
  });

  it('renders a loading spinner when connectors are not provided', () => {
    const { container } = render(
      <ConnectorCards
        connectors={undefined}
        onNewConnectorSaved={jest.fn()}
        canCreateConnectors={true}
        onConnectorSelected={jest.fn()}
      />
    );
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('calls onConnectorSelected when a connector is selected', async () => {
    const onConnectorSelected = jest.fn();
    render(
      <ConnectorCards
        connectors={mockConnectors}
        onNewConnectorSaved={jest.fn()}
        canCreateConnectors={true}
        onConnectorSelected={onConnectorSelected}
      />
    );

    await userEvent.click(screen.getByTestId('connector-selector'));
    await userEvent.click(screen.getByText('Connector 1'));
    expect(onConnectorSelected).toHaveBeenCalledWith(mockConnectors[0]);
  });

  it('shows missing privileges callout if user lacks privileges and has no connectors', () => {
    render(
      <ConnectorCards
        connectors={[]}
        onNewConnectorSaved={jest.fn()}
        canCreateConnectors={false}
        onConnectorSelected={jest.fn()}
      />
    );
    expect(screen.getByText('Missing privileges')).toBeInTheDocument();
  });
});
