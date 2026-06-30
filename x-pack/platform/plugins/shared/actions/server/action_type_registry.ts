/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { i18n } from '@kbn/i18n';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { RunContext, TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { TaskCost } from '@kbn/task-manager-plugin/server';
import { ACTION_TYPE_SOURCES } from '@kbn/actions-types';
import type { ActionType as CommonActionType } from '../common';
import { areValidFeatures, MAX_FEATURE_ID_LENGTH } from '../common';
import type { ActionsConfigurationUtilities } from './actions_config';
import type { ActionExecutionSourceType, ILicenseState, TaskRunnerFactory } from './lib';
import { getActionTypeFeatureUsageName } from './lib';
import type {
  ActionType,
  ActionTypeConfig,
  ActionTypeParams,
  ActionTypeSecrets,
  InMemoryConnector,
} from './types';

export interface ActionTypeRegistryOpts {
  licensing: LicensingPluginSetup;
  taskManager: TaskManagerSetupContract;
  taskRunnerFactory: TaskRunnerFactory;
  actionsConfigUtils: ActionsConfigurationUtilities;
  licenseState: ILicenseState;
  inMemoryConnectors: InMemoryConnector[];
}

interface ListOpts {
  featureId?: string;
  exposeValidation?: boolean;
}

export class ActionTypeRegistry {
  private readonly taskManager: TaskManagerSetupContract;
  private readonly actionTypes: Map<string, ActionType> = new Map();
  private readonly taskRunnerFactory: TaskRunnerFactory;
  private readonly actionsConfigUtils: ActionsConfigurationUtilities;
  private readonly licenseState: ILicenseState;
  private readonly inMemoryConnectors: InMemoryConnector[];
  private readonly licensing: LicensingPluginSetup;

  constructor(constructorParams: ActionTypeRegistryOpts) {
    this.taskManager = constructorParams.taskManager;
    this.taskRunnerFactory = constructorParams.taskRunnerFactory;
    this.actionsConfigUtils = constructorParams.actionsConfigUtils;
    this.licenseState = constructorParams.licenseState;
    this.inMemoryConnectors = constructorParams.inMemoryConnectors;
    this.licensing = constructorParams.licensing;
  }

  /**
   * Returns if the action type registry has the given action type registered
   */
  public has(id: string) {
    return this.actionTypes.has(id);
  }

  /**
   * Throws error if action type is not enabled.
   */
  public ensureActionTypeEnabled(id: string) {
    this.actionsConfigUtils.ensureActionTypeEnabled(id);
    // Important to happen last because the function will notify of feature usage at the
    // same time and it shouldn't notify when the action type isn't enabled
    this.licenseState.ensureLicenseForActionType(this.get(id));
  }

  /**
   * Returns true if action type is enabled in the config and a valid license is used.
   */
  public isActionTypeEnabled(
    id: string,
    options: { notifyUsage: boolean } = { notifyUsage: false }
  ) {
    return (
      this.actionsConfigUtils.isActionTypeEnabled(id) &&
      this.licenseState.isLicenseValidForActionType(this.get(id), options).isValid === true
    );
  }

  /**
   * Returns true if action type is enabled or preconfigured.
   * An action type can be disabled but used with a preconfigured action.
   * This does not apply to system actions as those can be disabled.
   */
  public isActionExecutable(
    actionId: string,
    actionTypeId: string,
    options: { notifyUsage: boolean } = { notifyUsage: false }
  ) {
    const validLicense = this.licenseState.isLicenseValidForActionType(
      this.get(actionTypeId),
      options
    ).isValid;
    if (validLicense === false) return false;

    const actionTypeEnabled = this.isActionTypeEnabled(actionTypeId, options);
    const inMemoryConnector = this.inMemoryConnectors.find(
      (connector) => connector.id === actionId
    );

    return (
      actionTypeEnabled ||
      (!actionTypeEnabled &&
        (inMemoryConnector?.isPreconfigured === true || inMemoryConnector?.isSystemAction === true))
    );
  }

  /**
   * Returns true if the action type is a system action type
   */
  public isSystemActionType = (actionTypeId: string): boolean =>
    Boolean(this.actionTypes.get(actionTypeId)?.isSystemActionType);

  /**
   * Returns true if the connector type has a sub-feature type defined
   */
  public hasSubFeature = (actionTypeId: string): boolean =>
    Boolean(this.actionTypes.get(actionTypeId)?.subFeature);

  /**
   * Returns the kibana privileges
   */
  public getActionKibanaPrivileges<Params extends ActionTypeParams = ActionTypeParams>(
    actionTypeId: string,
    params?: Params,
    source?: ActionExecutionSourceType
  ): string[] {
    const actionType = this.actionTypes.get(actionTypeId);

    if (!actionType?.isSystemActionType && !actionType?.subFeature) {
      return [];
    }
    return actionType?.getKibanaPrivileges?.({ params, source }) ?? [];
  }

  /**
   * Registers an action type to the action type registry
   */
  public register<
    Config extends ActionTypeConfig = ActionTypeConfig,
    Secrets extends ActionTypeSecrets = ActionTypeSecrets,
    Params extends ActionTypeParams = ActionTypeParams,
    ExecutorResultData = void
  >(actionType: ActionType<Config, Secrets, Params, ExecutorResultData>) {
    if (this.has(actionType.id)) {
      throw new Error(
        i18n.translate(
          'xpack.actions.actionTypeRegistry.register.duplicateActionTypeErrorMessage',
          {
            defaultMessage: 'Action type "{id}" is already registered.',
            values: {
              id: actionType.id,
            },
          }
        )
      );
    }

    if (!actionType.supportedFeatureIds || actionType.supportedFeatureIds.length === 0) {
      throw new Error(
        i18n.translate('xpack.actions.actionTypeRegistry.register.missingSupportedFeatureIds', {
          defaultMessage:
            'At least one "supportedFeatureId" value must be supplied for connector type "{connectorTypeId}".',
          values: {
            connectorTypeId: actionType.id,
          },
        })
      );
    }

    if (actionType.supportedFeatureIds.some((id) => id.length > MAX_FEATURE_ID_LENGTH)) {
      throw new Error(
        i18n.translate('xpack.actions.actionTypeRegistry.register.featureIdTooLong', {
          defaultMessage:
            'Feature IDs for connector type "{connectorTypeId}" must not exceed {maxLength} characters.',
          values: {
            connectorTypeId: actionType.id,
            maxLength: MAX_FEATURE_ID_LENGTH,
          },
        })
      );
    }

    if (!areValidFeatures(actionType.supportedFeatureIds)) {
      throw new Error(
        i18n.translate('xpack.actions.actionTypeRegistry.register.invalidConnectorFeatureIds', {
          defaultMessage: 'Invalid feature ids "{ids}" for connector type "{connectorTypeId}".',
          values: {
            connectorTypeId: actionType.id,
            ids: actionType.supportedFeatureIds.join(','),
          },
        })
      );
    }

    if (
      !actionType.isSystemActionType &&
      !actionType.subFeature &&
      actionType.getKibanaPrivileges
    ) {
      throw new Error(
        i18n.translate('xpack.actions.actionTypeRegistry.register.invalidKibanaPrivileges', {
          defaultMessage:
            'Kibana privilege authorization is only supported for system actions and action types that are registered under a sub-feature',
        })
      );
    }

    const maxAttempts = this.actionsConfigUtils.getMaxAttempts({
      actionTypeId: actionType.id,
      actionTypeMaxAttempts: actionType.maxAttempts,
    });

    this.actionTypes.set(actionType.id, { ...actionType } as unknown as ActionType);

    // Skip task type registration for connectors without execute/params
    if (actionType.executor && actionType.validate.params) {
      this.taskManager.registerTaskDefinitions({
        [`actions:${actionType.id}`]: {
          title: actionType.name,
          maxAttempts,
          cost: TaskCost.Tiny,
          createTaskRunner: (context: RunContext) => this.taskRunnerFactory.create(context),
        },
      });
    }
    // No need to notify usage on basic action types
    if (actionType.minimumLicenseRequired !== 'basic') {
      this.licensing.featureUsage.register(
        getActionTypeFeatureUsageName(actionType as unknown as ActionType),
        actionType.minimumLicenseRequired
      );
    }
  }

  /**
   * Returns an action type, throws if not registered
   */
  public get<
    Config extends ActionTypeConfig = ActionTypeConfig,
    Secrets extends ActionTypeSecrets = ActionTypeSecrets,
    Params extends ActionTypeParams = ActionTypeParams,
    ExecutorResultData = void
  >(id: string): ActionType<Config, Secrets, Params, ExecutorResultData> {
    if (!this.has(id)) {
      throw Boom.badRequest(
        i18n.translate('xpack.actions.actionTypeRegistry.get.missingActionTypeErrorMessage', {
          defaultMessage: 'Action type "{id}" is not registered.',
          values: {
            id,
          },
        })
      );
    }
    return this.actionTypes.get(id)! as ActionType<Config, Secrets, Params, ExecutorResultData>;
  }

  /**
   * Returns a list of registered action types [{ id, name, enabled }], filtered by featureId if provided.
   */
  public list(
    { featureId, exposeValidation }: ListOpts = { exposeValidation: false }
  ): CommonActionType[] {
    return Array.from(this.actionTypes)
      .filter(([_, actionType]) => {
        return featureId ? actionType.supportedFeatureIds.includes(featureId) : true;
      })
      .map(([actionTypeId, actionType]) => ({
        id: actionTypeId,
        name: actionType.name,
        minimumLicenseRequired: actionType.minimumLicenseRequired,
        enabled: this.isActionTypeEnabled(actionTypeId),
        enabledInConfig: this.actionsConfigUtils.isActionTypeEnabled(actionTypeId),
        enabledInLicense: !!this.licenseState.isLicenseValidForActionType(actionType).isValid,
        supportedFeatureIds: actionType.supportedFeatureIds,
        isSystemActionType: !!actionType.isSystemActionType,
        source: actionType.source || ACTION_TYPE_SOURCES.stack,
        subFeature: actionType.subFeature,
        ...(exposeValidation === true && actionType.validate.params
          ? {
              validate: {
                params: actionType.validate.params,
              },
            }
          : {}),
        isDeprecated: !!actionType.isDeprecated,
        allowMultipleSystemActions: actionType.allowMultipleSystemActions,
        description: actionType.description,
        isExperimental: actionType.isExperimental,
      }));
  }

  /**
   * Returns the actions configuration utilities
   */
  public getUtils(): ActionsConfigurationUtilities {
    return this.actionsConfigUtils;
  }

  public getAllTypes(): string[] {
    return [...this.list().map(({ id }) => id)];
  }

  isDeprecated(actionTypeId: string): boolean {
    return Boolean(this.actionTypes.get(actionTypeId)?.isDeprecated);
  }
}
