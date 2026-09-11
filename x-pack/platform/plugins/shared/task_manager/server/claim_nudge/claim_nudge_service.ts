/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { random } from 'lodash';
import { v4 } from 'uuid';
import { Subject } from 'rxjs';
import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { MGET_DEFAULT_POLL_INTERVAL } from '../config';

const GLOBAL_CLAIM_NUDGE_ID = 'global';
// The signal document is never read back — only the index's global checkpoint matters — but the
// fields are mapped anyway so the index is self-describing and easy to inspect when debugging.
const CLAIM_NUDGE_MAPPINGS: estypes.MappingTypeMapping = {
  dynamic: false,
  properties: {
    updated_at: {
      type: 'date',
    },
    nonce: {
      type: 'keyword',
      ignore_above: 1024,
    },
  },
};
// One shard because every nudge writes the same document, so there is never a second shard whose
// checkpoint could lag behind it. Auto-expanding replicas keeps single-node clusters green.
// Serverless manages both itself and rejects them, so it gets the platform defaults instead.
const CLAIM_NUDGE_SETTINGS: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  auto_expand_replicas: '0-1',
};
// Long-poll timeout for `_fleet/global_checkpoints`. Kept under 60s so idle proxies/load
// balancers (which see no bytes while the request waits) don't close the connection first.
export const CHECKPOINT_WAIT_TIMEOUT = '50s';
// Headroom above CHECKPOINT_WAIT_TIMEOUT so the client doesn't time out before the server does.
export const REQUEST_TIMEOUT_MS = 65_000;
const ERROR_RETRY_BASE_DELAY_MS = 1_000;
export const ERROR_RETRY_MAX_DELAY_MS = 60_000;
const ERROR_LOG_THROTTLE_MS = 60_000;
// `runSoon` awaits the nudge, so both requests below get one bounded attempt rather than the
// client's default 30s and three retries. Aborting doesn't cancel the work — Elasticsearch still
// applies it — so waiting longer only delays the caller.
//
// Matched to the default poll_interval: past that the regular poll has already claimed the task.
export const NUDGE_WRITE_TIMEOUT_MS = MGET_DEFAULT_POLL_INTERVAL;
// More generous: a timeout here drops every nudge coalesced onto the in-flight create, and it is
// paid at most once per process.
export const NUDGE_CREATE_TIMEOUT_MS = 3_000;

/**
 * Long-polls a dedicated, low-volume Elasticsearch index via the Fleet
 * `_fleet/global_checkpoints?wait_for_advance` API so Task Manager is notified almost
 * immediately when a `runSoon` (or `schedule(..., { requestImmediateClaim: true })`) happens
 * on another Kibana node, instead of waiting for the next poll interval.
 *
 * Best-effort: if the long-poll fails or is disabled, regular polling still picks up tasks;
 * this only nudges an existing poll cycle to run sooner.
 */
export interface TaskManagerClaimNudgeServiceOptions {
  logger: Logger;
  esClient: ElasticsearchClient;
  index: string;
  isServerless: boolean;
}

interface ClaimNudgeSignal {
  updated_at: string;
  nonce: string;
}

export class TaskManagerClaimNudgeService {
  private readonly logger: Logger;
  private readonly esClient: ElasticsearchClient;
  private readonly index: string;
  private readonly isServerless: boolean;
  private readonly claimNudgeSubject = new Subject<void>();
  private started = false;
  private runController: AbortController | undefined;
  private requestController: AbortController | undefined;
  private baselineSet = false;
  private lastErrorLoggedAt = 0;
  private ensureIndexPromise: Promise<void> | undefined;
  private consecutiveErrors = 0;

  constructor({ logger, esClient, index, isServerless }: TaskManagerClaimNudgeServiceOptions) {
    this.logger = logger;
    this.esClient = esClient;
    this.index = index;
    this.isServerless = isServerless;
  }

  /**
   * Emits whenever the claim nudge signal index advances, meaning some Kibana node
   * (possibly this one) requested an immediate claim cycle.
   */
  public get claimNudge$() {
    return this.claimNudgeSubject.asObservable();
  }

  /**
   * Begin long-polling the claim nudge signal index. Safe to call multiple times; only the
   * first call while stopped has an effect.
   */
  public start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.baselineSet = false;
    this.runController = new AbortController();
    // The loop retries internally, so reaching here means it can no longer recover on its own.
    // Log loudly rather than surfacing an unhandled rejection, which would take Kibana down.
    void this.watchCheckpoints(this.runController.signal).catch((err) => {
      this.started = false;
      this.logger.error(
        `Task Manager claim nudge watch loop for index ${this.index} stopped unexpectedly; ` +
          `falling back to regular polling until Kibana restarts: ${this.getErrorMessage(err)}`
      );
    });
  }

  /**
   * Stop long-polling, aborting the in-flight request and any pending retry delay.
   */
  public stop() {
    this.started = false;
    this.runController?.abort();
    this.runController = undefined;
    this.requestController?.abort();
    this.requestController = undefined;
  }

  /**
   * Writes a new signal document, advancing the claim nudge index's global checkpoint so any
   * node currently long-polling immediately observes it and triggers a claim cycle.
   *
   * No `refresh`: the checkpoint advances once the write replicates, which has nothing to do
   * with searchability — a refresh would only add cost and latency for no benefit here.
   */
  public async notify() {
    await this.ensureIndexExists();

    const document: ClaimNudgeSignal = {
      updated_at: new Date().toISOString(),
      nonce: v4(),
    };

    // Contents don't matter; the write itself is the signal. `nonce` ensures each call is a
    // real change rather than a no-op.
    await this.esClient.index<ClaimNudgeSignal>(
      {
        index: this.index,
        id: GLOBAL_CLAIM_NUDGE_ID,
        document,
      },
      { requestTimeout: NUDGE_WRITE_TIMEOUT_MS, maxRetries: 0 }
    );
  }

  /**
   * Creates the signal index if needed; nothing else does. Only `notify()` calls this — the watch
   * loop relies on `wait_for_index: true` instead. Memoized so a healthy node pays for it once.
   *
   * A failure aborts the nudge rather than falling through to the write, which would let
   * Elasticsearch auto-create the index without the mappings and settings above.
   */
  private async ensureIndexExists() {
    if (!this.ensureIndexPromise) {
      this.ensureIndexPromise = this.createIndex().catch((err) => {
        // Allow a later call to retry rather than caching the failure for the process lifetime.
        this.ensureIndexPromise = undefined;
        throw err;
      });
    }

    return this.ensureIndexPromise;
  }

  private async createIndex() {
    try {
      await this.esClient.indices.create(
        {
          index: this.index,
          mappings: CLAIM_NUDGE_MAPPINGS,
          ...(this.isServerless ? {} : { settings: CLAIM_NUDGE_SETTINGS }),
        },
        { requestTimeout: NUDGE_CREATE_TIMEOUT_MS, maxRetries: 0 }
      );
    } catch (err) {
      // Every Kibana node races to create the index; losing that race is the expected outcome.
      if (err?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
    }
  }

  /**
   * `runSignal` is aborted by `stop()`: it cancels a pending retry delay and keeps a loop
   * abandoned mid-retry from resuming if `start()` is called before that delay elapses.
   */
  private async watchCheckpoints(runSignal: AbortSignal) {
    let checkpoints: estypes.FleetCheckpoint[] = [];

    while (this.started && !runSignal.aborted) {
      // Not `runSignal`: the ES client dispatches a synthetic abort event on the signal it is
      // given when its request timeout fires, which would spill into later iterations.
      const requestController = new AbortController();
      this.requestController = requestController;

      try {
        const { global_checkpoints: nextCheckpoints, timed_out: timedOut } =
          await this.esClient.fleet.globalCheckpoints(
            {
              index: this.index,
              wait_for_advance: true,
              wait_for_index: true,
              checkpoints,
              timeout: CHECKPOINT_WAIT_TIMEOUT,
            },
            {
              signal: requestController.signal,
              requestTimeout: REQUEST_TIMEOUT_MS,
              retryOnTimeout: false,
              // The backoff below is the only retry; transport retries would bypass its jitter
              // and hide failures from `consecutiveErrors`.
              maxRetries: 0,
            }
          );

        // Any resolved response — even a timeout — counts as a success for backoff purposes.
        this.consecutiveErrors = 0;

        const hasAdvanced =
          this.baselineSet &&
          !timedOut &&
          JSON.stringify(checkpoints) !== JSON.stringify(nextCheckpoints);

        checkpoints = nextCheckpoints;
        this.baselineSet = true;

        if (hasAdvanced) {
          this.claimNudgeSubject.next();
        }
      } catch (err) {
        if (!this.started || runSignal.aborted) {
          // Expected: `stop()` aborted the in-flight request.
          this.logger.debug(`Task Manager claim nudge watch loop for index ${this.index} stopped.`);
          return;
        }

        this.consecutiveErrors += 1;
        const retryDelayMs = this.calculateRetryDelayMs();
        this.logThrottledWarning(err, retryDelayMs);
        await this.delay(retryDelayMs, runSignal);
      } finally {
        // Identity-checked so an abandoned loop can't clear a newer loop's controller.
        if (this.requestController === requestController) {
          this.requestController = undefined;
        }
      }
    }
  }

  /**
   * Equal jitter: half the exponential backoff is guaranteed, the other half is randomized.
   * Keeps nodes from retrying in lockstep without letting the delay collapse near zero.
   */
  private calculateRetryDelayMs() {
    const half =
      Math.min(
        ERROR_RETRY_MAX_DELAY_MS,
        ERROR_RETRY_BASE_DELAY_MS * 2 ** (this.consecutiveErrors - 1)
      ) / 2;
    return half + random(half);
  }

  private logThrottledWarning(err: unknown, retryDelayMs: number) {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < ERROR_LOG_THROTTLE_MS) {
      return;
    }
    this.lastErrorLoggedAt = now;
    this.logger.warn(
      `Failed to watch Task Manager claim nudge checkpoints for index ${
        this.index
      }, falling back to regular polling and retrying in ~${retryDelayMs}ms: ${this.getErrorMessage(
        err
      )}`
    );
  }

  private getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Resolves after `ms`, or early on abort so `stop()` doesn't leave a timer holding the event
   * loop open for up to a minute.
   */
  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const finish = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timeout = setTimeout(finish, ms);
      signal.addEventListener('abort', finish, { once: true });
    });
  }
}
