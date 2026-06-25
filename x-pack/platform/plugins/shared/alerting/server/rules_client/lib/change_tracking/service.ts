/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import crypto from 'node:crypto';
import type {
  CoreAuthenticationService,
  ElasticsearchClient,
  KibanaRequest,
} from '@kbn/core/server';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type { Logger } from '@kbn/logging';
import type {
  ObjectChange,
  GetHistoryResult,
  LogChangeHistoryOptions,
  GetChangeHistoryOptions,
} from '@kbn/change-history';
import { ChangeHistoryClient } from '@kbn/change-history';
import { RULE_SAVED_OBJECT_TYPE, RuleAttributesToEncrypt } from '../../../saved_objects';
import type {
  ChangeTrackingServiceInitializeParams,
  IChangeTrackingService,
  IScopedChangeTrackingService,
  RuleChange,
} from './types';
import { ALERTING_RULE_DATASET } from './constants';

const RULE_SO_FIELDS_TO_HASH = Object.fromEntries(
  RuleAttributesToEncrypt.map((field) => [field, true] as [string, true])
);

export class ChangeTrackingService implements IChangeTrackingService {
  private clients: Record<RuleTypeSolution, ChangeHistoryClient>;
  private logger: Logger;
  private kibanaVersion: string;
  private modules: RuleTypeSolution[];
  private dataset = ALERTING_RULE_DATASET;
  private authService?: CoreAuthenticationService;

  constructor(logger: Logger, kibanaVersion: string) {
    this.clients = {} as Record<RuleTypeSolution, ChangeHistoryClient>;
    this.logger = logger.get('change_tracking');
    this.kibanaVersion = kibanaVersion;
    this.modules = [];
  }

  register(module: RuleTypeSolution): void {
    if (this.modules.includes(module)) {
      return;
    }
    this.modules.push(module);
    const { dataset, logger, kibanaVersion } = this;
    const client = new ChangeHistoryClient({ module, dataset, logger, kibanaVersion });
    this.clients[module] = client;
    this.logger.debug(`Change tracking registered for [${module}, ${this.dataset}]`);
  }

  isInitialized(module: RuleTypeSolution): boolean {
    return !!this.clients[module]?.isInitialized();
  }

  initialize({ elasticsearchClient, authService }: ChangeTrackingServiceInitializeParams): void {
    this.logger.debug(`Initializing change tracking..`);
    this.authService = authService;

    void this.initializeAll(elasticsearchClient).catch((cause) => {
      const error = new Error(
        `Unexpected failure initializing change tracking for [${this.dataset}]`,
        { cause }
      );
      this.logger.error(error);
    });
  }

  asScoped(request: KibanaRequest): IScopedChangeTrackingService {
    if (!this.authService) {
      throw new Error(
        'ChangeTrackingService.asScoped called before initialize(); authentication service is not available.'
      );
    }

    const user = this.authService.getCurrentUser(request);
    const username = user?.username ?? '';
    const userProfileId = user?.profile_uid;

    return {
      log: async (change, opts) =>
        this.log(change, {
          ...opts,
          username,
          userProfileId,
        }),
      logBulk: async (changes, opts) =>
        this.logBulk(changes, {
          ...opts,
          username,
          userProfileId,
        }),
      getHistory: this.getHistory.bind(this),
    };
  }

  private async initializeAll(elasticsearchClient: ElasticsearchClient) {
    // Initialize each change history client (in sequence - better than in parallel)
    for (const [module, client] of Object.entries(this.clients)) {
      try {
        await client.initialize(elasticsearchClient);
        this.logger.info(`Change tracking initialized for [${module}, ${this.dataset}]`);
      } catch (cause) {
        const error = new Error(
          `Unable to initialize change tracking for [${module}, ${this.dataset}]`,
          { cause }
        );
        this.logger.error(error);
      }
    }
  }

  private async log(change: RuleChange, opts: LogChangeHistoryOptions) {
    return this.logBulk([change], opts);
  }

  private async logBulk(changes: RuleChange[], opts: LogChangeHistoryOptions) {
    // Group rule changes per solution
    const correlationId = crypto.randomBytes(16).toString('hex');
    const groups = changes.reduce((result, change) => {
      const { objectId, objectType, snapshot, module } = change;
      let objects = result.get(module);
      if (!objects) {
        result.set(module, (objects = []));
      }
      objects.push({ objectType, objectId, snapshot });
      return result;
    }, new Map<RuleTypeSolution, ObjectChange[]>());

    // One bulk call per solution (security, observability, stack, etc.)
    // since each is using different data streams.
    for (const module of groups.keys()) {
      const client = this.clients[module];
      const groupedChanges = groups.get(module);
      const count = groupedChanges?.length ?? 0;
      if (!client) {
        const error = new Error(
          `Unable to log changes. Change history client not initialized for [${module}, ${this.dataset}] correlationId=${correlationId}; dropped ${count} change(s)`
        );
        this.logger.warn(error);
        continue;
      }
      if (groupedChanges) {
        try {
          await client.logBulk(groupedChanges, {
            ...opts,
            correlationId,
            fieldsToHash: RULE_SO_FIELDS_TO_HASH,
          });
          this.logger.trace(
            `Logged ${groupedChanges.length} change/s to history stream for [${module}, ${this.dataset}] correlationId=${correlationId}`
          );
        } catch (err) {
          // Just catch the error.
          const error = new Error(
            `Error saving change history for [${module}, ${this.dataset}], missing ${count} change(s) with correlationId=${correlationId}: ${err}`,
            { cause: err }
          );
          this.logger.error(error);
        }
      }
    }
  }

  private async getHistory(
    module: RuleTypeSolution,
    spaceId: string,
    ruleId: string,
    opts: GetChangeHistoryOptions
  ): Promise<GetHistoryResult> {
    const client = this.clients[module];
    if (!client) {
      const error = new Error(
        `Unable to get history. Change history client not initialized for [${module}, ${this.dataset}]`
      );
      this.logger.warn(error.message);
      throw error;
    }
    return client.getHistory(spaceId, RULE_SAVED_OBJECT_TYPE, ruleId, opts);
  }
}
