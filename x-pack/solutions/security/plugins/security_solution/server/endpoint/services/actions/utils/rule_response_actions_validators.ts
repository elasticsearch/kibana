/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual, keyBy, pickBy, xorWith } from 'lodash';
import pMap from 'p-map';
import type { Logger } from '@kbn/core/server';
import type { SupportedHostOsType } from '../../../../../common/endpoint/constants';
import type { ScriptsLibraryClientInterface } from '../../scripts_library';
import type { BulkError } from '../../../../lib/detection_engine/routes/utils';
import type { EndpointAuthz } from '../../../../../common/endpoint/types/authz';
import type { RuleAlertType } from '../../../../lib/detection_engine/rule_schema';
import type {
  RuleResponse,
  EndpointResponseAction,
  KillProcessParams,
  OsqueryResponseAction,
  ProcessesParams,
  ResponseAction,
  RuleResponseAction,
  RuleResponseEndpointAction,
  RuleResponseOsqueryAction,
  RuleToImport,
  RunscriptParams,
} from '../../../../../common/api/detection_engine';
import type { EndpointAppContextService } from '../../../endpoint_app_context_services';
import { stringify } from '../../../utils/stringify';
import type { EnabledAutomatedResponseActionsCommands } from '../../../../../common/endpoint/service/response_actions/constants';
import {
  RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP,
  RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ,
} from '../../../../../common/endpoint/service/response_actions/constants';
import { CustomHttpRequestError } from '../../../../utils/custom_http_request_error';

type RuleResponseActions = Pick<RuleResponse, 'response_actions'>;

/**
 * Puts a response action into a single shape so that an unchanged action compares equal
 * regardless of which side it came from.
 *
 * Existing rules persist `actionTypeId` and — for osquery — camelCase params
 * (`savedQueryId`, `packId`, `ecsMapping`), while create/update payloads use snake_case
 * throughout. Without normalizing the params too, `isEqual` never matches an osquery
 * action, so every write re-validates it and a user who loses access to the referenced
 * saved query can no longer edit the rule at all — not even to remove the action.
 *
 * The casts are deliberate: this works structurally over the union of the persisted and
 * payload shapes, which no single member of `ResponseAction | RuleResponseAction` describes.
 */
const normalizeResponseActionForComparison = (
  responseAction: ResponseAction | RuleResponseAction
): ResponseAction => {
  const {
    actionTypeId,
    action_type_id: actionTypeIdSnake,
    params,
    ...rest
  } = responseAction as {
    actionTypeId?: string;
    action_type_id?: string;
    params?: Record<string, unknown>;
  };

  const normalized = {
    ...rest,
    action_type_id: actionTypeIdSnake ?? actionTypeId,
    ...(params == null ? {} : { params }),
  } as Record<string, unknown>;

  // Only osquery params differ in casing between the two sides. Endpoint params are stored
  // as-is, so rewriting them here would change what the per-command validations below see.
  if (params == null || !isOsqueryResponseAction(normalized as unknown as ResponseAction)) {
    return normalized as unknown as ResponseAction;
  }

  const {
    savedQueryId,
    saved_query_id: savedQueryIdSnake,
    packId,
    pack_id: packIdSnake,
    ecsMapping,
    ecs_mapping: ecsMappingSnake,
    ...restParams
  } = params;

  normalized.params = pickBy(
    {
      ...restParams,
      saved_query_id: savedQueryIdSnake ?? savedQueryId,
      pack_id: packIdSnake ?? packId,
      ecs_mapping: ecsMappingSnake ?? ecsMapping,
    },
    (value) => value !== undefined
  );

  return normalized as unknown as ResponseAction;
};

export type CheckOsqueryResponseActionAuthz = (actionParams: {
  saved_query_id?: string;
  pack_id?: string;
  /** Caller-supplied SQL; forwarded so attach-time authz matches what would be persisted. */
  query?: string;
  queries?: Array<{ query?: string }>;
  ecs_mapping?: Record<string, unknown>;
}) => Promise<void>;

export interface ValidateRuleResponseActionsOptions<
  T extends RuleResponseActions = RuleResponseActions
> {
  /**
   * Endpoint Authz can be retrieve via Route context or `endpointService.getEndpointAuthz(httpRequest)`
   */
  endpointAuthz: EndpointAuthz;
  endpointService: EndpointAppContextService;
  rulePayload: T;
  spaceId: string;
  /**
   * Updates to an existing rule **SHOULD ALWAYS** pass this value in so that validations
   * are only applied to the response actions that have changed
   */
  existingRule?: RuleAlertType | null;
  /**
   * Optional callback to validate osquery response action authorization.
   * Should be bound to the current request before passing in.
   * When provided, osquery response actions will be validated for privileges.
   */
  checkOsqueryResponseActionAuthz?: CheckOsqueryResponseActionAuthz;
}

/**
 * Used in Rule Management APIs to validate that users have Authz to Elastic Defend response actions that may
 * be included in rule definitions as well as validate that the response actions payload data is valid.
 */
export const validateRuleResponseActions = async <
  T extends RuleResponseActions = RuleResponseActions
>({
  endpointService,
  endpointAuthz,
  spaceId,
  rulePayload: { response_actions: ruleResponseActions },
  existingRule,
  checkOsqueryResponseActionAuthz,
}: ValidateRuleResponseActionsOptions<T>): Promise<void> => {
  const logger = endpointService.createLogger('validateRuleResponseActions');
  const existingRuleResponseActions = existingRule?.params?.responseActions;

  logger.debug(
    () =>
      `Validating rule response actions in space [${spaceId}]:\nrule payload: ${stringify(
        ruleResponseActions
      )}\nexisting rule response actions: ${stringify(existingRuleResponseActions)}\n`
  );

  if (
    (!ruleResponseActions || ruleResponseActions.length === 0) &&
    (!existingRuleResponseActions || existingRuleResponseActions.length === 0)
  ) {
    logger.debug(() => `Nothing to do - no response actions in payload or existing rule`);
    return;
  }

  // Existing rules store the action type ID and the osquery params in camelCase, while the rule
  // update/create payload uses snake_case, so both sides are normalized here and the comparison
  // focuses only on real changes.
  const normalizedPayloadActions = (ruleResponseActions ?? []).map(
    normalizeResponseActionForComparison
  );
  const responseActionsToValidate = xorWith<ResponseAction | RuleResponseAction>(
    normalizedPayloadActions,
    (existingRuleResponseActions ?? []).map(
      normalizeResponseActionForComparison
    ) as unknown as RuleResponseAction[],
    isEqual
  );

  if (responseActionsToValidate.length === 0) {
    logger.debug(() => `Nothing to do - no changes were made to response actions`);
    return;
  }

  logger.debug(
    () => `Response actions needing validation: ${stringify(responseActionsToValidate)}`
  );

  /** True when the action is present in the incoming payload, i.e. it is not being removed. */
  const isActionInPayload = (actionData: ResponseAction | RuleResponseAction): boolean =>
    normalizedPayloadActions.some((payloadAction) => isEqual(payloadAction, actionData));

  const isRunscriptAutomatedResponseActionEnabled =
    endpointService.experimentalFeatures.responseActionsEndpointAutomatedRunScript;
  const isKillProcessDescendantsEnabled =
    endpointService.experimentalFeatures.responseActionsEndpointKillProcessDescendants;

  for (const actionData of responseActionsToValidate) {
    if (isEndpointResponseAction(actionData) && actionData.params.command) {
      validateEndpointResponseActionAuthz(endpointAuthz, actionData.params.command);

      // Individual response action payload validations
      switch (actionData.params.command) {
        case 'kill-process':
        case 'suspend-process':
          validateEndpointKillSuspendProcessResponseAction(
            actionData.params,
            isKillProcessDescendantsEnabled
          );
          break;

        case 'runscript':
          if (!isRunscriptAutomatedResponseActionEnabled) {
            throw new CustomHttpRequestError(
              `Endpoint runscript automated response action is not enabled`,
              400
            );
          }

          // validate runscript response action if it is defined in the rule update payload,
          // OR:
          // if the script IDs are being used in the rule update payload.
          //
          // Why:
          // there is no need to validate a script (aside from Authz above) if it is being removed
          // from the rule via the update. This will ensure that users can remove the use of a
          // script if that script is ever updated in a way that would cause it to fail validation -
          // example: the script is updated to require input arguments. User should not be forced to
          // first update the rule to ensure the existing entry is valid if all they want to do is
          // remove the use of the script from the rule.
          if (
            // Compared by value: `responseActionsToValidate` holds normalized copies, so a
            // reference check against the raw payload would never match.
            isActionInPayload(actionData) ||
            isScriptIdReferencedInRunscriptResponseActions(
              ruleResponseActions ?? [],
              getScriptIdsFromRunscriptConfig(actionData.params.config)
            )
          ) {
            await validateEndpointRunscriptResponseAction(
              endpointService.getScriptsLibraryClient(spaceId, 'elastic'),
              logger,
              actionData.params
            );
          } else {
            logger.debug(
              () =>
                `Skipping validation of runscript response action - script IDs [${getScriptIdsFromRunscriptConfig(
                  (actionData.params as RunscriptParams).config ?? {}
                ).join(', ')}] not in rulePayload`
            );
          }
          break;
      }
    } else if (isOsqueryResponseAction(actionData)) {
      // Mirrors the `runscript` carve-out above: an action that appears only on the existing
      // rule is being *removed*, and there is nothing to authorize. Without this, a saved query
      // that is later deleted or moved out of the space would pin the action in place forever,
      // because the user could neither keep it (403) nor take it off the rule.
      if (!isActionInPayload(actionData)) {
        logger.debug(
          () =>
            `Skipping validation of osquery response action - not present in rule payload (being removed): ${stringify(
              actionData
            )}`
        );
      } else if (checkOsqueryResponseActionAuthz) {
        const params = actionData.params;
        // API payload is snake_case; existing rules in ES are camelCase.
        await checkOsqueryResponseActionAuthz({
          saved_query_id:
            ('saved_query_id' in params ? params.saved_query_id : undefined) ??
            ('savedQueryId' in params ? params.savedQueryId : undefined),
          pack_id:
            ('pack_id' in params ? params.pack_id : undefined) ??
            ('packId' in params ? params.packId : undefined),
          query: 'query' in params ? params.query : undefined,
          queries: 'queries' in params ? params.queries : undefined,
          ecs_mapping:
            ('ecs_mapping' in params ? params.ecs_mapping : undefined) ??
            ('ecsMapping' in params ? params.ecsMapping : undefined),
        });
      } else {
        logger.warn(
          `Skipping osquery response action validation - no osquery authz checker provided: ${stringify(
            actionData
          )}`
        );
      }
    } else {
      logger.debug(
        () =>
          `Skipping validation of response action - unknown action type: ${stringify(actionData)}`
      );
    }
  }

  logger.debug(() => `All response actions validated successfully`);
};

type ImportRuleResponseActions = Pick<RuleToImport, 'response_actions' | 'id' | 'rule_id'>;

export type ValidateRuleImportResponseActionsOptions<
  T extends ImportRuleResponseActions = ImportRuleResponseActions
> = Pick<
  ValidateRuleResponseActionsOptions,
  'endpointAuthz' | 'endpointService' | 'spaceId' | 'checkOsqueryResponseActionAuthz'
> & {
  rulesToImport: T[];
};

export interface ValidateRuleImportResponseActionsResult<
  T extends ImportRuleResponseActions = ImportRuleResponseActions
> {
  valid: T[];
  errors: BulkError[];
}

/**
 * Used from Rule Import API to validate that response actions in the rules to be imported are valid
 *
 * @param endpointService
 * @param endpointAuthz
 * @param spaceId
 * @param ruleResponseActions
 */
export const validateRuleImportResponseActions = async <
  T extends ImportRuleResponseActions = ImportRuleResponseActions
>({
  endpointService,
  endpointAuthz,
  spaceId,
  rulesToImport,
  checkOsqueryResponseActionAuthz,
}: ValidateRuleImportResponseActionsOptions<T>): Promise<
  ValidateRuleImportResponseActionsResult<T>
> => {
  const logger = endpointService.createLogger('validateRuleImportResponseActions');
  const response: ValidateRuleImportResponseActionsResult<T> = { valid: [], errors: [] };

  logger.debug(() => `Validating response actions for import of [${rulesToImport.length}] rules`);

  await pMap(
    rulesToImport,
    async (rule) => {
      try {
        await validateRuleResponseActions({
          endpointAuthz,
          endpointService,
          spaceId,
          rulePayload: rule,
          checkOsqueryResponseActionAuthz,
        });

        response.valid.push(rule);
      } catch (error) {
        response.errors.push({
          id: rule.id ?? '',
          rule_id: rule.rule_id ?? '',
          error: { message: error.message, status_code: error.statusCode },
        });
      }
    },
    { concurrency: 20 }
  );

  logger.debug(
    () =>
      `Validation done: valid rules [${response.valid.length}], errors [${response.errors.length}]`
  );

  return response;
};

/** @private */
const validateEndpointResponseActionAuthz = (
  endpointAuthz: EndpointAuthz,
  command: EnabledAutomatedResponseActionsCommands
) => {
  const authzPropName =
    RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ[
      RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[command]
    ];

  if (!endpointAuthz[authzPropName]) {
    throw new CustomHttpRequestError(
      `User is not authorized to create/update ${command} response action`,
      403
    );
  }
};

/**
 * Type guard that checks if the response action is an EDR response action
 * @param ruleResponseAction
 *
 * @private
 */
const isEndpointResponseAction = (
  ruleResponseAction:
    | RuleResponseOsqueryAction
    | RuleResponseEndpointAction
    | OsqueryResponseAction
    | EndpointResponseAction
): ruleResponseAction is EndpointResponseAction | RuleResponseEndpointAction => {
  return (
    ('action_type_id' in ruleResponseAction && ruleResponseAction.action_type_id === '.endpoint') ||
    ('actionTypeId' in ruleResponseAction && ruleResponseAction.actionTypeId === '.endpoint')
  );
};

/** @private */
const isOsqueryResponseAction = (
  ruleResponseAction:
    | RuleResponseOsqueryAction
    | RuleResponseEndpointAction
    | OsqueryResponseAction
    | EndpointResponseAction
): ruleResponseAction is OsqueryResponseAction | RuleResponseOsqueryAction => {
  return (
    ('action_type_id' in ruleResponseAction && ruleResponseAction.action_type_id === '.osquery') ||
    ('actionTypeId' in ruleResponseAction && ruleResponseAction.actionTypeId === '.osquery')
  );
};

/** @private */
const validateEndpointKillSuspendProcessResponseAction = (
  { config, command }: ProcessesParams,
  isKillProcessDescendantsEnabled: boolean
) => {
  if (config.overwrite && config.field) {
    throw new CustomHttpRequestError(
      `Invalid [${command}] response action configuration: 'field' is not allowed when 'overwrite' is 'true'`,
      400
    );
  }

  if (!config.overwrite && !(config.field ?? '').trim()) {
    throw new CustomHttpRequestError(
      `Invalid [${command}] response action configuration: 'field' is required when 'overwrite' is 'false'`,
      400
    );
  }

  if (isKillProcessDescendantsEnabled && command === 'kill-process') {
    const { kill_descendants: killDescendants } = config as KillProcessParams['config'];

    if (killDescendants !== undefined && typeof killDescendants !== 'boolean') {
      throw new CustomHttpRequestError(
        `Invalid [${command}] response action configuration: 'kill_descendants' must be a boolean`,
        400
      );
    }
  }
};

const getScriptIdsFromRunscriptConfig = (config: RunscriptParams['config']): string[] => {
  return Object.values(config ?? {}).reduce((acc, osConfig) => {
    if (osConfig.scriptId && !acc.includes(osConfig.scriptId)) {
      acc.push(osConfig.scriptId);
    }

    return acc;
  }, [] as string[]);
};

/** @private */
const validateEndpointRunscriptResponseAction = async (
  scriptsClient: ScriptsLibraryClientInterface,
  logger: Logger,
  { config }: RunscriptParams
): Promise<void> => {
  if (!config) {
    throw new CustomHttpRequestError(
      `Invalid [runscript] response action configuration: 'config' is required`,
      400
    );
  }

  const scriptIds = getScriptIdsFromRunscriptConfig(config);

  if (scriptIds.length === 0) {
    throw new CustomHttpRequestError(
      `Invalid [runscript] response action configuration: no scripts specified`,
      400
    );
  }

  const scripts = await scriptsClient.list({
    kuery: `id:(${scriptIds.map((id) => `"${id}"`).join(' OR ')})`,
  });

  logger.debug(
    () => `Found ${scripts.total} scripts for runscript response action:\n ${stringify(scripts)}`
  );

  const scriptById = keyBy(scripts.data, 'id');

  for (const [osType, osRunscriptConfig] of Object.entries(config)) {
    if (osRunscriptConfig.scriptId) {
      const script = scriptById[osRunscriptConfig.scriptId];

      if (!script) {
        throw new CustomHttpRequestError(
          `Invalid [${osType}] [runscript] response action configuration: script [${osRunscriptConfig.scriptId}] not found`,
          400
        );
      }

      if (!script.platform.includes(osType as SupportedHostOsType)) {
        throw new CustomHttpRequestError(
          `Invalid [${osType}] [runscript] response action configuration: script [${script.id}, ${script.name}] is not compatible with host OS '${osType}']`
        );
      }

      if (
        script.requiresInput &&
        (!osRunscriptConfig.scriptInput || osRunscriptConfig.scriptInput.trim() === '')
      ) {
        throw new CustomHttpRequestError(
          `Invalid [${osType}] [runscript] response action configuration: script [${script.id}, ${script.name}] requires input but no input was provided`,
          400
        );
      }
    }
  }
};
const isScriptIdReferencedInRunscriptResponseActions = (
  /** Rule actions that would be provided for a create/update type of operation */
  ruleActions: ResponseAction[],
  scriptId: string | string[]
): boolean => {
  const scriptIdList = Array.isArray(scriptId) ? scriptId : [scriptId];

  return ruleActions.some((action) => {
    return (
      action.action_type_id === '.endpoint' &&
      action.params.command === 'runscript' &&
      action.params.config &&
      Object.values(action.params.config).some((osConfig) =>
        scriptIdList.includes(osConfig.scriptId ?? '')
      )
    );
  });
};
