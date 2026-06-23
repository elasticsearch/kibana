/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WatchlistsFlyoutMode } from '..';
import type { CreateWatchlistRequestBodyInput } from '../../../../../common/api/entity_analytics/watchlists/management/create.gen';
import type { MonitoringEntitySource } from '../../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import type { SourceType } from './rule_based_source_helpers';
import { useCreateWatchlistFormState } from './use_watchlist_form_state_create';
import { useEditWatchlistFormState } from './use_watchlist_form_state_edit';

export interface UseWatchlistFormStateParams {
  mode: WatchlistsFlyoutMode;
  watchlistId?: string;
}

export interface WatchlistFormState {
  watchlist: CreateWatchlistRequestBodyInput;
  normalizedWatchlistId?: string;
  /** Maps source type ('store' | 'index') → persisted entity-source ID. */
  ruleBasedSourceIds: Partial<Record<SourceType, string>>;
  /** Set when an index source exists but has no stored API key — sync is paused until refreshed. */
  indexSourceWithMissingApiKey?: MonitoringEntitySource;
  isEditMode: boolean;
  isDisabled: boolean;
  isNameTooLong: boolean;
  isDescriptionTooLong: boolean;
  isRiskModifierInvalid: boolean;
  setWatchlistField: <K extends keyof CreateWatchlistRequestBodyInput>(
    key: K,
    value: CreateWatchlistRequestBodyInput[K]
  ) => void;
  setSourceValid: (valid: boolean) => void;
}

export const useWatchlistFormState = ({
  mode,
  watchlistId,
}: UseWatchlistFormStateParams): WatchlistFormState => {
  const editState = useEditWatchlistFormState({ watchlistId });
  const createState = useCreateWatchlistFormState();

  return mode === 'edit' ? editState : createState;
};
