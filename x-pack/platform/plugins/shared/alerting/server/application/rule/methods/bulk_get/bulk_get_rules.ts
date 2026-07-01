/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import pMap from 'p-map';
import { chunk } from 'lodash';
import type { SavedObject } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import type { RulesClientContext } from '../../../../rules_client/types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { BulkGetRulesParams } from './types';
import { bulkGetRulesParamsSchema } from './schemas';
import type { RawRule } from '../../../../types';
import type { RuleParams } from '../../types';
import { bulkGetRulesSo } from '../../../../data/rule';
import { transformRuleSoToSanitizedRule } from '../../transforms';
import type { BulkGetRulesResponse } from './types/bulk_get_rules_response';
import { convertRuleIdsToKueryNode } from '../../../../lib';
import {
  getAuthorizationFilter,
  checkAuthorizationAndGetTotal,
} from '../../../../rules_client/lib';

export async function bulkGetRules<Params extends RuleParams = never>(
  context: RulesClientContext,
  params: BulkGetRulesParams
): Promise<BulkGetRulesResponse<Params>> {
  try {
    bulkGetRulesParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Error validating get rules params - ${error.message}`);
  }

  const kueryNodeFilter = convertRuleIdsToKueryNode(params.ids);
  const authorizationFilter = await getAuthorizationFilter(context, { action: 'GET' });

  const kueryNodeFilterWithAuth =
    authorizationFilter && kueryNodeFilter
      ? nodeBuilder.and([kueryNodeFilter, authorizationFilter as KueryNode])
      : kueryNodeFilter;

  await checkAuthorizationAndGetTotal(context, {
    filter: kueryNodeFilterWithAuth,
    action: 'GET',
  });

  const result: BulkGetRulesResponse<Params> = {
    rules: [],
    errors: [],
  };

  const savedObjects: Array<SavedObject<RawRule>> = [];

  await pMap(
    chunk(params.ids, 100),
    async (ids) => {
      const { saved_objects } = await bulkGetRulesSo({
        savedObjectsClient: context.unsecuredSavedObjectsClient,
        ids,
      });
      saved_objects.forEach((so) => {
        if (isSavedObjectErrorResult(so)) {
          result.errors.push({ id: so.id, error: so.error });
          return;
        }
        savedObjects.push(so);
      });
    },
    {
      concurrency: 10,
    }
  );

  savedObjects.forEach((rule) => {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.GET,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: rule.attributes.name },
      })
    );
  });

  result.errors.forEach(({ error, id }) => {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.GET,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id },
        error: new Error(error.message),
      })
    );
  });

  const transformedRules = await pMap(
    savedObjects,
    (rule) => transformRuleSoToSanitizedRule<Params>(context, rule),
    { concurrency: 10 }
  );
  result.rules.push(...transformedRules);
  return result;
}
