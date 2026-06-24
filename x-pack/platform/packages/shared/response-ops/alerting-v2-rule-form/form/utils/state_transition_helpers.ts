/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DELAY_MODE } from '../types';
import type { FormValues, StateTransition } from '../types';

/** Derives alert-delay mode from persisted `state_transition`. */
export const deriveAlertDelayModeFromStateTransition = (
  stateTransition?: StateTransition | null
): FormValues['stateTransitionAlertDelayMode'] => {
  if (stateTransition?.pendingTimeframe != null) return DELAY_MODE.duration;
  if (stateTransition?.pendingCount != null && stateTransition.pendingCount > 0)
    return DELAY_MODE.breaches;
  return DELAY_MODE.immediate;
};

/** Derives recovery-delay mode from persisted `state_transition`. */
export const deriveRecoveryDelayModeFromStateTransition = (
  stateTransition?: StateTransition | null
): FormValues['stateTransitionRecoveryDelayMode'] => {
  if (stateTransition?.recoveringTimeframe != null) return DELAY_MODE.duration;
  if (stateTransition?.recoveringCount != null && stateTransition.recoveringCount > 0)
    return DELAY_MODE.recoveries;
  return DELAY_MODE.immediate;
};
