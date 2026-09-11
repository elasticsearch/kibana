/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { basicCase, basicCaseClosed } from '../../containers/mock';
import type { CaseActionBarProps } from '.';
import { CaseActionBar } from '.';
import {
  allCasesPermissions,
  noDeleteCasesPermissions,
  noUpdateCasesPermissions,
  renderWithTestingProviders,
} from '../../common/mock';
import { useGetCaseConnectors } from '../../containers/use_get_case_connectors';
import { useRefreshCaseViewPage } from '../case_view/use_on_refresh_case_view_page';
import { getCaseConnectorsMockResponse } from '../../common/mock/connectors';
import { CaseMetricsFeature } from '../../../common/types/api';

jest.mock('../../containers/use_get_case_connectors');
jest.mock('../case_view/use_on_refresh_case_view_page');

const useGetCaseConnectorsMock = useGetCaseConnectors as jest.Mock;

describe('CaseActionBar', () => {
  const caseConnectors = getCaseConnectorsMockResponse();

  const onUpdateField = jest.fn();
  const defaultProps: CaseActionBarProps = {
    caseData: basicCase,
    isLoading: false,
    onUpdateField,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useGetCaseConnectorsMock.mockReturnValue({
      isLoading: false,
      data: caseConnectors,
    });
  });

  it('renders', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    expect(screen.getByTestId('case-view-status')).toBeInTheDocument();
    expect(screen.getByTestId('case-action-bar-status-date')).toBeInTheDocument();
    expect(screen.getByTestId('sync-alerts-switch')).toBeInTheDocument();
    expect(screen.getByTestId('case-refresh')).toBeInTheDocument();
    expect(screen.getByTestId('case-view-actions')).toBeInTheDocument();
  });

  it('should show correct status', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('should show the status as closed when the case is closed', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} caseData={basicCaseClosed} />);

    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('invalidates the queryClient cache onRefresh', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    await userEvent.click(screen.getByTestId('case-refresh'));

    expect(useRefreshCaseViewPage()).toHaveBeenCalled();
  });

  it('should call onUpdateField when changing status', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    await userEvent.click(await screen.findByTestId('case-view-status-dropdown-in-progress'));

    expect(onUpdateField).toHaveBeenCalledWith({ key: 'status', value: 'in-progress' });
  });

  it('should call onUpdateField when changing syncAlerts setting', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    await userEvent.click(screen.getByTestId('sync-alerts-switch'));

    expect(onUpdateField).toHaveBeenCalledWith({
      key: 'settings',
      value: {
        syncAlerts: false,
        extractObservables: true,
      },
    });
  });

  it('should not show the sync alerts toggle when alerting is disabled', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { owner: ['observability'], features: { metrics: [] } },
    });

    expect(screen.queryByText('Sync Detections')).not.toBeInTheDocument();
  });

  it('should show the sync alerts toggle when alerting is enabled', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    expect(screen.getByText('Sync Detections')).toBeInTheDocument();
  });

  it('should not show the Case open text when the lifespan feature is enabled', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { features: { metrics: [CaseMetricsFeature.LIFESPAN] } },
    });

    expect(screen.queryByText('Case opened')).not.toBeInTheDocument();
  });

  it('should show the Case open text when the lifespan feature is disabled', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    expect(screen.getByText('Case opened')).toBeInTheDocument();
  });

  it('should show the change status text when the user has update privileges', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    expect(screen.getByTitle('Change status')).toBeInTheDocument();
  });

  it('should not show the change status text when the user does not have update privileges', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { permissions: noUpdateCasesPermissions() },
    });

    expect(screen.queryByTitle('Change status')).not.toBeInTheDocument();
  });

  it('should not show the sync alerts toggle when the user does not have update privileges', () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { permissions: noUpdateCasesPermissions() },
    });

    expect(screen.queryByText('Sync Detections')).not.toBeInTheDocument();
  });

  it('should not show the delete item in the menu when the user does not have delete privileges', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { permissions: noDeleteCasesPermissions() },
    });

    await userEvent.click(screen.getByTestId('property-actions-case-ellipses'));
    expect(screen.queryByText('Delete case')).not.toBeInTheDocument();
    expect(screen.queryByTestId('property-actions-case-trash')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-actions-case-copy')).toBeInTheDocument();
  });

  it('should show the the delete item in the menu when the user does have delete privileges', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />, {
      wrapperProps: { permissions: allCasesPermissions() },
    });

    await userEvent.click(screen.getByTestId('property-actions-case-ellipses'));
    expect(screen.getByText('Delete case')).toBeInTheDocument();
  });

  it('shows the external incident action', async () => {
    const connector = caseConnectors['servicenow-1'];
    const { push, ...connectorWithoutPush } = connector;

    const props = {
      ...defaultProps,
      caseData: { ...defaultProps.caseData, connector: connectorWithoutPush },
    };

    renderWithTestingProviders(<CaseActionBar {...props} />);

    await userEvent.click(screen.getByTestId('property-actions-case-ellipses'));

    await waitFor(() => {
      expect(screen.getByTestId('property-actions-case-external')).toBeInTheDocument();
    });
  });

  it('does not show the external incident action', async () => {
    renderWithTestingProviders(<CaseActionBar {...defaultProps} />);

    await userEvent.click(screen.getByTestId('property-actions-case-ellipses'));

    expect(screen.queryByTestId('property-actions-case-external')).not.toBeInTheDocument();
  });
});
