/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { NEW_FEATURES_TOUR_STORAGE_KEYS } from '../../../../../common/constants';
import { EXPAND_ATTACK_BUTTON_TEST_ID } from '../table/attack_group_content';

/**
 * Storage key for the persisted tour state ({@link AttacksTourState}).
 */
export const ATTACKS_TOUR_STORAGE_KEY = NEW_FEATURES_TOUR_STORAGE_KEYS.ATTACKS_PAGE;

/**
 * Storage key for the persisted "welcome callout dismissed" flag.
 */
export const ATTACKS_TOUR_CALLOUT_STORAGE_KEY = NEW_FEATURES_TOUR_STORAGE_KEYS.ATTACKS_PAGE_CALLOUT;

/**
 * CSS selectors used by the tour steps to anchor their popovers to existing
 * elements on the Attacks page.
 */
export const ATTACKS_TOUR_ANCHORS = {
  /** The Schedule button inside the page header `Actions`. */
  runSchedule: '[data-test-subj="schedule"]',
  /** The filter group menu button in the standard filters section. */
  filters: '[data-test-subj="filter-group__context"]',
  /** The first "open attack details flyout" button in the attacks table. */
  flyout: `[data-test-subj="${EXPAND_ATTACK_BUTTON_TEST_ID}"]`,
} as const;

export const ATTACKS_TOUR_POPOVER_WIDTH = 360;

/**
 * How long to wait for a step's anchor to mount before completing the tour, to
 * avoid leaving it active with nothing rendered (which would also keep the
 * welcome callout suppressed). See the anchor safety valve in `attacks_tour.tsx`.
 *
 * Some anchors (e.g. the filter group menu button) only mount after the data
 * view and controls finish loading, so this needs enough headroom to outlast a
 * cold reload; otherwise the tour is prematurely completed when resuming on
 * such a step.
 */
export const ATTACKS_TOUR_ANCHOR_TIMEOUT_MS = 5000;

export const ATTACKS_TOUR_CALLOUT_TEST_ID = 'attacks-page-tour-callout';
export const ATTACKS_TOUR_CALLOUT_START_TEST_ID = 'attacks-page-tour-callout-start';
export const ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID = 'attacks-page-tour-callout-docs';
export const ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID = 'attacks-page-tour-callout-dismiss';
export const ATTACKS_TOUR_STEP_TEST_ID = 'attacks-page-tour-step';

/**
 * Persisted tour state. A single counter drives a single tour; the
 * attack-details-flyout step is an optional 3rd step shown only when attacks
 * exist (see the reconciliation logic in `attacks_tour_provider.tsx`).
 */
export interface AttacksTourState {
  isTourActive: boolean;
  /** 1-indexed current step. */
  currentTourStep: number;
  /** Set on finish OR when reconciliation completes a tour that outgrew its steps. */
  isTourComplete: boolean;
}

export const DEFAULT_ATTACKS_TOUR_STATE: AttacksTourState = {
  isTourActive: false,
  currentTourStep: 1,
  isTourComplete: false,
};
