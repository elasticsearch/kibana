/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// The event-log identifiers and field that select a gap document. Shared by the
// gap read path (`buildGapsFilter`) and the gap soft-delete write path
// (`softDeleteGapsByQuery`) so the two cannot silently diverge — a mismatch
// would make soft-deleted gaps reappear, or leave gaps undeletable.
export const GAP_EVENT_ACTION = 'gap';
export const GAP_EVENT_PROVIDER = 'alerting';
export const GAP_DELETED_FIELD = 'kibana.alert.rule.gap.deleted';
