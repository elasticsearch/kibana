/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

/**
 * Tightens the server-side OpenAPI constraint (`z.number().min(0).max(2)`) to the
 * discrete 0.5-step ladder required by the UI (see
 * `../../../../../public/flyout/entity_details/watchlists_right/watchlist_form.tsx`).
 */
export const riskModifierSchema = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
]);

/**
 * Renders a `riskModifier` as `<value> (<human-readable meaning>)` for HITL
 * confirmation messages
 */
export const formatRiskModifier = (value: number): string => {
  if (value === 1) return `${value} (no change to entity risk scores)`;
  if (value === 0) return `${value} (risk scores zeroed out)`;
  return `${value} (risk scores multiplied by ${value})`;
};
