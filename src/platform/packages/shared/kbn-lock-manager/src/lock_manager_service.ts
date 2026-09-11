/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup } from '@kbn/core-lifecycle-server';
import type { Logger } from '@kbn/logging';
import type { LockId } from './lock_manager_client';
import { withLock, getLock } from './lock_manager_client';

export class LockManagerService {
  constructor(private readonly coreSetup: CoreSetup<any>, private readonly logger: Logger) {}

  /**
   * Acquires a lock with the given ID and executes the callback function.
   * If the lock is already held by another process, the callback will not be executed.
   *
   * Example usage:
   *
   * const { withLock } = new LockManagerService(coreSetup, logger);
   * await withLock('my_lock', () => {
   *  // perform operation
   * });
   */
  async withLock<T>(
    lockId: LockId,
    callback: () => Promise<T>,
    {
      metadata,
    }: {
      metadata?: Record<string, any>;
    } = {}
  ) {
    const [coreStart] = await this.coreSetup.getStartServices();
    const esClient = coreStart.elasticsearch.client.asInternalUser;
    const logger = this.logger.get('lock-manager');

    return withLock<T>({ esClient, logger, lockId, metadata }, callback);
  }

  async getLock(lockId: LockId) {
    const [coreStart] = await this.coreSetup.getStartServices();
    const esClient = coreStart.elasticsearch.client.asInternalUser;
    const logger = this.logger.get('lock-manager');

    return getLock({ esClient, logger, lockId });
  }
}
