/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ThreatCategory, ThreatRegion } from './constants';
import type { TimeRangePresetId } from './time_range';

/**
 * Attributes stored on the `threat-intelligence-saved-view` saved object.
 * Capture only the dashboard filter state — not the data itself — so the
 * view is a small, shareable pointer rather than a snapshot.
 */
export interface SavedViewAttributes {
  name: string;
  description?: string;
  filters: {
    regions?: ThreatRegion[];
    categories?: ThreatCategory[];
    /**
     * Quick-range preset for the dashboard time filter. Preferred over
     * `time_range` because presets stay relative when a saved view is
     * reopened days later.
     */
    time_range_preset?: TimeRangePresetId;
    /**
     * Legacy fixed ISO window. New saves use `time_range_preset` instead.
     * When omitted, the dashboard default (last 7 days) applies at load time.
     */
    time_range?: {
      from: string;
      to: string;
    };
  };
  /** ISO timestamps; written server-side, never trusted from the client. */
  created_at: string;
  updated_at: string;
  /**
   * Free-text owner label — captured for display only; access control is
   * via saved-object/space privileges, not this field.
   */
  owner?: string;
}

export interface SavedViewSummary extends SavedViewAttributes {
  id: string;
}
