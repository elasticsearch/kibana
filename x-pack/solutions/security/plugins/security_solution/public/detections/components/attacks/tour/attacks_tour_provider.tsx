/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import type { AttacksTourState } from './constants';
import {
  ATTACKS_TOUR_CALLOUT_STORAGE_KEY,
  ATTACKS_TOUR_STORAGE_KEY,
  DEFAULT_ATTACKS_TOUR_STATE,
} from './constants';
import type { AttacksTourStep } from './tour_steps_config';
import { getAttacksTourSteps } from './tour_steps_config';

export interface AttacksTourContextValue {
  /** Persisted tour state. */
  tourState: AttacksTourState;
  /** The steps for the current variant (3 if attacks exist, otherwise 2). */
  steps: AttacksTourStep[];
  /** Total number of steps in the current variant. */
  stepsTotal: number;
  /** `undefined` while the attacks query is loading, otherwise the resolved value. */
  hasAttacks: boolean | undefined;
  /** Whether the global tours opt-out (`hideAnnouncements`) allows tours. */
  isTourEnabled: boolean;
  /** Whether the welcome callout has been dismissed. */
  isCalloutDismissed: boolean;
  /** Starts the tour from step 1 (triggered by the callout). */
  startTour: () => void;
  /** Advances to the next step. */
  nextStep: () => void;
  /** Closes the tour from a non-final step ("Close tour"). */
  closeTour: () => void;
  /** Completes the tour from the final step ("Finish tour"). */
  finishTour: () => void;
  /** Completes the tour without telemetry (reconciliation / anchor safety valve). */
  completeTour: () => void;
  /** Dismisses the welcome callout. */
  dismissCallout: () => void;
  /** Reports a tour callout telemetry action (e.g. "view", "view_docs"). */
  reportCalloutAction: (action: 'view' | 'start_tour' | 'view_docs' | 'dismiss') => void;
}

const AttacksTourContext = createContext<AttacksTourContextValue | null>(null);

export interface AttacksTourProviderProps {
  /** `undefined` while the attacks query is loading. */
  hasAttacks: boolean | undefined;
  children: React.ReactNode;
}

const AttacksTourProviderComponent: React.FC<AttacksTourProviderProps> = ({
  hasAttacks,
  children,
}) => {
  const {
    services: { storage, notifications, telemetry },
  } = useKibana();
  const isTourEnabled = notifications.tours.isEnabled();

  const [tourState, setTourState] = useState<AttacksTourState>(() => {
    const stored = storage.get(ATTACKS_TOUR_STORAGE_KEY) as Partial<AttacksTourState> | undefined;
    return stored ? { ...DEFAULT_ATTACKS_TOUR_STATE, ...stored } : DEFAULT_ATTACKS_TOUR_STATE;
  });

  const [isCalloutDismissed, setIsCalloutDismissed] = useState<boolean>(
    () => storage.get(ATTACKS_TOUR_CALLOUT_STORAGE_KEY) === true
  );

  useEffect(() => {
    storage.set(ATTACKS_TOUR_STORAGE_KEY, tourState);
  }, [storage, tourState]);

  // Use the optimistic 3-step variant while loading (`hasAttacks === undefined`)
  // so we never under-report the step count before the query resolves.
  const steps = useMemo(() => getAttacksTourSteps(hasAttacks !== false), [hasAttacks]);
  const stepsTotal = steps.length;

  const reportCalloutAction = useCallback(
    (action: 'view' | 'start_tour' | 'view_docs' | 'dismiss') => {
      telemetry.reportEvent(AttacksEventTypes.TourCalloutAction, { action });
    },
    [telemetry]
  );

  const startTour = useCallback(() => {
    setTourState({ isTourActive: true, currentTourStep: 1, isTourComplete: false });
    reportCalloutAction('start_tour');
  }, [reportCalloutAction]);

  const nextStep = useCallback(() => {
    setTourState((prev) => {
      telemetry.reportEvent(AttacksEventTypes.TourStepAction, {
        action: 'advance',
        step: prev.currentTourStep,
      });
      return { ...prev, currentTourStep: prev.currentTourStep + 1 };
    });
  }, [telemetry]);

  const closeTour = useCallback(() => {
    setTourState((prev) => {
      telemetry.reportEvent(AttacksEventTypes.TourStepAction, {
        action: 'dismiss',
        step: prev.currentTourStep,
      });
      return { ...prev, isTourActive: false, isTourComplete: true };
    });
  }, [telemetry]);

  const finishTour = useCallback(() => {
    setTourState((prev) => {
      telemetry.reportEvent(AttacksEventTypes.TourStepAction, {
        action: 'finish',
        step: prev.currentTourStep,
      });
      return { ...prev, isTourActive: false, isTourComplete: true };
    });
  }, [telemetry]);

  const completeTour = useCallback(() => {
    setTourState((prev) =>
      prev.isTourActive ? { ...prev, isTourActive: false, isTourComplete: true } : prev
    );
  }, []);

  const dismissCallout = useCallback(() => {
    setIsCalloutDismissed(true);
    storage.set(ATTACKS_TOUR_CALLOUT_STORAGE_KEY, true);
    reportCalloutAction('dismiss');
  }, [reportCalloutAction, storage]);

  // Only run once the attacks query has loaded. If the live data shrank the tour
  // below the user's saved progress (e.g. they were on the flyout step but there
  // are no longer any attacks), complete the tour cleanly rather than leaving it
  // active pointing at an anchor that no longer exists.
  useEffect(() => {
    if (hasAttacks === undefined || !tourState.isTourActive) {
      return;
    }
    const total = hasAttacks ? 3 : 2;
    if (tourState.currentTourStep > total) {
      completeTour();
    }
  }, [hasAttacks, tourState.isTourActive, tourState.currentTourStep, completeTour]);

  const value = useMemo<AttacksTourContextValue>(
    () => ({
      tourState,
      steps,
      stepsTotal,
      hasAttacks,
      isTourEnabled,
      isCalloutDismissed,
      startTour,
      nextStep,
      closeTour,
      finishTour,
      completeTour,
      dismissCallout,
      reportCalloutAction,
    }),
    [
      tourState,
      steps,
      stepsTotal,
      hasAttacks,
      isTourEnabled,
      isCalloutDismissed,
      startTour,
      nextStep,
      closeTour,
      finishTour,
      completeTour,
      dismissCallout,
      reportCalloutAction,
    ]
  );

  return <AttacksTourContext.Provider value={value}>{children}</AttacksTourContext.Provider>;
};

export const AttacksTourProvider = React.memo(AttacksTourProviderComponent);
AttacksTourProvider.displayName = 'AttacksTourProvider';

export const useAttacksTour = (): AttacksTourContextValue => {
  const context = useContext(AttacksTourContext);
  if (!context) {
    throw new Error('useAttacksTour must be used within an AttacksTourProvider');
  }
  return context;
};
