/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Semver from 'semver';
import Boom from '@hapi/boom';
import type { SavedObject } from '@kbn/core/server';
import { SavedObjectsUtils } from '@kbn/core/server';
import { withSpan } from '@kbn/apm-utils';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { validateAndAuthorizeSystemActions } from '../../../../lib/validate_authorize_system_actions';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { parseDuration, getRuleCircuitBreakerErrorMessage } from '../../../../../common';
import { WriteOperations, AlertingAuthorizationEntity } from '../../../../authorization';
import {
  validateRuleTypeParams,
  getRuleNotifyWhenType,
  getDefaultMonitoringRuleDomainProperties,
} from '../../../../lib';
import { getRuleExecutionStatusPending } from '../../../../lib/rule_execution_status';
import {
  extractReferences,
  validateActions,
  addGeneratedActionValues,
} from '../../../../rules_client/lib';
import {
  generateAPIKeyName,
  apiKeyAsRuleDomainProperties,
  addMissingUiamKeyTagIfNeeded,
  resolveRuleAPIKey,
} from '../../../../rules_client/common';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleDomain, RuleParams } from '../../types';
import type { RawRule, SanitizedRule } from '../../../../types';
import {
  transformRuleAttributesToRuleDomain,
  transformRuleDomainToRuleAttributes,
  transformRuleDomainToRule,
} from '../../transforms';
import { ruleDomainSchema } from '../../schemas';
import type { CreateRuleData } from './types';
import { createRuleDataSchema } from './schemas';
import { createRuleSavedObject } from '../../../../rules_client/lib';
import type { ValidateScheduleLimitResult } from '../get_schedule_frequency';
import { validateScheduleLimit } from '../get_schedule_frequency';
import { logRuleChanges } from '../common_utils/log_rule_changes';

export interface CreateRuleOptions {
  id?: string;
}

export interface CreateRuleParams<Params extends RuleParams = never> {
  data: CreateRuleData<Params>;
  options?: CreateRuleOptions;
  changeTracking?: RuleChangeTracking;
  allowMissingConnectorSecrets?: boolean;
}

export async function createRule<Params extends RuleParams = never>(
  context: RulesClientContext,
  createParams: CreateRuleParams<Params>
  // TODO (http-versioning): This should be of type Rule, change this when all rule types are fixed
): Promise<SanitizedRule<Params>> {
  const { data: initialData, options, changeTracking, allowMissingConnectorSecrets } = createParams;

  const actionsClient = await context.getActionsClient();

  const { actions: genAction, systemActions: genSystemActions } = await addGeneratedActionValues(
    initialData.actions,
    initialData.systemActions,
    context
  );

  const data = {
    ...initialData,
    actions: genAction,
    systemActions: genSystemActions,
  };

  const id = options?.id || SavedObjectsUtils.generateId();

  try {
    createRuleDataSchema.validate(data);
  } catch (error) {
    throw Boom.badRequest(`Error validating create data - ${error.message}`);
  }

  /**
   * ruleTypeRegistry.get will throw a 400 (Bad request)
   * error if the rule type is not registered.
   */
  context.ruleTypeRegistry.get(data.alertTypeId);

  let validationPayload: ValidateScheduleLimitResult = null;
  if (data.enabled) {
    validationPayload = await validateScheduleLimit({
      context,
      updatedInterval: data.schedule.interval,
    });
  }

  if (validationPayload) {
    throw Boom.badRequest(
      getRuleCircuitBreakerErrorMessage({
        name: data.name,
        interval: validationPayload!.interval,
        intervalAvailable: validationPayload!.intervalAvailable,
        action: 'create',
      })
    );
  }

  try {
    await withSpan({ name: 'authorization.ensureAuthorized', type: 'rules' }, async () =>
      context.authorization.ensureAuthorized({
        ruleTypeId: data.alertTypeId,
        consumer: data.consumer,
        operation: WriteOperations.Create,
        entity: AlertingAuthorizationEntity.Rule,
      })
    );
  } catch (error) {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.CREATE,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: data.name },
        error,
      })
    );
    throw error;
  }

  context.ruleTypeRegistry.ensureRuleTypeEnabled(data.alertTypeId);

  // Throws an error if rule type isn't registered
  const ruleType = context.ruleTypeRegistry.get(data.alertTypeId);

  const validatedRuleTypeParams = validateRuleTypeParams(data.params, ruleType.validate.params);
  const username = await context.getUserName();

  let createdAPIKey = null;
  let isAuthTypeApiKey = false;
  try {
    const apiKeyName = generateAPIKeyName(ruleType.id, data.name);
    const resolved = await resolveRuleAPIKey(context, apiKeyName, data.enabled);
    createdAPIKey = resolved.createdAPIKey;
    isAuthTypeApiKey = resolved.isAuthTypeApiKey;
  } catch (error) {
    throw Boom.badRequest(`Error creating rule: could not create API key - ${error.message}`);
  }

  await withSpan({ name: 'validateActions', type: 'rules' }, () =>
    validateActions(context, ruleType, data, allowMissingConnectorSecrets)
  );

  await withSpan({ name: 'validateAndAuthorizeSystemActions', type: 'rules' }, () =>
    validateAndAuthorizeSystemActions({
      actionsClient,
      actionsAuthorization: context.actionsAuthorization,
      connectorAdapterRegistry: context.connectorAdapterRegistry,
      systemActions: data.systemActions,
      rule: { consumer: data.consumer, producer: ruleType.producer },
    })
  );

  // Throw error if schedule interval is less than the minimum and we are enforcing it
  const intervalInMs = parseDuration(data.schedule.interval);
  if (
    intervalInMs < context.minimumScheduleIntervalInMs &&
    context.minimumScheduleInterval.enforce
  ) {
    throw Boom.badRequest(
      `Error creating rule: the interval is less than the allowed minimum interval of ${context.minimumScheduleInterval.value}`
    );
  }

  const allActions = [...data.actions, ...(data.systemActions ?? [])];
  const artifacts = data.artifacts ?? {};
  // Extract saved object references for this rule
  const {
    references,
    params: updatedParams,
    actions: actionsWithRefs,
    artifacts: artifactsWithRefs,
  } = await withSpan({ name: 'extractReferences', type: 'rules' }, () =>
    extractReferences(context, ruleType, allActions, validatedRuleTypeParams, artifacts)
  );

  const createTime = Date.now();
  const lastRunTimestamp = new Date();
  const legacyId = Semver.lt(context.kibanaVersion, '8.0.0') ? id : null;
  const notifyWhen = getRuleNotifyWhenType(data.notifyWhen ?? null, data.throttle ?? null);
  const throttle = data.throttle ?? null;

  const { systemActions, actions: actionToNotUse, ...restData } = data;

  const apiKeyProps = apiKeyAsRuleDomainProperties(createdAPIKey, username, isAuthTypeApiKey);
  const tagsWithUiamCheck = await addMissingUiamKeyTagIfNeeded(
    data.tags,
    apiKeyProps.uiamApiKey,
    apiKeyProps.apiKeyCreatedByUser,
    context.isServerless,
    context.featureFlags
  );

  // Convert domain rule object to ES rule attributes
  const ruleAttributes = transformRuleDomainToRuleAttributes({
    actionsWithRefs,
    artifactsWithRefs,
    rule: {
      ...restData,
      tags: tagsWithUiamCheck,
      // TODO (http-versioning) create a rule domain version of this function
      // Right now this works because the 2 types can interop but it's not ideal
      ...apiKeyProps,
      id,
      createdBy: username,
      updatedBy: username,
      createdAt: new Date(createTime),
      updatedAt: new Date(createTime),
      snoozeSchedule: [],
      muteAll: false,
      mutedInstanceIds: [],
      notifyWhen,
      throttle,
      executionStatus: getRuleExecutionStatusPending(lastRunTimestamp.toISOString()),
      monitoring: getDefaultMonitoringRuleDomainProperties(lastRunTimestamp.toISOString()),
      revision: 0,
      running: false,
    },
    params: {
      legacyId,
      paramsWithRefs: updatedParams,
    },
  });

  if (data.enabled) {
    ruleAttributes.lastEnabledAt = new Date(createTime).toISOString();
  }

  const createdRuleSavedObject: SavedObject<RawRule> = await withSpan(
    { name: 'createRuleSavedObject', type: 'rules' },
    () =>
      createRuleSavedObject(context, {
        intervalInMs,
        rawRule: ruleAttributes,
        references,
        ruleId: id,
        options,
        returnRuleAttributes: true,
      })
  );

  await logRuleChanges({
    ruleSOs: [createdRuleSavedObject],
    encryptedFieldsMap: new Map([
      [id, { apiKey: ruleAttributes.apiKey, uiamApiKey: ruleAttributes.uiamApiKey ?? null }],
    ]),
    rulesClientContext: context,
    changesContext: {
      action: changeTracking?.action ?? RuleChangeTrackingAction.ruleCreate,
      timestamp: createTime,
      metadata: changeTracking?.metadata,
    },
  });

  // Convert ES RawRule back to domain rule object
  const ruleDomain: RuleDomain<Params> = transformRuleAttributesToRuleDomain<Params>(
    createdRuleSavedObject.attributes,
    {
      id: createdRuleSavedObject.id,
      logger: context.logger,
      ruleType: context.ruleTypeRegistry.get(createdRuleSavedObject.attributes.alertTypeId),
      references: createdRuleSavedObject.references,
    },
    (connectorId: string) => actionsClient.isSystemAction(connectorId)
  );

  // Try to validate created rule, but don't throw.
  try {
    ruleDomainSchema.validate(ruleDomain);
  } catch (e) {
    context.logger.warn(`Error validating created rule domain object for id: ${id}, ${e}`);
  }

  // Convert domain rule to rule (Remove certain properties)
  const rule = transformRuleDomainToRule<Params>(ruleDomain);

  // TODO (http-versioning): Remove this cast, this enables us to move forward
  // without fixing all of other solution types
  return rule as SanitizedRule<Params>;
}
