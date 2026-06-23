/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs';
import type { CoreStart, Logger } from '@kbn/core/server';
import type { TaskScheduling } from '../../task_scheduling';
import type { IntervalSchedule } from '../../task';
import { emptyState } from '../task_state';
import { PROVISION_UIAM_API_KEYS_FLAG, TASK_ID, TASK_TYPE, TAGS } from '../constants';

export class UiamProvisioningFeatureFlagScheduler {
  private featureFlagSubscription: Subscription | undefined;
  private appliedFlagValue: boolean | undefined;

  constructor(private readonly logger: Logger) {}

  start({
    core,
    taskScheduling,
    removeIfExists,
    schedule,
  }: {
    core: CoreStart;
    taskScheduling: TaskScheduling;
    removeIfExists: (id: string) => Promise<void>;
    schedule: IntervalSchedule;
  }): void {
    if (!taskScheduling) {
      this.logger.error(`Missing required task scheduling service during start of ${TASK_TYPE}`, {
        tags: TAGS,
      });
      return;
    }

    const applyFlag = async (enabled: boolean) => {
      // Only react to real flag transitions. The initial subscription emission
      // (previousValue === undefined) with `false` is treated as a no-op: there
      // is nothing to unschedule, and attempting to remove a non-existent task
      // can surface transient errors during startup.
      const previousValue = this.appliedFlagValue;
      this.appliedFlagValue = enabled;

      if (enabled) {
        if (previousValue !== true) {
          try {
            await taskScheduling.ensureScheduled({
              id: TASK_ID,
              taskType: TASK_TYPE,
              schedule,
              state: emptyState,
              params: {},
            });
            this.logger.info(
              `${PROVISION_UIAM_API_KEYS_FLAG} enabled - Task ${TASK_TYPE} scheduled`,
              { tags: TAGS }
            );
          } catch (e) {
            this.logger.error(
              `Error scheduling task ${TASK_TYPE}, received ${(e as Error).message}`,
              { tags: TAGS }
            );
            return;
          }
        } else {
          return;
        }
      }

      if (!enabled && previousValue === true) {
        try {
          await removeIfExists(TASK_ID);
          this.logger.info(`${PROVISION_UIAM_API_KEYS_FLAG} disabled - Task ${TASK_TYPE} removed`, {
            tags: TAGS,
          });
        } catch (e) {
          this.logger.error(`Error removing task ${TASK_TYPE}, received ${(e as Error).message}`, {
            tags: TAGS,
          });
        }
      }
    };

    this.featureFlagSubscription?.unsubscribe();
    this.featureFlagSubscription = core.featureFlags
      .getBooleanValue$(PROVISION_UIAM_API_KEYS_FLAG, false)
      .pipe(distinctUntilChanged())
      .subscribe((enabled) => {
        applyFlag(enabled).catch(() => {});
      });
  }

  stop(): void {
    this.featureFlagSubscription?.unsubscribe();
    this.featureFlagSubscription = undefined;
  }
}
