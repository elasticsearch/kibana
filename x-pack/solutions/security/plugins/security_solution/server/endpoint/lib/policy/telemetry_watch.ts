/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';

import type { ElasticsearchClient, ElasticsearchServiceStart, Logger } from '@kbn/core/server';
import type { PackagePolicy, UpdatePackagePolicyWithId } from '@kbn/fleet-plugin/common';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type { PackagePolicyClient } from '@kbn/fleet-plugin/server';
import pRetry from 'p-retry';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { TelemetryConfigProvider } from '../../../../common/telemetry_config/telemetry_config_provider';
import type { PolicyData } from '../../../../common/endpoint/types';
import { getPolicyDataForUpdate } from '../../../../common/endpoint/service/policy';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { stringify } from '../../utils/stringify';

interface TelemetryConfigWatcherOptions {
  /** Retry SO operations immediately, without any delay. Useful for testing.
   */
  immediateRetry: boolean;
}

export class TelemetryConfigWatcher {
  private logger: Logger;
  private esClient: ElasticsearchClient;
  private policyService: PackagePolicyClient;
  private endpointAppContextService: EndpointAppContextService;
  private subscription: Subscription | undefined;
  private retryOptions: Partial<pRetry.Options>;

  constructor(
    policyService: PackagePolicyClient,
    esStart: ElasticsearchServiceStart,
    endpointAppContextService: EndpointAppContextService,
    options: TelemetryConfigWatcherOptions = { immediateRetry: false }
  ) {
    this.policyService = policyService;
    this.esClient = esStart.client.asInternalUser;
    this.endpointAppContextService = endpointAppContextService;
    this.logger = endpointAppContextService.createLogger(this.constructor.name);

    this.retryOptions = {
      retries: 4,
      minTimeout: options.immediateRetry ? 0 : 1000,
    };
  }

  public start(telemetryConfigProvider: TelemetryConfigProvider) {
    this.subscription = telemetryConfigProvider.getObservable()?.subscribe(this.watch.bind(this));
  }

  public stop() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  public async watch(isTelemetryEnabled: boolean) {
    let page = 1;
    let response: {
      items: PackagePolicy[];
      total: number;
      page: number;
      perPage: number;
    };
    let updated = 0;
    let failed = 0;
    let conflicts = 0;

    this.logger.debug(
      `Checking Endpoint policies to update due to changed global telemetry config setting. (New value: ${isTelemetryEnabled})`
    );

    do {
      try {
        response = await pRetry(
          (attemptCount) => {
            const soClient =
              this.endpointAppContextService.savedObjects.createInternalUnscopedSoClient(false);

            return this.policyService
              .list(soClient, {
                page,
                perPage: 100,
                kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: endpoint`,
                spaceId: '*',
              })
              .then((result) => {
                this.logger.debug(
                  `Retrieved page [${page}] of endpoint package policies on attempt [${attemptCount}]`
                );
                return result;
              });
          },
          {
            onFailedAttempt: (error) =>
              this.logger.debug(
                () =>
                  `Failed to fetch list of package policies. Attempt [${error.attemptNumber}] for page [${page}] returned error: ${error.name}, ${error.message}`
              ),
            ...this.retryOptions,
          }
        );
      } catch (e) {
        this.logger.warn(
          `Unable to verify endpoint policies in line with telemetry change: failed to fetch package policies: ${stringify(
            e
          )}`
        );
        return;
      }

      this.logger.debug(
        () => `Processing page [${response.page}] with [${response.items.length}] policy(s)`
      );

      const updatesBySpace: Record<string, UpdatePackagePolicyWithId[]> = {};

      for (const policy of response.items as PolicyData[]) {
        const updatePolicy = getPolicyDataForUpdate(policy);
        const policyConfig = updatePolicy.inputs[0].config.policy.value;

        if (isTelemetryEnabled !== policyConfig.global_telemetry_enabled) {
          this.logger.debug(
            `Endpoint policy [${policy.id}] needs update to global telemetry enabled setting (currently set to [${policyConfig.global_telemetry_enabled}])`
          );
          const policySpace = policy.spaceIds?.at(0) ?? DEFAULT_SPACE_ID;
          policyConfig.global_telemetry_enabled = isTelemetryEnabled;

          if (!updatesBySpace[policySpace]) {
            updatesBySpace[policySpace] = [];
          }

          updatesBySpace[policySpace].push({ ...updatePolicy, id: policy.id });
        }
      }

      for (const [spaceId, spaceUpdates] of Object.entries(updatesBySpace)) {
        this.logger.debug(`Updating [${spaceUpdates.length}] policies for space [${spaceId}]`);

        const soClientForSpace =
          this.endpointAppContextService.savedObjects.createInternalScopedSoClient({
            spaceId,
            readonly: false,
          });

        try {
          const updateResult = await pRetry(
            () => this.policyService.bulkUpdate(soClientForSpace, this.esClient, spaceUpdates),
            {
              onFailedAttempt: (error) =>
                this.logger.debug(
                  `Failed to bulk update package policies on ${
                    error.attemptNumber
                  }. attempt, reason: ${stringify(error)}`
                ),
              ...this.retryOptions,
            }
          );

          // Conflicts are expected on Serverless environments with multiple Kibana instances trying to do the same update, hence it's debug only.
          const failedPolicies = updateResult.failedPolicies.filter(
            (entry) => !('statusCode' in entry.error && entry.error.statusCode === 409)
          );
          if (failedPolicies.length) {
            this.logger.warn(
              `Cannot update telemetry flag in the following policies:\n${failedPolicies
                .map((entry) => `- id: ${entry.packagePolicy.id}, error: ${stringify(entry.error)}`)
                .join('\n')}`
            );
          }

          const conflictedPolicies = updateResult.failedPolicies.filter(
            (entry) => 'statusCode' in entry.error && entry.error.statusCode === 409
          );
          if (conflictedPolicies.length) {
            this.logger.debug(
              `Following policies are conflicted:\n${conflictedPolicies
                .map((entry) => `- id: ${entry.packagePolicy.id}, error: ${stringify(entry.error)}`)
                .join('\n')}`
            );
          }

          updated += updateResult.updatedPolicies?.length ?? 0;
          failed += failedPolicies.length;
          conflicts += conflictedPolicies.length;
        } catch (e) {
          this.logger.warn(
            `Unable to update telemetry config state to ${isTelemetryEnabled} in space [${spaceId}] for policies: ${spaceUpdates.map(
              (update) => update.id
            )}\n\n${stringify(e)}`
          );

          failed += spaceUpdates.length;
        }
      }

      page++;
    } while (response.page * response.perPage < response.total);

    if (updated > 0 || failed > 0) {
      this.logger.info(
        `Finished updating global_telemetry_enabled flag to ${isTelemetryEnabled} in Defend package policies: ${updated} succeeded, ${failed} failed, ${conflicts} conflicts.`
      );
    } else {
      this.logger.debug(
        `Done checking Endpoint policies due to changed global telemetry config setting. (New value: ${isTelemetryEnabled})`
      );
    }
  }
}
