/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Catalog of every domain event that alerting framework publishes on its in-process
 * event bus.
 *
 * This module is the single import point for code that needs to talk about
 * "alerting framework events" as a whole (e.g. when typing `EventBus<...>` or
 * `EventBusSubscriber<...>`). It re-exports each publisher's event types and
 * exposes the {@link AlertingDomainEvent} discriminated union.
 *
 * New publishers (e.g. the rule executor or dispatcher) should:
 *  1. Define their concrete event type and runtime `*_TYPE` constant inside
 *     their own domain folder (alongside the code that publishes it).
 *  2. Add a re-export here.
 *  3. Extend the {@link AlertingDomainEvent} union below.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ServiceIdentifier } from 'inversify';
import type { EventBus } from '../event_bus';
import type { AlertActionEvent } from '../alert_action_event_publisher/events';
import type { RuleExecutorEvent } from '../rule_executor_event_publisher/events';

export type {
  AlertActionEvent,
  AlertActionEventEnvelope,
  BaseAlertActionEvent,
  EpisodeAssignedEvent,
  EpisodeAssignedPayload,
  EpisodeUnassignedEvent,
  EpisodeAckedEvent,
  EpisodeUnackedEvent,
  EpisodeTaggedEvent,
  EpisodeTaggedPayload,
  EpisodeSnoozedEvent,
  EpisodeSnoozedPayload,
  EpisodeUnsnoozedEvent,
  EpisodeActivatedEvent,
  EpisodeActivatedPayload,
  EpisodeDeactivatedEvent,
  EpisodeDeactivatedPayload,
} from '../alert_action_event_publisher/events';
export {
  EPISODE_ASSIGNED_EVENT_TYPE,
  EPISODE_UNASSIGNED_EVENT_TYPE,
  EPISODE_ACKED_EVENT_TYPE,
  EPISODE_UNACKED_EVENT_TYPE,
  EPISODE_TAGGED_EVENT_TYPE,
  EPISODE_SNOOZED_EVENT_TYPE,
  EPISODE_UNSNOOZED_EVENT_TYPE,
  EPISODE_ACTIVATED_EVENT_TYPE,
  EPISODE_DEACTIVATED_EVENT_TYPE,
} from '../alert_action_event_publisher/events';

export type {
  RuleExecutorEvent,
  RuleExecutionSignalsWrittenEvent,
} from '../rule_executor_event_publisher/events';
export { RULE_EXECUTION_SIGNALS_WRITTEN_EVENT_TYPE } from '../rule_executor_event_publisher/events';

/**
 * Discriminated union of every domain event the alerting framework publishes
 * on its event bus.
 *
 * Composed from per-subdomain unions so each subdomain owns its own catalog
 * (and its own envelope shape if it diverges). Alert-action and rule-executor
 * subdomains publish today. Future subdomains (rule lifecycle CRUD, dispatcher)
 * extend this union by adding their own sub-union here.
 */
export type AlertingDomainEvent = AlertActionEvent | RuleExecutorEvent;

/**
 * Publisher-side context threaded through every alerting bus publish call.
 *
 * The bus is generic over its context type ({@link EventBus}'s `TContext`
 * generic). This is the alerting catalog's concrete binding of it. It
 * carries the request from the publishing call site to every subscriber
 * so request-scoped consumers (e.g. the workflow subscriber, which needs
 * to build a user-scoped workflows client) can operate under the same
 * auth identity that produced the event, even though the bus dispatches
 * asynchronously.
 *
 * Other plugins reusing the bus pick their own `TContext` (or leave it
 * defaulted to `void`); the bus itself stays domain-agnostic.
 */
export interface AlertingPublisherContext {
  /**
   * Kibana request from the publishing call site.
   *
   * Subscribers may forward this to request-scoped clients (workflows,
   * spaces, ES `asScoped`, …). It is safe to retain across the bus's
   * `setImmediate` dispatch hop: `KibanaRequest` snapshots its headers at
   * construction, and Kibana's auth/spaces services key their state in
   * `WeakMap`s on the raw request object. Nothing on this path reads
   * from the live HTTP socket.
   */
  readonly request: KibanaRequest;
}

/**
 * Inversify token for the singleton {@link EventBus} carrying every
 * {@link AlertingDomainEvent} along with an {@link AlertingPublisherContext}.
 *
 * Typed against both the event union and the publisher context so that
 * subscribers receive a fully-narrowed event AND a typed context in
 * their handler:
 *
 * ```ts
 * constructor(@inject(AlertingDomainEventBusToken)
 *             private readonly bus: EventBus<AlertingDomainEvent, AlertingPublisherContext>) {}
 *
 * this.bus.subscribe('episode.assigned', (event, { request }) => {
 *   // `event` is `EpisodeAssignedEvent` and `request` is `KibanaRequest`.
 * });
 * ```
 *
 * Publishers get the same narrowing on `publish(event, { request })`.
 */
export const AlertingDomainEventBusToken = Symbol.for(
  'alerting_v2.AlertingDomainEventBus'
) as ServiceIdentifier<EventBus<AlertingDomainEvent, AlertingPublisherContext>>;
