/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { KueryNode } from '@kbn/es-query';
import { AlertingAuthorizationEntity, ReadOperations } from '../../../../authorization';
import type { RulesClientContext } from '../../../../rules_client/types';
import { searchRuleTemplatesSo } from '../../../../data/rule_template';
import { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { FindRuleTemplatesParams } from './types';
import { findRuleTemplatesParamsSchema } from './schema';
import { transformRawRuleTemplateToRuleTemplate } from '../../transforms/transform_raw_rule_template_to_rule_template';
import type { RuleTemplate } from '../../types';
import {
  buildRuleTypeIdsFilter,
  buildTagsFilter,
  buildTemplateSearchQuery,
  combineFilters,
  combineFilterWithAuthorizationFilter,
} from '../../../../rules_client/common/filters';
import { mapSortField } from '../../../../rules_client/common';
import { AlertingAuthorizationFilterType } from '../../../../authorization/alerting_authorization_kuery';
import {
  RuleTemplateAuditAction,
  ruleTemplateAuditEvent,
} from '../../../../rules_client/common/audit_events';

export interface FindResult {
  page: number;
  perPage: number;
  total: number;
  data: Array<RuleTemplate>;
}

export async function findRuleTemplates(
  context: RulesClientContext,
  params: FindRuleTemplatesParams
): Promise<FindResult> {
  try {
    findRuleTemplatesParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Error validating find template data - ${error.message}`);
  }

  const { filter: authorizationFilter, ensureRuleTypeIsAuthorized } =
    await context.authorization.getByRuleTypeAuthorizationFilter({
      authorizationEntity: AlertingAuthorizationEntity.Rule,
      filterOpts: {
        type: AlertingAuthorizationFilterType.KQL,
        fieldNames: {
          ruleTypeId: `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.attributes.ruleTypeId`,
        },
      },
      operation: ReadOperations.Find,
    });

  const { ruleTypeId, tags, perPage, page, search, sortField, sortOrder } = params;

  const ruleTypeFilter = ruleTypeId
    ? buildRuleTypeIdsFilter([ruleTypeId], RULE_TEMPLATE_SAVED_OBJECT_TYPE)
    : undefined;
  const tagsFilter = tags ? buildTagsFilter(tags, RULE_TEMPLATE_SAVED_OBJECT_TYPE) : undefined;
  const combinedFilters = combineFilters([ruleTypeFilter, tagsFilter], 'and');

  const finalFilter = authorizationFilter
    ? combineFilterWithAuthorizationFilter(combinedFilters, authorizationFilter as KueryNode)
    : combinedFilters;

  const {
    page: resultPage,
    per_page: resultPerPage,
    total,
    saved_objects: data,
  } = await searchRuleTemplatesSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    namespaces: [context.spaceId || 'default'],
    page,
    perPage,
    sortField: mapSortField(sortField),
    sortOrder,
    filter: finalFilter,
    searchQuery: buildTemplateSearchQuery(search),
  });

  const authorizedData = data.map((so) => {
    try {
      ensureRuleTypeIsAuthorized(so.attributes.ruleTypeId, AlertingAuthorizationEntity.Rule);
    } catch (error) {
      context.auditLogger?.log(
        ruleTemplateAuditEvent({
          action: RuleTemplateAuditAction.FIND,
          savedObject: {
            type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
            id: so.id,
            name: so.attributes.name,
          },
          error,
        })
      );
      throw error;
    }
    return so;
  });

  const transformedData = authorizedData.map((so) =>
    transformRawRuleTemplateToRuleTemplate({
      id: so.id,
      attributes: so.attributes,
    })
  );

  transformedData.forEach(({ id, name }) =>
    context.auditLogger?.log(
      ruleTemplateAuditEvent({
        action: RuleTemplateAuditAction.FIND,
        savedObject: { type: RULE_TEMPLATE_SAVED_OBJECT_TYPE, id, name },
      })
    )
  );

  return {
    page: resultPage,
    perPage: resultPerPage,
    total,
    data: transformedData,
  };
}
