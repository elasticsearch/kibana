/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React, { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { render, waitFor } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { useEuiTheme, EuiProvider } from '@elastic/eui';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import type { KibanaTheme } from '@kbn/react-kibana-context-common';
import { euiIncludeSelectorInFocusTrap } from '@kbn/core-chrome-layout-constants';

import { KibanaEuiProvider } from './eui_provider';

// Mock the EuiProvider component to capture its props
jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    EuiProvider: jest.fn(original.EuiProvider),
  };
});

describe('KibanaEuiProvider', () => {
  let euiTheme: ReturnType<typeof useEuiTheme> | undefined;
  let userProfile: UserProfileService;
  let consoleWarnMock: jest.SpyInstance;

  beforeEach(() => {
    euiTheme = undefined;
    userProfile = userProfileServiceMock.createStart();
    consoleWarnMock = jest.spyOn(global.console, 'warn').mockImplementation(() => {});
    (EuiProvider as jest.Mock).mockImplementation(jest.requireActual('@elastic/eui').EuiProvider);
  });

  const InnerComponent: FC = () => {
    const theme = useEuiTheme();
    useEffect(() => {
      euiTheme = theme;
    }, [theme]);
    return <div>foo</div>;
  };

  it('exposes the EUI theme provider', async () => {
    const coreTheme: KibanaTheme = { darkMode: true, name: 'borealis' };

    render(
      <KibanaEuiProvider
        theme={{ theme$: of(coreTheme) }}
        modify={{ breakpoint: { xxl: 1600 } }}
        userProfile={userProfile}
      >
        <InnerComponent />
      </KibanaEuiProvider>
    );

    // Wait for the component to update
    await waitFor(() => {
      expect(euiTheme).toBeDefined();
    });

    expect(euiTheme!.colorMode).toEqual('DARK');
    expect(euiTheme!.euiTheme.breakpoint.xxl).toEqual(1600);
    expect(consoleWarnMock).not.toBeCalled();
  });

  it('propagates changes of the coreTheme observable', async () => {
    const coreTheme$ = new BehaviorSubject<KibanaTheme>({ darkMode: true, name: 'borealis' });

    render(
      <KibanaEuiProvider theme={{ theme$: coreTheme$ }} userProfile={userProfile}>
        <InnerComponent />
      </KibanaEuiProvider>
    );

    // Wait for the component to update with initial theme
    await waitFor(() => {
      expect(euiTheme).toBeDefined();
    });

    expect(euiTheme!.colorMode).toEqual('DARK');

    // Update the theme
    act(() => {
      coreTheme$.next({ darkMode: false, name: 'borealis' });
    });

    // Wait for the component to update with new theme
    await waitFor(() => {
      expect(euiTheme!.colorMode).toEqual('LIGHT');
    });

    expect(consoleWarnMock).not.toBeCalled();
  });

  it('passes component defaults to EuiProvider', async () => {
    const coreTheme: KibanaTheme = { darkMode: true, name: 'borealis' };

    render(
      <KibanaEuiProvider theme={{ theme$: of(coreTheme) }} userProfile={userProfile}>
        <div>test</div>
      </KibanaEuiProvider>
    );

    expect(EuiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        componentDefaults: {
          EuiFlyout: {
            includeSelectorInFocusTrap: euiIncludeSelectorInFocusTrap.selector,
            container: '#app-main-scroll',
          },
          EuiPopover: {
            repositionOnScroll: true,
          },
          EuiToolTip: {
            repositionOnScroll: true,
          },
          EuiTable: {
            scrollableInline: true,
            tableLayout: 'auto',
            responsiveBreakpoint: false,
          },
        },
      }),
      expect.anything()
    );
  });
});
