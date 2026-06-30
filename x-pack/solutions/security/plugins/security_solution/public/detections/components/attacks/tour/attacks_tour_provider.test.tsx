/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import { AttacksTourProvider, useAttacksTour } from './attacks_tour_provider';
import type { AttacksTourState } from './constants';
import { ATTACKS_TOUR_CALLOUT_STORAGE_KEY, ATTACKS_TOUR_STORAGE_KEY } from './constants';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;

const createStorageMock = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: unknown) => store.set(key, value)),
    remove: jest.fn((key: string) => store.delete(key)),
  };
};

let storage: ReturnType<typeof createStorageMock>;
let reportEvent: jest.Mock;

const setupServices = (toursEnabled: boolean) => {
  reportEvent = jest.fn();
  useKibanaMock.mockReturnValue({
    services: {
      storage,
      telemetry: { reportEvent },
      notifications: { tours: { isEnabled: jest.fn(() => toursEnabled) } },
      docLinks: { links: { siem: { attacksPage: 'http://docs.test/attacks' } } },
    },
  });
};

const renderProvider = (
  hasAttacks: boolean | undefined,
  persisted?: Partial<AttacksTourState>,
  toursEnabled = true
) => {
  storage = createStorageMock(persisted ? { [ATTACKS_TOUR_STORAGE_KEY]: persisted } : {});
  setupServices(toursEnabled);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AttacksTourProvider hasAttacks={hasAttacks}>{children}</AttacksTourProvider>
  );
  return renderHook(() => useAttacksTour(), { wrapper });
};

describe('AttacksTourProvider', () => {
  it('builds 3 steps when attacks are present', () => {
    const { result } = renderProvider(true);
    expect(result.current.stepsTotal).toBe(3);
  });

  it('builds 2 steps when no attacks are present', () => {
    const { result } = renderProvider(false);
    expect(result.current.stepsTotal).toBe(2);
  });

  it('uses the optimistic 3-step variant while attack presence is unknown', () => {
    const { result } = renderProvider(undefined);
    expect(result.current.stepsTotal).toBe(3);
  });

  it('starts inactive by default', () => {
    const { result } = renderProvider(true);
    expect(result.current.tourState.isTourActive).toBe(false);
  });

  it('activates the tour at step 1 on startTour', () => {
    const { result } = renderProvider(true);
    act(() => result.current.startTour());
    expect(result.current.tourState).toEqual({
      isTourActive: true,
      currentTourStep: 1,
      isTourComplete: false,
    });
  });

  it('reports start_tour telemetry on startTour', () => {
    const { result } = renderProvider(true);
    act(() => result.current.startTour());
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.TourCalloutAction, {
      action: 'start_tour',
    });
  });

  it('advances the current step on nextStep', () => {
    const { result } = renderProvider(true);
    act(() => result.current.startTour());
    act(() => result.current.nextStep());
    expect(result.current.tourState.currentTourStep).toBe(2);
  });

  it('completes the tour on finishTour', () => {
    const { result } = renderProvider(true);
    act(() => result.current.startTour());
    act(() => result.current.finishTour());
    expect(result.current.tourState).toEqual({
      isTourActive: false,
      currentTourStep: 1,
      isTourComplete: true,
    });
  });

  it('persists tour state to storage on change', () => {
    const { result } = renderProvider(true);
    act(() => result.current.startTour());
    expect(storage.set).toHaveBeenCalledWith(ATTACKS_TOUR_STORAGE_KEY, {
      isTourActive: true,
      currentTourStep: 1,
      isTourComplete: false,
    });
  });

  it('restores the persisted current step', () => {
    const { result } = renderProvider(true, {
      isTourActive: true,
      currentTourStep: 2,
      isTourComplete: false,
    });
    expect(result.current.tourState.currentTourStep).toBe(2);
  });

  it('finishes the tour when the variant shrinks past the saved step', () => {
    const { result } = renderProvider(false, {
      isTourActive: true,
      currentTourStep: 3,
      isTourComplete: false,
    });
    expect(result.current.tourState.isTourComplete).toBe(true);
  });

  it('resumes at the saved step when it still exists (no attacks)', () => {
    const { result } = renderProvider(false, {
      isTourActive: true,
      currentTourStep: 2,
      isTourComplete: false,
    });
    expect(result.current.tourState.isTourActive).toBe(true);
  });

  it('keeps the flyout step available when attacks appear', () => {
    const { result } = renderProvider(true, {
      isTourActive: true,
      currentTourStep: 2,
      isTourComplete: false,
    });
    expect(result.current.stepsTotal).toBe(3);
  });

  it('does not finish the tour while attack presence is unknown', () => {
    const { result } = renderProvider(undefined, {
      isTourActive: true,
      currentTourStep: 3,
      isTourComplete: false,
    });
    expect(result.current.tourState.isTourActive).toBe(true);
  });

  it('persists the callout dismissal', () => {
    const { result } = renderProvider(true);
    act(() => result.current.dismissCallout());
    expect(storage.set).toHaveBeenCalledWith(ATTACKS_TOUR_CALLOUT_STORAGE_KEY, true);
  });

  it('marks the callout dismissed in context', () => {
    const { result } = renderProvider(true);
    act(() => result.current.dismissCallout());
    expect(result.current.isCalloutDismissed).toBe(true);
  });

  it('reflects the global tours opt-out', () => {
    const { result } = renderProvider(true, undefined, false);
    expect(result.current.isTourEnabled).toBe(false);
  });
});
