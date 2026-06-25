/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';

import type { Props } from './connectors';
import { Connectors } from './connectors';
import { noConnectorsCasePermission, renderWithTestingProviders } from '../../common/mock';
import { connectors, actionTypes } from './__mock__';
import { ConnectorTypes } from '../../../common/types/domain';
import userEvent from '@testing-library/user-event';
import { useApplicationCapabilities } from '../../common/lib/kibana';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';

const useApplicationCapabilitiesMock = useApplicationCapabilities as jest.Mocked<
  typeof useApplicationCapabilities
>;
jest.mock('../../common/lib/kibana');

describe('Connectors', () => {
  const onChangeConnector = jest.fn();
  const handleShowEditFlyout = jest.fn();
  const onAddNewConnector = jest.fn();

  const props: Props = {
    actionTypes,
    connectors,
    disabled: false,
    handleShowEditFlyout,
    isLoading: false,
    mappings: [],
    onChangeConnector,
    selectedConnector: { id: 'none', type: ConnectorTypes.none },
    updateConnectorDisabled: false,
    onAddNewConnector,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the connectors from group', () => {
    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.getByTestId('case-connectors-form-group')).toBeInTheDocument();
  });

  it('shows the connectors form row', () => {
    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.getByTestId('case-connectors-form-row')).toBeInTheDocument();
  });

  it('shows the connectors dropdown', () => {
    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.getByTestId('dropdown-connectors')).toBeInTheDocument();
  });

  it('the connector is changed successfully', async () => {
    renderWithTestingProviders(<Connectors {...props} />);

    await userEvent.click(screen.getByTestId('dropdown-connectors'));
    await waitForEuiPopoverOpen();
    await userEvent.click(screen.getByTestId('dropdown-connector-resilient-2'));

    expect(onChangeConnector).toHaveBeenCalled();
    expect(onChangeConnector).toHaveBeenCalledWith('resilient-2');
  });

  it('the connector is changed successfully to none', async () => {
    onChangeConnector.mockClear();

    renderWithTestingProviders(
      <Connectors
        {...props}
        selectedConnector={{ id: 'servicenow-1', type: ConnectorTypes.serviceNowITSM }}
      />
    );

    await userEvent.click(screen.getByTestId('dropdown-connectors'));
    await waitForEuiPopoverOpen();
    await userEvent.click(screen.getByTestId('dropdown-connector-no-connector'));

    expect(onChangeConnector).toHaveBeenCalled();
    expect(onChangeConnector).toHaveBeenCalledWith('none');
  });

  it('shows the add connector button', () => {
    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.getByTestId('add-new-connector')).toBeInTheDocument();
  });

  it('shows the add connector flyout when the button is clicked', async () => {
    renderWithTestingProviders(<Connectors {...props} />);

    await userEvent.click(await screen.findByTestId('add-new-connector'));
    expect(onAddNewConnector).toHaveBeenCalled();
  });

  it('the text of the update button is shown correctly', () => {
    renderWithTestingProviders(
      <Connectors
        {...props}
        selectedConnector={{ id: 'servicenow-1', type: ConnectorTypes.serviceNowITSM }}
      />
    );

    expect(screen.getByText('Update My SN connector')).toBeInTheDocument();
  });

  it('shows the deprecated callout when the connector is deprecated', async () => {
    renderWithTestingProviders(
      <Connectors
        {...props}
        selectedConnector={{ id: 'servicenow-uses-table-api', type: ConnectorTypes.serviceNowITSM }}
      />
    );

    expect(screen.getByText('This connector type is deprecated')).toBeInTheDocument();
    expect(screen.getByText('Update this connector, or create a new one.')).toBeInTheDocument();
  });

  it('does not shows the deprecated callout when the connector is none', async () => {
    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.queryByText('Deprecated connector type')).not.toBeInTheDocument();
  });

  it('shows the actions permission message if the user does not have read access to actions', async () => {
    useApplicationCapabilitiesMock().actions = { crud: false, read: false };

    renderWithTestingProviders(<Connectors {...props} />);

    expect(
      await screen.findByTestId('configure-case-connector-permissions-error-msg')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-connectors')).not.toBeInTheDocument();
  });

  it('shows the actions permission message if the user does not have access to case connector', async () => {
    renderWithTestingProviders(<Connectors {...props} />, {
      wrapperProps: { permissions: noConnectorsCasePermission() },
    });

    expect(
      screen.getByTestId('configure-case-connector-permissions-error-msg')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-connectors')).toBe(null);
  });

  it('it should hide the "Add Connector" button when the user lacks the capability to add a new connector', () => {
    useApplicationCapabilitiesMock().actions = { crud: false, read: true };

    renderWithTestingProviders(<Connectors {...props} />);

    expect(screen.queryByTestId('add-new-connector')).not.toBeInTheDocument();
  });
});
