/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { CreateWatchlistRequestBodyInput } from '../../../../../common/api/entity_analytics/watchlists/management/create.gen';
import { useStableExpandableFlyoutState } from '../../../shared/hooks/use_stable_expandable_flyout_state';
import { WatchlistsFlyoutKey } from '../../shared/constants';
import {
  MAX_WATCHLIST_DESCRIPTION_LENGTH,
  MAX_WATCHLIST_NAME_LENGTH,
} from '../../../../../common/entity_analytics/watchlists/constants';

const WATCHLIST_RISK_MODIFIER_MIN = 0;
const WATCHLIST_RISK_MODIFIER_MAX = 2;
const WATCHLIST_RISK_MODIFIER_STEP = 0.5;

export const isValidWatchlistRiskModifier = (value: unknown): boolean => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (value < WATCHLIST_RISK_MODIFIER_MIN || value > WATCHLIST_RISK_MODIFIER_MAX) {
    return false;
  }
  const stepUnits = value / WATCHLIST_RISK_MODIFIER_STEP;
  return Math.abs(stepUnits - Math.round(stepUnits)) < 1e-9;
};

export const getWatchlistRiskModifierValidation = (watchlist: CreateWatchlistRequestBodyInput) => ({
  isRiskModifierInvalid: !isValidWatchlistRiskModifier(watchlist.riskModifier),
});

export const getDefaultWatchlist = (): CreateWatchlistRequestBodyInput => ({
  name: '',
  description: '',
  riskModifier: 1.5,
  managed: false,
});

export const getWatchlistFieldLengthValidation = (watchlist: CreateWatchlistRequestBodyInput) => ({
  isNameTooLong: watchlist.name.length > MAX_WATCHLIST_NAME_LENGTH,
  isDescriptionTooLong: (watchlist.description ?? '').length > MAX_WATCHLIST_DESCRIPTION_LENGTH,
});

export const useResetEditsOnFlyoutOpen = (setHasUserEdits: (value: boolean) => void) => {
  const { right } = useStableExpandableFlyoutState();
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const isOpen = right?.id === WatchlistsFlyoutKey;
    if (isOpen && !wasOpenRef.current) {
      setHasUserEdits(false);
    }
    wasOpenRef.current = isOpen;
  }, [right?.id, setHasUserEdits]);
};
