/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateAlertActionBody } from '@kbn/alerting-v2-schemas';
import type { AlertAction } from '../../resources/datastreams/alert_actions';
import type { AlertEvent } from '../../resources/datastreams/alert_events';
import type { AlertEventRecord } from './types';

/**
 * Prepared write payload for one alert action. The audit `.alert-actions`
 * doc is always present; lifecycle actions (`deactivate` / `activate`)
 * additionally carry the synthetic `.rule-events` doc that flips
 * `episode.status` so the UI sees the new state without waiting for the
 * next rule run.
 *
 * Producing this struct is side-effect-free — preconditions are evaluated
 * and docs are built, but nothing is indexed and no domain event is
 * emitted until the orchestrator persists the batch and emits the
 * domain events.
 */
export interface PreparedAction {
  alertActionDoc: AlertAction;
  ruleEvent?: AlertEvent;
}

/**
 * One unit of work for a handler. Carries everything the handler needs
 * to build a {@link PreparedAction}:
 *
 * - `action` — the user-supplied body (already narrowed to `TBody`).
 * - `alertEvent` — the alert event the orchestrator resolved for this
 *   row.
 * - `alertActionDoc` — the audit doc the orchestrator has already built
 *   from `action` + `alertEvent`. Handlers pass it through unchanged
 *   for audit-only actions, or wrap it alongside a synthetic
 *   `.rule-events` doc for lifecycle actions.
 */
export interface HandlerItem<TBody extends CreateAlertActionBody> {
  action: TBody;
  alertEvent: AlertEventRecord;
  alertActionDoc: AlertAction;
}

/**
 * Strategy contract for one `action_type`. Implementations live in their
 * own file under `handlers/` and never know anything about routes,
 * persistence, telemetry, or sibling handlers.
 *
 * Handlers are pure and synchronous: preconditions are evaluated and
 * the write payload is built from `item` alone. If a future handler
 * genuinely needs to preload extra state, add a preload phase then —
 * not speculatively. The current design deliberately has none.
 *
 * Type parameter `TBody` is the clean discriminated-union variant for
 * this action_type (e.g. the `ack` body, not the union), so each
 * handler pulls off the fields it needs without `in` checks.
 */
export interface ActionHandler<TBody extends CreateAlertActionBody = CreateAlertActionBody> {
  /**
   * Pure, synchronous precondition check + doc build. Throws Boom 4xx on
   * precondition failure (same error codes routes already surface); the
   * bulk path catches 400/404 and silent-skips, the single path lets
   * them propagate. No I/O — everything needed is already on `item`.
   */
  prepare(item: HandlerItem<TBody>): PreparedAction;
}
