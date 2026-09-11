/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlTypeDefinition } from '@kbn/agent-builder-sml-plugin/server';
import { getSmlOriginId, kibanaPermissions } from '@kbn/agent-builder-sml-plugin/server';
import {
  ACTION_POLICY_ATTACHMENT_TYPE,
  actionPolicyAttachmentDataSchema,
} from '@kbn/alerting-v2-schemas';
import { ACTION_POLICY_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type { KibanaRequest } from '@kbn/core-http-server';
import { ACTION_POLICY_SAVED_OBJECT_TYPE } from '../../saved_objects';
import type { ActionPolicySavedObjectAttributes } from '../../saved_objects';
import type { ActionPolicyClient } from '../../lib/action_policy_client';

interface CreateActionPolicySmlTypeOptions {
  getScopedActionPolicyClient: (request: KibanaRequest) => ActionPolicyClient;
  /**
   * Resolves the `alerting:v2:enabled` global advanced setting. When the engine
   * is disabled, the SML hooks below become no-ops: `list` yields nothing (so
   * the crawler's mark-and-sweep removes any previously indexed policy chunks),
   * and `getSmlEntry` / `toAttachment` return `undefined`. This gates action
   * policy data out of the context layer dynamically, without a restart.
   */
  getIsAlertingV2Enabled: () => Promise<boolean>;
}

export const createActionPolicySmlType = ({
  getScopedActionPolicyClient,
  getIsAlertingV2Enabled,
}: CreateActionPolicySmlTypeOptions): SmlTypeDefinition => ({
  id: ACTION_POLICY_KI_TYPE,
  fetchFrequency: () => '1m',

  async *list(context) {
    if (!(await getIsAlertingV2Enabled())) {
      return;
    }

    const finder =
      context.savedObjectsClient.createPointInTimeFinder<ActionPolicySavedObjectAttributes>({
        type: ACTION_POLICY_SAVED_OBJECT_TYPE,
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
      const so = await context.savedObjectsClient.get<ActionPolicySavedObjectAttributes>(
        ACTION_POLICY_SAVED_OBJECT_TYPE,
        originId
      );
      const attrs = so.attributes;
      const name = attrs?.name ?? originId;
      const description = attrs?.description ?? '';
      const tags = attrs?.tags?.join(', ') ?? '';
      const matcher = attrs?.matcher ?? '';
      const groupingMode = attrs?.groupingMode ?? '';
      const destinations = attrs?.destinations?.map((d) => `${d.type}:${d.id}`).join(', ') ?? '';

      const contentParts = [name, description, matcher, groupingMode, destinations, tags].filter(
        Boolean
      );

      return {
        type: ACTION_POLICY_KI_TYPE,
        title: name,
        content: contentParts.join('\n'),
      };
    } catch (error) {
      context.logger.warn(
        `SML action policy: failed to get data for '${originId}': ${(error as Error).message}`
      );
      return undefined;
    }
  },

  requiredHiddenTypes: [ACTION_POLICY_SAVED_OBJECT_TYPE],

  /**
   * Action policies are gated by the dedicated `ai_index:alerting_v2_action_policy/read` action.
   * The Alerting v2 feature grants it by declaring `aiIndex: { read: [ACTION_POLICY_KI_TYPE] }`
   * (see `common/feature_privileges.ts`), so the `kiType` here must stay in step with that
   * declaration.
   */
  getPermissions: () => kibanaPermissions({ kiType: ACTION_POLICY_KI_TYPE }),

  toAttachment: async (item, context) => {
    if (!(await getIsAlertingV2Enabled())) {
      return undefined;
    }

    try {
      const client = getScopedActionPolicyClient(context.request);
      const policy = await client.getActionPolicy({ id: getSmlOriginId(item) });
      return {
        type: ACTION_POLICY_ATTACHMENT_TYPE,
        data: actionPolicyAttachmentDataSchema.parse(policy),
      };
    } catch {
      return undefined;
    }
  },
});
