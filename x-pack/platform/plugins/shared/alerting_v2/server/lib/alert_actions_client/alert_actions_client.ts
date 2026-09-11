/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { KibanaRequest } from '@kbn/core-http-server';
import { Request } from '@kbn/core-di-server';
import { inject, injectable } from 'inversify';
import { omit } from 'lodash';
import {
  ALERT_EPISODE_ACTION_TYPE,
  type BulkCreateEpisodeAlertActionItemBody,
  type BulkCreateSeriesAlertActionItemBody,
  type BulkResponse,
  type CreateAlertActionBody,
  type CreateEpisodeAlertActionBody,
  type CreateSeriesAlertActionBody,
  type EpisodeAlertActionType,
} from '@kbn/alerting-v2-schemas';
import { ALERT_ACTIONS_DATA_STREAM, ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-constants';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import {
  getAlertEpisodeNotFoundMessage,
  getAlertSeriesNotFoundMessage,
  getEpisodeNotLatestMessage,
} from '../errors/alert_error_messages';
import type { AlertAction } from '../../resources/datastreams/alert_actions';
import { AlertActionEventPublisher } from '../events/alert_action_event_publisher/alert_action_event_publisher';
import { type QueryServiceContract } from '../services/query_service/query_service';
import { QueryServiceInternalToken } from '../services/query_service/tokens';
import type { StorageServiceContract } from '../services/storage_service/storage_service';
import { StorageServiceScopedToken } from '../services/storage_service/tokens';
import type { UserServiceContract } from '../services/user_service/user_service';
import { UserService } from '../services/user_service/user_service';
import { RequestSpaceIdToken } from '../services/spaces_service/tokens';
import {
  loadLastEpisodeAlertEventOrThrow,
  loadLastSeriesAlertEventOrThrow,
  loadLatestAlertEventsByEpisodeId,
  loadLatestAlertEventsByGroupHash,
} from './context_loaders/load_latest_alert_events';
import type { AlertEventRecord } from './types';
import type { PreparedAction } from './handler';
import { ACTION_HANDLERS, prepareWithHandler } from './handlers';

/** A single per-item error in a bulk create alert actions response. */
type BulkAlertActionError = BulkResponse['errors'][number];

/** Structured `data` carried by alert-action precondition Boom errors. */
interface AlertActionBoomData {
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Builds a per-item bulk error keyed by the item's own identifier —
 * `group_hash` for series-level items, `episode_id` for episode-level items.
 * Handler-supplied context (e.g. `episode_status`) is carried in `details`.
 */
const toBulkActionError = (
  id: string,
  error: { code: string; message: string; details?: Record<string, unknown> }
): BulkAlertActionError => ({
  id,
  error: {
    code: error.code,
    message: error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  },
});

/**
 * Converts an expected per-item precondition Boom error into a bulk-error
 * entry keyed by the item's identifier. The handler-thrown `code`/`details`
 * (e.g. `episode_status`) are preserved so a client can tell *which*
 * precondition failed; handlers without a `code` fall back to the generic
 * `INTERNAL_SERVER_ERROR`.
 */
const boomToBulkActionError = (id: string, error: Boom.Boom): BulkAlertActionError => {
  // `error.data` is `unknown` on a caught Boom; the alert-action handlers only
  // ever attach the `{ code, details }` shape, so this structural read is safe.
  const data: AlertActionBoomData =
    error.data != null && typeof error.data === 'object' ? (error.data as AlertActionBoomData) : {};

  return toBulkActionError(id, {
    code: data.code ?? ALERTING_ERROR_CODES.INTERNAL_SERVER_ERROR,
    message: error.message,
    details: data.details,
  });
};

/**
 * Lifecycle actions (`activate` / `deactivate`) write a synthetic
 * `.rule-events` doc with `@timestamp: now`; applied to a superseded episode
 * that doc would make the old episode the group's latest and hijack the
 * director's group-level state machine, so they are guarded to the latest
 * episode of the series. The other episode actions are pure audit records
 * and may target any existing episode.
 */
const isLifecycleActionType = (actionType: EpisodeAlertActionType): boolean =>
  actionType === ALERT_EPISODE_ACTION_TYPE.ACTIVATE ||
  actionType === ALERT_EPISODE_ACTION_TYPE.DEACTIVATE;

@injectable()
export class AlertActionsClient {
  constructor(
    @inject(QueryServiceInternalToken) private readonly queryService: QueryServiceContract,
    @inject(StorageServiceScopedToken) private readonly storageService: StorageServiceContract,
    @inject(UserService) private readonly userService: UserServiceContract,
    @inject(Request) private readonly request: KibanaRequest,
    @inject(RequestSpaceIdToken) private readonly spaceId: string,
    @inject(AlertActionEventPublisher)
    private readonly eventPublisher: AlertActionEventPublisher
  ) {}

  /**
   * Creates a series-level action (`tag` / `snooze` / `unsnooze`) for the
   * series identified by `groupHash`. The series' latest event is still
   * resolved — it fills `rule_id`, `source` and `last_series_event_timestamp`
   * on the audit doc — but both the persisted `.alert-actions` document and
   * the emitted domain event carry `episode_id: null`: the action targets
   * the series as a whole, not whichever episode happened to be current.
   */
  public async createSeriesAction(params: {
    groupHash: string;
    action: CreateSeriesAlertActionBody;
  }): Promise<void> {
    const { groupHash, action } = params;

    const [userProfileUid, alertEvent] = await Promise.all([
      this.userService.getCurrentUserProfileUid(),
      loadLastSeriesAlertEventOrThrow({
        queryService: this.queryService,
        spaceId: this.spaceId,
        groupHash,
      }),
    ]);

    const prepared = this.prepareAction({ action, alertEvent, userProfileUid, docEpisodeId: null });

    await this.persistPreparedActions([prepared]);
    this.eventPublisher.emitEpisodeActions(this.request, [prepared.alertActionDoc]);
  }

  /**
   * Creates an episode-level action (`ack` / `unack` / `assign` /
   * `activate` / `deactivate`) for the episode identified by `episodeId`.
   * The episode's own latest event provides the audit anchors, including
   * `group_hash` — the caller never supplies it.
   *
   * Lifecycle actions additionally require the episode to be the latest of
   * its series (see {@link isLifecycleActionType}); an old episode is
   * rejected with a 404 `ALERT_EPISODE_NOT_LATEST`.
   */
  public async createEpisodeAction(params: {
    episodeId: string;
    action: CreateEpisodeAlertActionBody;
  }): Promise<void> {
    const { episodeId, action } = params;

    const [userProfileUid, alertEvent] = await Promise.all([
      this.userService.getCurrentUserProfileUid(),
      loadLastEpisodeAlertEventOrThrow({
        queryService: this.queryService,
        spaceId: this.spaceId,
        episodeId,
      }),
    ]);

    if (isLifecycleActionType(action.action_type)) {
      const [latestOfGroup] = await loadLatestAlertEventsByGroupHash({
        queryService: this.queryService,
        spaceId: this.spaceId,
        groupHashes: [alertEvent.group_hash],
      });

      if (latestOfGroup?.episode_id !== episodeId) {
        throw Boom.notFound(getEpisodeNotLatestMessage(episodeId, alertEvent.group_hash), {
          code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_LATEST,
          details: { episode_id: episodeId, group_hash: alertEvent.group_hash },
        });
      }
    }

    const prepared = this.prepareAction({
      action,
      alertEvent,
      userProfileUid,
      docEpisodeId: alertEvent.episode_id,
    });

    await this.persistPreparedActions([prepared]);
    this.eventPublisher.emitEpisodeActions(this.request, [prepared.alertActionDoc]);
  }

  /**
   * Builds the writable payload for a single action. Pure / read-only
   * and **synchronous** — preconditions are evaluated and the docs are
   * constructed, but nothing is indexed and no domain event is emitted.
   * Throws on precondition failure with the same Boom error each route
   * surface relies on.
   *
   * Shared between the single-action paths (which let the throw bubble
   * back to the route) and the bulk paths (which convert expected Boom
   * 400 / 404 rejections into per-item `errors[]` entries so the rest of
   * the batch still gets persisted). All I/O the prep would have needed
   * has already happened by the time this is called.
   */
  private prepareAction(params: {
    action: CreateAlertActionBody;
    alertEvent: AlertEventRecord;
    userProfileUid: string | null;
    /**
     * `episode_id` to persist on the audit doc: the resolved event's episode
     * id for episode-scoped actions, `null` for series-scoped actions.
     */
    docEpisodeId: string | null;
  }): PreparedAction {
    const { action, alertEvent, userProfileUid, docEpisodeId } = params;
    const alertActionDoc = this.buildAlertActionDocument({
      action,
      alertEvent,
      userProfileUid,
      docEpisodeId,
    });

    return prepareWithHandler({ action, alertEvent, alertActionDoc }, ACTION_HANDLERS);
  }

  /**
   * Persists a batch of prepared actions in a single ES `_bulk` round-trip.
   * `bulkIndexDocsAcrossIndices` is used uniformly so audit-only batches and
   * mixed audit + synthetic `.rule-events` batches share one code path. The
   * `wait_for` refresh ensures the next API/UI read sees the new state.
   */
  private async persistPreparedActions(prepared: readonly PreparedAction[]): Promise<void> {
    if (prepared.length === 0) {
      return;
    }

    const docs = prepared.flatMap(({ alertActionDoc, ruleEvent }) =>
      ruleEvent
        ? [
            { index: ALERT_EVENTS_DATA_STREAM, doc: ruleEvent },
            { index: ALERT_ACTIONS_DATA_STREAM, doc: alertActionDoc },
          ]
        : [{ index: ALERT_ACTIONS_DATA_STREAM, doc: alertActionDoc }]
    );

    await this.storageService.bulkIndexDocsAcrossIndices({
      docs,
      refresh: 'wait_for',
    });
  }

  /**
   * Bulk equivalent of {@link AlertActionsClient.createSeriesAction}: one
   * latest-event query for every series referenced in the batch, per-item
   * `errors[]` for missing series, and `episode_id: null` on every persisted
   * audit doc and emitted domain event.
   */
  public async createBulkSeriesActions(
    items: BulkCreateSeriesAlertActionItemBody[]
  ): Promise<BulkResponse> {
    const [userProfileUid, latestEvents] = await Promise.all([
      this.userService.getCurrentUserProfileUid(),
      loadLatestAlertEventsByGroupHash({
        queryService: this.queryService,
        spaceId: this.spaceId,
        groupHashes: items.map((item) => item.group_hash),
      }),
    ]);

    const latestEventByGroupHash = new Map(latestEvents.map((event) => [event.group_hash, event]));

    const errors: BulkAlertActionError[] = [];
    const prepared: PreparedAction[] = [];

    for (const item of items) {
      const alertEvent = latestEventByGroupHash.get(item.group_hash);

      if (!alertEvent) {
        errors.push(
          toBulkActionError(item.group_hash, {
            code: ALERTING_ERROR_CODES.ALERT_GROUP_NOT_FOUND,
            message: getAlertSeriesNotFoundMessage(item.group_hash),
          })
        );
        continue;
      }

      try {
        prepared.push(
          this.prepareAction({
            action: item,
            alertEvent,
            userProfileUid,
            docEpisodeId: null,
          })
        );
      } catch (error) {
        if (
          Boom.isBoom(error) &&
          (error.output.statusCode === 400 || error.output.statusCode === 404)
        ) {
          errors.push(boomToBulkActionError(item.group_hash, error));
          continue;
        }
        throw error;
      }
    }

    if (prepared.length > 0) {
      await this.persistPreparedActions(prepared);
      this.eventPublisher.emitEpisodeActions(
        this.request,
        prepared.map((p) => p.alertActionDoc)
      );
    }

    return { affected_count: prepared.length, errors };
  }

  /**
   * Bulk equivalent of {@link AlertActionsClient.createEpisodeAction}: one
   * latest-event query for every episode referenced in the batch, plus — for
   * lifecycle items only — one latest-event query over their series to
   * enforce the latest-episode guard. Missing or superseded episodes are
   * reported per item; the rest of the batch still runs.
   */
  public async createBulkEpisodeActions(
    items: BulkCreateEpisodeAlertActionItemBody[]
  ): Promise<BulkResponse> {
    const [userProfileUid, episodeEvents] = await Promise.all([
      this.userService.getCurrentUserProfileUid(),
      loadLatestAlertEventsByEpisodeId({
        queryService: this.queryService,
        spaceId: this.spaceId,
        episodeIds: items.map((item) => item.episode_id),
      }),
    ]);

    const eventByEpisodeId = new Map(episodeEvents.map((event) => [event.episode_id, event]));

    // Latest-episode guard for lifecycle items: resolve the latest episode of
    // every series a lifecycle item points at (see isLifecycleActionType).
    const lifecycleGroupHashes = items
      .filter((item) => isLifecycleActionType(item.action_type))
      .map((item) => eventByEpisodeId.get(item.episode_id)?.group_hash)
      .filter((groupHash): groupHash is string => groupHash !== undefined);
    const latestOfGroups = await loadLatestAlertEventsByGroupHash({
      queryService: this.queryService,
      spaceId: this.spaceId,
      groupHashes: lifecycleGroupHashes,
    });
    const latestEpisodeIdByGroupHash = new Map(
      latestOfGroups.map((event) => [event.group_hash, event.episode_id])
    );

    const errors: BulkAlertActionError[] = [];
    const prepared: PreparedAction[] = [];

    for (const item of items) {
      const alertEvent = eventByEpisodeId.get(item.episode_id);

      if (!alertEvent) {
        errors.push(
          toBulkActionError(item.episode_id, {
            code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_FOUND,
            message: getAlertEpisodeNotFoundMessage(item.episode_id),
          })
        );
        continue;
      }

      if (
        isLifecycleActionType(item.action_type) &&
        latestEpisodeIdByGroupHash.get(alertEvent.group_hash) !== item.episode_id
      ) {
        errors.push(
          toBulkActionError(item.episode_id, {
            code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_LATEST,
            message: getEpisodeNotLatestMessage(item.episode_id, alertEvent.group_hash),
            details: { group_hash: alertEvent.group_hash },
          })
        );
        continue;
      }

      try {
        prepared.push(
          this.prepareAction({
            action: item,
            alertEvent,
            userProfileUid,
            docEpisodeId: alertEvent.episode_id,
          })
        );
      } catch (error) {
        if (
          Boom.isBoom(error) &&
          (error.output.statusCode === 400 || error.output.statusCode === 404)
        ) {
          errors.push(boomToBulkActionError(item.episode_id, error));
          continue;
        }
        throw error;
      }
    }

    if (prepared.length > 0) {
      await this.persistPreparedActions(prepared);
      this.eventPublisher.emitEpisodeActions(
        this.request,
        prepared.map((p) => p.alertActionDoc)
      );
    }

    return { affected_count: prepared.length, errors };
  }

  private buildAlertActionDocument(params: {
    action: CreateAlertActionBody;
    alertEvent: AlertEventRecord;
    userProfileUid: string | null;
    docEpisodeId: string | null;
  }): AlertAction {
    const { action, alertEvent, userProfileUid, docEpisodeId } = params;
    // Strip the identifiers bulk items carry alongside the action payload
    // (`group_hash` on series items, `episode_id` on episode items) — the
    // doc's own identifier fields below are authoritative.
    const actionData = omit(action, ['group_hash', 'episode_id', 'action_type']);

    return {
      '@timestamp': new Date().toISOString(),
      actor: userProfileUid,
      action_type: action.action_type,
      last_series_event_timestamp: alertEvent['@timestamp'],
      rule_id: alertEvent.rule_id,
      source: alertEvent.source,
      group_hash: alertEvent.group_hash,
      episode_id: docEpisodeId,
      space_id: alertEvent.space_id,
      ...actionData,
    };
  }
}
