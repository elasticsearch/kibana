/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tactics } from '../catalog';

/**
 * Normalizes a tactic name to a comparable key by removing dashes and
 * lowercasing. Both the catalog's camelCase `value` (e.g. `commandAndControl`)
 * and the technique-side dash form (e.g. `command-and-control`) collapse to
 * the same normalized form (`commandandcontrol`).
 */
const normalize = (v: string): string => v.replace(/-/g, '').toLowerCase();

const tacticByNormalizedValue = new Map(tactics.map((t) => [normalize(t.value), t]));

/**
 * Translates technique `tactics` entries (lowercase dash-separated MITRE
 * tactic short names as carried on `MitreTechnique.tactics`) into the
 * canonical `TAxxxx` tactic IDs.
 *
 * Used by detection-rule handoffs and ATT&CK heatmap renderers — both want
 * the canonical IDs, not the join-key form.
 *
 * Unknown values are dropped silently rather than raising, so callers that
 * receive a freshly-bumped MITRE technique referencing a tactic this snapshot
 * doesn't yet know about degrade gracefully.
 */
export const tacticsToIds = (tacticValues: readonly string[]): string[] =>
  tacticValues
    .map((v) => tacticByNormalizedValue.get(normalize(v))?.id)
    .filter((id): id is string => Boolean(id));
