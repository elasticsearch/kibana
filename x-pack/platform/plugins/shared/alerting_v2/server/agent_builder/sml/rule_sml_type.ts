/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlTypeDefinition } from '@kbn/agent-builder-sml-plugin/server';
import { getSmlOriginId, kibanaPermissions } from '@kbn/agent-builder-sml-plugin/server';
import {
  RULE_ATTACHMENT_TYPE,
  ruleAttachmentDataSchema,
  getBreachEsqlQuery,
} from '@kbn/alerting-v2-schemas';
import { RULE_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type { KibanaRequest } from '@kbn/core-http-server';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import type { RuleSavedObjectAttributes } from '../../saved_objects';
import type { RulesClient } from '../../lib/rules_client';

interface CreateRuleSmlTypeOptions {
  getScopedRulesClient: (request: KibanaRequest) => RulesClient;
  getIsAlertingV2Enabled: () => Promise<boolean>;
}

export const createRuleSmlType = ({
  getScopedRulesClient,
  getIsAlertingV2Enabled,
}: CreateRuleSmlTypeOptions): SmlTypeDefinition => ({
  id: RULE_KI_TYPE,
  fetchFrequency: () => '1m',

  async *list(context) {
    if (!(await getIsAlertingV2Enabled())) {
      return;
    }

    const finder = context.savedObjectsClient.createPointInTimeFinder<RuleSavedObjectAttributes>({
      type: RULE_SAVED_OBJECT_TYPE,
      perPage: 1000,
      namespaces: ['*'],
      fields: [],
    });

    try {
      for await (const response of finder.find()) {
        yield response.saved_objects.map((so) => ({
          id: so.id,
          updatedAt: so.updated_at ?? new Date().toISOString(),
          spaces: so.namespaces ?? ['default'],
        }));
      }
    } finally {
      await finder.close();
    }
  },

  getSmlEntry: async (originId, context) => {
    if (!(await getIsAlertingV2Enabled())) {
      return undefined;
    }

    try {
      const so = await context.savedObjectsClient.get<RuleSavedObjectAttributes>(
        RULE_SAVED_OBJECT_TYPE,
        originId
      );
      const attrs = so.attributes;
      const name = attrs?.metadata?.name ?? originId;
      const description = attrs?.metadata?.description ?? '';
      const tags = attrs?.metadata?.tags?.join(', ') ?? '';
      const kind = attrs?.kind ?? '';
      const query = attrs?.query ? getBreachEsqlQuery(attrs.query) : '';

      const contentParts = [name, description, kind, tags, query].filter(Boolean);

      return {
        type: RULE_KI_TYPE,
        title: name,
        content: contentParts.join('\n'),
      };
    } catch (error) {
      context.logger.warn(
        `SML rule: failed to get data for '${originId}': ${(error as Error).message}`
      );
      return undefined;
    }
  },

  requiredHiddenTypes: [RULE_SAVED_OBJECT_TYPE],

  /**
   * Rules are gated by the dedicated `ai_index:alerting_v2_rule/read` action.
   * The Alerting v2 feature grants it by declaring `aiIndex: { read: [RULE_KI_TYPE] }`
   * (see `common/feature_privileges.ts`), so the `kiType` here must stay in step
   * with that declaration.
   */
  getPermissions: () => kibanaPermissions({ kiType: RULE_KI_TYPE }),

  toAttachment: async (item, context) => {
    if (!(await getIsAlertingV2Enabled())) {
      return undefined;
    }

    try {
      const rulesClient = getScopedRulesClient(context.request);
      const rule = await rulesClient.getRule({ id: getSmlOriginId(item) });
      return {
        type: RULE_ATTACHMENT_TYPE,
        data: ruleAttachmentDataSchema.parse(rule),
      };
    } catch {
      return undefined;
    }
  },
});
