/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Actions } from './actions';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useSelectedMonitor } from './hooks/use_selected_monitor';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
  useLocation: jest.fn(),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('./hooks/use_selected_monitor', () => ({
  useSelectedMonitor: jest.fn(),
}));

describe('Actions Component', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    mockDispatch = jest.fn();

    (useDispatch as jest.Mock).mockReturnValue(mockDispatch);
    (useSelector as jest.Mock).mockReturnValue([]);
    (useParams as jest.Mock).mockReturnValue({ monitorId: 'test-monitor-id' });
    (useLocation as jest.Mock).mockReturnValue({ search: '?test=true' });
    (useSelectedMonitor as jest.Mock).mockReturnValue({
      monitor: null,
      loading: false,
      error: null,
      isMonitorMissing: false,
    });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        notifications: {
          toasts: {
            addDanger: jest.fn(),
          },
        },
        observabilityShared: {
          config: {
            unsafe: {
              investigativeExperienceEnabled: false,
            },
          },
        },
        cases: {
          ui: {
            getCasesContext: jest.fn(() => ({ children }: { children: React.ReactNode }) => (
              <div>{children}</div>
            )),
          },
          helpers: {
            canUseCases: jest.fn(() => ({
              read: true,
              update: true,
              push: true,
            })),
          },
          hooks: {
            useCasesAddToExistingCaseModal: jest.fn(() => ({
              open: jest.fn(),
            })),
          },
        },
      },
    });
  });

  it('renders all default action items', () => {
    render(<Actions />);

    fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

    expect(screen.getByText('Edit monitor')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    expect(screen.getByText('Run test manually')).toBeInTheDocument();
  });

  describe('remote (CCS) monitor', () => {
    beforeEach(() => {
      (useLocation as jest.Mock).mockReturnValue({ search: '?remoteName=cluster-1' });
    });

    it('disables Run test manually', () => {
      render(<Actions />);

      fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

      expect(screen.getByTestId('syntheticsRunTestManuallyButton')).toBeDisabled();
    });

    it('keeps Refresh enabled', () => {
      render(<Actions />);

      fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

      expect(screen.getByTestId('syntheticsRefreshContextItem')).not.toBeDisabled();
    });

    describe('Edit monitor', () => {
      it('redirects to the remote cluster when kibanaUrl is known', () => {
        (useSelectedMonitor as jest.Mock).mockReturnValue({
          monitor: {
            config_id: 'test-monitor-id',
            remote: { remoteName: 'cluster-1', kibanaUrl: 'https://remote.example.com' },
          },
          loading: false,
          error: null,
          isMonitorMissing: false,
        });

        render(<Actions />);
        fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

        const editItem = screen.getByTestId('syntheticsEditMonitorContextItem');
        expect(editItem).not.toBeDisabled();
        expect(editItem).toHaveAttribute(
          'href',
          'https://remote.example.com/app/synthetics/edit-monitor/test-monitor-id'
        );
        expect(editItem).toHaveAttribute('target', '_blank');
      });

      it('renders disabled with a kibanaUrl-missing tooltip when remote.kibanaUrl is missing', () => {
        (useSelectedMonitor as jest.Mock).mockReturnValue({
          monitor: {
            config_id: 'test-monitor-id',
            remote: { remoteName: 'cluster-1' },
          },
          loading: false,
          error: null,
          isMonitorMissing: false,
        });

        render(<Actions />);
        fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

        const editItem = screen.getByTestId('syntheticsEditMonitorContextItem');
        expect(editItem).toBeDisabled();
        expect(editItem).not.toHaveAttribute('href');
      });

      it('renders disabled when the remote monitor is not yet resolved', () => {
        // `useSelectedMonitor` returns `null` while the CCS lookup is in-flight,
        // so we treat the URL as missing and disable the item.
        (useSelectedMonitor as jest.Mock).mockReturnValue({
          monitor: null,
          loading: true,
          error: null,
          isMonitorMissing: false,
        });

        render(<Actions />);
        fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

        expect(screen.getByTestId('syntheticsEditMonitorContextItem')).toBeDisabled();
      });
    });
  });

  describe('heartbeat (Elastic Agent) monitor', () => {
    beforeEach(() => {
      // No remoteName in the URL — heartbeat is detected from the resolved
      // monitor shape (origin === 'heartbeat'), not a URL param.
      (useSelectedMonitor as jest.Mock).mockReturnValue({
        monitor: {
          config_id: 'test-monitor-id',
          name: 'Autodiscovered monitor',
          origin: 'heartbeat',
        },
        loading: false,
        error: null,
        isMonitorMissing: false,
      });
    });

    it('disables Edit monitor', () => {
      render(<Actions />);

      fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

      const editItem = screen.getByTestId('syntheticsEditMonitorContextItem');
      expect(editItem).toBeDisabled();
      expect(editItem).not.toHaveAttribute('href');
    });

    it('disables Run test manually', () => {
      render(<Actions />);

      fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

      expect(screen.getByTestId('syntheticsRunTestManuallyButton')).toBeDisabled();
    });

    it('keeps Refresh enabled', () => {
      render(<Actions />);

      fireEvent.click(screen.getByTestId('monitorDetailsHeaderControlActionsButton'));

      expect(screen.getByTestId('syntheticsRefreshContextItem')).not.toBeDisabled();
    });
  });
});
