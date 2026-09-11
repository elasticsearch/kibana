/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { Subject } from 'rxjs';
import type { AppMountParameters } from '@kbn/core-application-browser';
import type { DeferredInitStatus } from '@kbn/core-deferred-init-browser';
import { mountWithInitializingGate } from './mount_with_initializing_gate';

jest.mock('@kbn/core-application-browser', () => ({
  AppInitializingGate: ({
    status,
    pluginId,
    error,
    attempts,
    failureStage,
    onRetry,
  }: {
    status: string;
    pluginId: string;
    error?: { message: string };
    attempts?: number;
    failureStage?: string;
    onRetry?: () => void;
  }) => (
    <div
      data-test-subj="mock-gate"
      data-status={status}
      data-plugin-id={pluginId}
      data-error={error?.message}
      data-attempts={attempts}
      data-failure-stage={failureStage}
    >
      <button data-test-subj="mock-retry" onClick={onRetry}>
        retry
      </button>
    </div>
  ),
}));

const PLUGIN_ID = 'myPlugin';

describe('mountWithInitializingGate', () => {
  let element: HTMLDivElement;
  let status$: Subject<DeferredInitStatus>;
  let realMount: jest.Mock;
  let realUnmount: jest.Mock;
  let onRetry: jest.Mock;
  let consoleError: jest.SpyInstance;

  const getStartServices = async () =>
    [{ rendering: { addContext: (el: React.ReactElement) => el } }, {}, undefined] as any;

  beforeEach(() => {
    element = document.createElement('div');
    status$ = new Subject();
    realUnmount = jest.fn();
    realMount = jest.fn().mockResolvedValue(realUnmount);
    onRetry = jest.fn();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  const mountGate = async () => {
    const mount = mountWithInitializingGate({
      pluginId: PLUGIN_ID,
      mount: realMount,
      status$,
      onRetry,
      getStartServices,
    });
    let unmount!: () => void;
    await act(async () => {
      unmount = await mount({ element } as unknown as AppMountParameters);
    });
    return unmount;
  };

  it('renders the gate and does not call the real mount while pending', async () => {
    const unmount = await mountGate();

    expect(realMount).not.toHaveBeenCalled();
    const gate = element.querySelector('[data-test-subj="mock-gate"]');
    expect(gate?.getAttribute('data-status')).toBe('idle');
    expect(gate?.getAttribute('data-plugin-id')).toBe(PLUGIN_ID);

    unmount();
  });

  it('mounts the real app once status flips to available and removes the gate', async () => {
    const unmount = await mountGate();

    await act(async () => {
      status$.next({ status: 'available' });
      await Promise.resolve();
    });

    expect(realMount).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-test-subj="mock-gate"]')).toBeNull();

    unmount();
    expect(realUnmount).toHaveBeenCalledTimes(1);
  });

  // Regression guard: the wrapper's own mount promise has already resolved by the time the real
  // mount runs, so `AppContainer` has recorded the app as mounted and will not route a rejection
  // to its error boundary. Swallowing it here would leave the user on a blank element.
  describe('when the real mount rejects', () => {
    const mountError = new Error('chunk load failed');

    beforeEach(() => {
      realMount = jest.fn().mockRejectedValue(mountError);
    });

    it('renders the failure gate, tagged as a mount failure rather than an init failure', async () => {
      const unmount = await mountGate();

      await act(async () => {
        status$.next({ status: 'available' });
        await Promise.resolve();
      });

      const gate = element.querySelector('[data-test-subj="mock-gate"]');
      expect(gate).not.toBeNull();
      expect(gate?.getAttribute('data-status')).toBe('failed');
      expect(gate?.getAttribute('data-error')).toBe('chunk load failed');
      expect(gate?.getAttribute('data-failure-stage')).toBe('mount');

      unmount();
    });

    it('logs the error, preserving the stack the gate itself cannot show', async () => {
      const unmount = await mountGate();

      await act(async () => {
        status$.next({ status: 'available' });
        await Promise.resolve();
      });

      expect(consoleError).toHaveBeenCalledWith(mountError);

      unmount();
    });

    it('stringifies a non-Error rejection', async () => {
      realMount = jest.fn().mockRejectedValue('just a string');
      const unmount = await mountGate();

      await act(async () => {
        status$.next({ status: 'available' });
        await Promise.resolve();
      });

      expect(
        element.querySelector('[data-test-subj="mock-gate"]')?.getAttribute('data-error')
      ).toBe('just a string');

      unmount();
    });

    it('tears the failure gate back down on unmount', async () => {
      const unmount = await mountGate();

      await act(async () => {
        status$.next({ status: 'available' });
        await Promise.resolve();
      });
      act(() => unmount());

      expect(element.querySelector('[data-test-subj="mock-gate"]')).toBeNull();
      expect(realUnmount).not.toHaveBeenCalled();
    });

    it('leaves the element alone if unmounted before the rejection lands', async () => {
      const unmount = await mountGate();

      await act(async () => {
        status$.next({ status: 'available' });
        unmount();
        await Promise.resolve();
      });

      expect(element.querySelector('[data-test-subj="mock-gate"]')).toBeNull();
    });
  });

  it('passes the error message and attempt count through to the gate', async () => {
    const unmount = await mountGate();

    await act(async () => {
      status$.next({ status: 'failed', error: { message: 'boom' }, attempts: 2 });
    });

    const gate = element.querySelector('[data-test-subj="mock-gate"]');
    expect(gate?.getAttribute('data-status')).toBe('failed');
    expect(gate?.getAttribute('data-error')).toBe('boom');
    expect(gate?.getAttribute('data-attempts')).toBe('2');

    unmount();
  });

  it('wires the gate retry action to the provided onRetry callback', async () => {
    const unmount = await mountGate();

    await act(async () => {
      status$.next({ status: 'failed' });
    });

    const retryButton = element.querySelector('[data-test-subj="mock-retry"]') as HTMLButtonElement;
    act(() => retryButton.click());

    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('never calls the real mount if unmounted before status becomes available', async () => {
    const unmount = await mountGate();

    unmount();
    status$.next({ status: 'available' });

    expect(realMount).not.toHaveBeenCalled();
  });

  it('ignores a stray emission after the real app has already mounted', async () => {
    const unmount = await mountGate();

    await act(async () => {
      status$.next({ status: 'available' });
      await Promise.resolve();
    });
    await act(async () => {
      status$.next({ status: 'available' });
      await Promise.resolve();
    });

    expect(realMount).toHaveBeenCalledTimes(1);
    unmount();
  });
});
