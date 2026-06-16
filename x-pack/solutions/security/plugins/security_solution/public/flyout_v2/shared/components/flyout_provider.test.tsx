/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { Router } from '@kbn/shared-ux-router';
import { useLocation } from 'react-router-dom';
import { createStore } from 'redux';
import { UpsellingService } from '@kbn/security-solution-upselling/service';
import { of } from 'rxjs';
import type { StartServices } from '../../../types';
import { SECURITY_FEATURE_ID } from '../../../../common/constants';
import { useConsoleManager } from '../../../management/components/console/components/console_manager';
import { flyoutProviders } from './flyout_provider';

jest.mock('../../../common/components/user_privileges/user_privileges_context', () => ({
  UserPrivilegesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../common/components/discover_in_timeline/provider', () => ({
  DiscoverInTimelineContextProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../../../assistant/provider', () => ({
  AssistantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../../cases/components/provider/provider', () => ({
  CaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const services = {
  uiActions: {
    getTriggerCompatibleActions: jest.fn().mockResolvedValue([]),
  },
  upselling: new UpsellingService(),
  data: {
    query: {
      timefilter: {
        timefilter: { getAbsoluteTime: () => ({ from: '2024-01-01', to: '2024-01-02' }) },
      },
    },
  },
  application: {
    capabilities: {
      [SECURITY_FEATURE_ID]: {
        crud: false,
        show: false,
      },
      securitySolutionTimeline: {
        read: false,
        crud: false,
      },
      securitySolutionNotes: {
        read: false,
        crud: false,
      },
    },
  },
  notifications: {
    toasts: {
      addError: jest.fn(),
      addSuccess: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      remove: jest.fn(),
    },
  },
  theme: {
    getTheme: jest.fn().mockReturnValue({ darkMode: false }),
    theme$: of({ darkMode: false }),
  },
  http: {},
} as unknown as StartServices;

const LocationProbe = () => {
  const { pathname, search } = useLocation();

  return <div>{`${pathname}${search}`}</div>;
};

const ExpandableFlyoutApiProbe = () => {
  const { openPreviewPanel } = useExpandableFlyoutApi();

  return <div>{typeof openPreviewPanel}</div>;
};

const ConsoleManagerProbe = () => {
  const consoleManager = useConsoleManager();

  return <div data-test-subj="console-manager-probe">{typeof consoleManager.register}</div>;
};

describe('flyoutProviders', () => {
  it('uses the provided history when available', () => {
    const history = createMemoryHistory({ initialEntries: ['/security?foo=bar'] });
    const store = createStore(() => ({}));

    render(
      flyoutProviders({
        services,
        store,
        history,
        children: <LocationProbe />,
      })
    );

    expect(screen.getByText('/security?foo=bar')).toBeInTheDocument();
  });

  it('provides router context when no history is provided', () => {
    const store = createStore(() => ({}));

    render(
      flyoutProviders({
        services,
        store,
        children: <LocationProbe />,
      })
    );

    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('uses the existing router context when no history is provided', () => {
    const history = createMemoryHistory({ initialEntries: ['/existing-router'] });
    const store = createStore(() => ({}));

    render(
      <Router history={history}>
        {flyoutProviders({
          services,
          store,
          children: <LocationProbe />,
        })}
      </Router>
    );

    expect(screen.getByText('/existing-router')).toBeInTheDocument();
  });

  it('provides expandable flyout context to children', () => {
    const store = createStore(() => ({}));

    render(
      flyoutProviders({
        services,
        store,
        children: <ExpandableFlyoutApiProbe />,
      })
    );

    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('provides console manager context to children', () => {
    const store = createStore(() => ({}));

    render(
      flyoutProviders({
        services,
        store,
        children: <ConsoleManagerProbe />,
      })
    );

    expect(screen.getByTestId('console-manager-probe')).toHaveTextContent('function');
  });
});
