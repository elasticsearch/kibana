/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CreateWatchlistRequestBodyInput } from '../../../../../common/api/entity_analytics/watchlists/management/create.gen';
import { useGetWatchlistFormData } from './use_get_watchlist_form_data';
import type { WatchlistFormState } from './use_watchlist_form_state';
import {
  getDefaultWatchlist,
  getWatchlistFieldLengthValidation,
  getWatchlistRiskModifierValidation,
  useResetEditsOnFlyoutOpen,
} from './use_watchlist_form_state_shared';

export interface UseEditWatchlistFormStateParams {
  watchlistId?: string;
}

export const useEditWatchlistFormState = ({
  watchlistId,
}: UseEditWatchlistFormStateParams): WatchlistFormState => {
  const normalizedWatchlistId = useMemo(() => {
    if (!watchlistId) {
      return undefined;
    }
    return watchlistId.replace(/^'+|'+$/g, '');
  }, [watchlistId]);

  const defaultWatchlist = useMemo<CreateWatchlistRequestBodyInput>(
    () => getDefaultWatchlist(),
    []
  );
  const [initialWatchlist, setInitialWatchlist] =
    useState<CreateWatchlistRequestBodyInput>(defaultWatchlist);
  const [watchlist, setWatchlist] = useState<CreateWatchlistRequestBodyInput>(defaultWatchlist);
  const [hasUserEdits, setHasUserEdits] = useState(false);
  const [isSourceValid, setSourceValid] = useState(true);

  const setWatchlistField = <K extends keyof CreateWatchlistRequestBodyInput>(
    key: K,
    value: CreateWatchlistRequestBodyInput[K]
  ) => {
    setWatchlist((prev) => ({ ...prev, [key]: value }));
    setHasUserEdits(true);
  };

  const {
    initialWatchlist: fetchedWatchlist,
    ruleBasedSourceIds,
    indexSourceWithMissingApiKey,
  } = useGetWatchlistFormData(normalizedWatchlistId);

  useResetEditsOnFlyoutOpen(setHasUserEdits);

  useEffect(() => {
    if (!fetchedWatchlist || hasUserEdits) {
      return;
    }

    setInitialWatchlist(fetchedWatchlist);
    setWatchlist(fetchedWatchlist);
  }, [fetchedWatchlist, hasUserEdits]);

  useEffect(() => {
    if (normalizedWatchlistId) {
      setHasUserEdits(false);
    }
  }, [normalizedWatchlistId]);

  const isMissingId = !normalizedWatchlistId;
  const hasChanges =
    watchlist.name.trim() !== initialWatchlist.name.trim() ||
    watchlist.description?.trim() !== initialWatchlist.description?.trim() ||
    watchlist.riskModifier !== initialWatchlist.riskModifier ||
    JSON.stringify(watchlist.entitySources) !== JSON.stringify(initialWatchlist.entitySources);
  const { isNameTooLong, isDescriptionTooLong } = getWatchlistFieldLengthValidation(watchlist);
  const { isRiskModifierInvalid } = getWatchlistRiskModifierValidation(watchlist);
  const isDisabled =
    isMissingId ||
    !watchlist.name.trim() ||
    !hasChanges ||
    isNameTooLong ||
    isDescriptionTooLong ||
    isRiskModifierInvalid ||
    !isSourceValid;

  return {
    watchlist,
    normalizedWatchlistId,
    ruleBasedSourceIds: ruleBasedSourceIds ?? {},
    indexSourceWithMissingApiKey,
    isEditMode: true,
    isDisabled,
    isNameTooLong,
    isDescriptionTooLong,
    isRiskModifierInvalid,
    setWatchlistField,
    setSourceValid,
  };
};
