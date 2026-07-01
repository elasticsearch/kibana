/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isBoom } from '@hapi/boom';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { EsqlRuleParams } from '../../../../significant_events/rules/esql/types';
import {
  STREAMS_RULE_CONSUMER,
  STREAMS_ESQL_RULE_TYPE_ID,
  type CreateRuleBody,
  type IRulesManagementClient,
  type UpdateRuleBody,
} from './rules_management_client';

/**
 * Wraps the v1 RulesClient to implement IRulesManagementClient.
 * This is the default (flag OFF) path.
 *
 * 409 on create → update in place (idempotent create).
 * 404 on update → create instead (idempotent update).
 * 400 on bulk delete → swallowed (rules may not have existed yet).
 */
export class RulesAdapterV1 implements IRulesManagementClient {
  constructor(private readonly rulesClient: RulesClient) {}

  async createRule(id: string, body: CreateRuleBody): Promise<void> {
    await this.rulesClient
      .create<EsqlRuleParams>({ data: body, options: { id } })
      .catch((error) => {
        if (isBoom(error) && error.output.statusCode === 409) {
          return this.rulesClient.update<EsqlRuleParams>({ id, data: body });
        }
        throw error;
      });
  }

  async updateRule(id: string, body: UpdateRuleBody): Promise<void> {
    await this.rulesClient.update<EsqlRuleParams>({ id, data: body }).catch((error) => {
      if (isBoom(error) && error.output.statusCode === 404) {
        // Rule missing — recreate. `enabled: true` is intentional: this path is only
        // reached from installQueries for queries the system determined should be active.
        return this.rulesClient.create<EsqlRuleParams>({
          data: {
            name: body.name,
            consumer: STREAMS_RULE_CONSUMER,
            alertTypeId: STREAMS_ESQL_RULE_TYPE_ID,
            actions: body.actions,
            params: body.params,
            enabled: true,
            tags: body.tags,
            schedule: body.schedule,
          },
          options: { id },
        });
      }
      throw error;
    });
  }

  async bulkDeleteRules(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.rulesClient
      .bulkDeleteRules({ ids, ignoreInternalRuleTypes: false })
      .catch((error) => {
        if (isBoom(error) && error.output.statusCode === 400) {
          return;
        }
        throw error;
      });
  }
}
