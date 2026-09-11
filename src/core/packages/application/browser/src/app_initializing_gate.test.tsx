/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { AppInitializingGate } from './app_initializing_gate';

const PLUGIN_ID = 'myPlugin';

describe('AppInitializingGate', () => {
  it('renders the children once available', () => {
    const result = renderWithI18n(
      <AppInitializingGate status="available" pluginId={PLUGIN_ID}>
        <div>real app content</div>
      </AppInitializingGate>
    );

    expect(result.queryByText('real app content')).toBeTruthy();
    expect(result.queryByTestId('appInitializingGate-errorPage')).toBeNull();
  });

  it.each(['idle', 'initializing'] as const)(
    'renders the loading screen, not the children, while %s',
    (status) => {
      const result = renderWithI18n(
        <AppInitializingGate status={status} pluginId={PLUGIN_ID}>
          <div>real app content</div>
        </AppInitializingGate>
      );

      expect(result.queryByTestId('appInitializingGate-loadingPage')).toBeTruthy();
      expect(result.queryByText('real app content')).toBeNull();
    }
  );

  it('shows which plugin failed, the error message, and the attempt count', () => {
    const result = renderWithI18n(
      <AppInitializingGate
        status="failed"
        pluginId={PLUGIN_ID}
        error={{ message: 'Elasticsearch is unreachable' }}
        attempts={3}
      >
        <div>real app content</div>
      </AppInitializingGate>
    );

    expect(result.queryByTestId('appInitializingGate-errorPage')).toBeTruthy();
    expect(result.queryByText('real app content')).toBeNull();
    expect(result.getByText(`"${PLUGIN_ID}" failed to initialize`)).toBeTruthy();
    expect(result.getByTestId('appInitializingGate-errorMessage').textContent).toContain(
      'Elasticsearch is unreachable'
    );
    expect(result.getByTestId('appInitializingGate-attempts').textContent).toContain('3 times');
  });

  it('distinguishes a mount failure from an initialization failure', () => {
    const result = renderWithI18n(
      <AppInitializingGate
        status="failed"
        pluginId={PLUGIN_ID}
        failureStage="mount"
        error={{ message: 'Loading chunk 42 failed' }}
      >
        <div>real app content</div>
      </AppInitializingGate>
    );

    // Deferred init succeeded here; it was the app's own mount() that rejected, so the copy must
    // not blame initialization.
    expect(result.getByText(`"${PLUGIN_ID}" failed to load`)).toBeTruthy();
    expect(result.queryByText(`"${PLUGIN_ID}" failed to initialize`)).toBeNull();
    expect(result.getByTestId('appInitializingGate-errorMessage').textContent).toContain(
      'Loading chunk 42 failed'
    );
    // The reload action is still the right remediation, so the failed layout is otherwise shared.
    expect(result.queryByTestId('appInitializingGate-errorPage')).toBeTruthy();
  });

  it('blames initialization by default, with no failureStage given', () => {
    const result = renderWithI18n(
      <AppInitializingGate status="failed" pluginId={PLUGIN_ID}>
        <div>real app content</div>
      </AppInitializingGate>
    );

    expect(result.getByText(`"${PLUGIN_ID}" failed to initialize`)).toBeTruthy();
  });

  it('omits the error message and attempts blocks when not provided', () => {
    const result = renderWithI18n(
      <AppInitializingGate status="failed" pluginId={PLUGIN_ID}>
        <div>real app content</div>
      </AppInitializingGate>
    );

    expect(result.queryByTestId('appInitializingGate-errorMessage')).toBeNull();
    expect(result.queryByTestId('appInitializingGate-attempts')).toBeNull();
  });

  it('only shows the reload button when onRetry is provided, and invokes it on click', () => {
    const onRetry = jest.fn();
    const result = renderWithI18n(
      <AppInitializingGate status="failed" pluginId={PLUGIN_ID} onRetry={onRetry}>
        <div>real app content</div>
      </AppInitializingGate>
    );

    const button = result.getByTestId('appInitializingGate-reloadButton');
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders no action when onRetry is not provided', () => {
    const result = renderWithI18n(
      <AppInitializingGate status="failed" pluginId={PLUGIN_ID}>
        <div>real app content</div>
      </AppInitializingGate>
    );

    expect(result.queryByTestId('appInitializingGate-reloadButton')).toBeNull();
  });
});
