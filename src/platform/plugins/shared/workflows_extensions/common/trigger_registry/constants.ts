/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Field prefix used in trigger condition KQL (e.g. "event.severity").
 * Use this when calling validateKqlAgainstSchema for trigger conditions so paths and error messages stay consistent.
 */
export const EVENT_FIELD_PREFIX = 'event.';

/**
 * Valid exclusivity scopes a trigger definition may declare.
 * Kept as a const tuple so the {@link TriggerExclusivity} type and the
 * registration-time validator in TriggerRegistry share one source of truth.
 *
 * Deliberately has no 'global' member: trigger dispatch always derives a single
 * spaceId from the emitting request, and `spaceId: '*'` (global) workflows are
 * a single document, so cross-space exclusivity is structurally guaranteed and
 * needs no enforcement here. Add a member only when a real fan-out case exists.
 */
export const TRIGGER_EXCLUSIVITY_SCOPES = ['per-space'] as const;
