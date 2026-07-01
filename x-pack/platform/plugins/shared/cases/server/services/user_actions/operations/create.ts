/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsBulkResponse } from '@kbn/core/server';
import { get, isEmpty, pickBy } from 'lodash';
import type {
  CaseAssignees,
  CaseCustomField,
  CaseCustomFields,
  CaseSettings,
  CaseUserProfile,
  UserActionAction,
  UserActionType,
  SettingsUserActionPayload,
} from '../../../../common/types/domain';
import { UserActionActions, UserActionTypes } from '../../../../common/types/domain';
import type { UserActionPersistedAttributes } from '../../../common/types/user_actions';
import { UserActionPersistedAttributesRt } from '../../../common/types/user_actions';
import { CASE_SAVED_OBJECT, CASE_USER_ACTION_SAVED_OBJECT } from '../../../../common/constants';
import { arraysDifference } from '../../../client/utils';
import { isUserActionType } from '../../../../common/utils/user_actions';
import { decodeOrThrow } from '../../../common/runtime_types';
import { BuilderFactory } from '../builder_factory';
import type {
  AddSyncedAlertsCountToUserActionsParams,
  BuildUserActionsDictParams,
  BuilderParameters,
  BulkCreateAttachmentUserAction,
  BulkCreateBulkUpdateCaseUserActions,
  CommonUserActionArgs,
  CreatePayloadFunction,
  CreateUserActionES,
  GetUserActionItemByDifference,
  PostCaseUserActionArgs,
  ServiceContext,
  TypedUserActionDiffedItems,
  UserActionEvent,
  UserActionsDict,
  CreateUserActionArgs,
  BulkCreateUserActionArgs,
  TypedUserActionItem,
} from '../types';
import {
  isAssigneesArray,
  isCaseSettings,
  isCustomFieldsArray,
  isStringArray,
  isExtendedFields,
} from '../type_guards';
import type { IndexRefresh } from '../../types';
import { UserActionAuditLogger } from '../audit_logger';

export class UserActionPersister {
  private static readonly userActionFieldsAllowed: Set<string> = new Set(
    Object.keys(UserActionTypes)
  );

  private readonly builderFactory: BuilderFactory;
  private readonly auditLogger: UserActionAuditLogger;

  constructor(private readonly context: ServiceContext) {
    this.builderFactory = new BuilderFactory();

    this.auditLogger = new UserActionAuditLogger(this.context.auditLogger);
  }

  public buildUserActions({ updatedCases, user }: BuildUserActionsDictParams): UserActionsDict {
    return updatedCases.cases.reduce<UserActionsDict>((acc, updatedCase) => {
      const originalCase = updatedCase.originalCase;

      if (originalCase == null) {
        return acc;
      }

      const caseId = updatedCase.caseId;
      const owner = originalCase.attributes.owner;

      const userActions: UserActionEvent[] = [];
      const updatedFields = Object.keys(updatedCase.updatedAttributes);

      updatedFields
        .filter((field) => UserActionPersister.userActionFieldsAllowed.has(field))
        .forEach((field) => {
          // Special case for status as it can possibly have an associated closeReason (syncing to alerts)
          // Persist the closeReason to the status userAction
          if (field === UserActionTypes.status && updatedCase.updatedAttributes.status != null) {
            const userActionBuilder = this.builderFactory.getBuilder(UserActionTypes.status);
            const statusUserAction = userActionBuilder?.build({
              caseId,
              owner,
              user,
              payload: {
                status: updatedCase.updatedAttributes.status,
                closeReason: updatedCase.closeReason,
                syncAlerts:
                  updatedCase.updatedAttributes.settings?.syncAlerts ??
                  originalCase.attributes.settings.syncAlerts,
              },
            });

            if (statusUserAction != null) {
              userActions.push(statusUserAction);
            }
            return;
          }

          const originalValue = get(originalCase, ['attributes', field]);
          const newValue = get(updatedCase, ['updatedAttributes', field]);
          userActions.push(
            ...this.getUserActionItemByDifference({
              field,
              originalValue,
              newValue,
              user,
              owner,
              caseId,
            })
          );
        });

      acc[caseId] = userActions;
      return acc;
    }, {});
  }
  // Returns a new UserActionsDict with syncedAlertCountCount added to status actions
  public addSyncedAlertsCountToUserActions({
    userActionsDict,
    syncedAlertCountCountByCaseId,
  }: AddSyncedAlertsCountToUserActionsParams): UserActionsDict {
    return Object.keys(userActionsDict).reduce<UserActionsDict>((acc, caseId) => {
      const syncedAlertCountCount = syncedAlertCountCountByCaseId.get(caseId);
      const userActions = userActionsDict[caseId];

      if (syncedAlertCountCount == null) {
        acc[caseId] = userActions;
        return acc;
      }

      acc[caseId] = userActions.map((userAction) => {
        if (userAction.parameters.attributes.type !== UserActionTypes.status) {
          return userAction;
        }

        return {
          ...userAction,
          parameters: {
            ...userAction.parameters,
            attributes: {
              ...userAction.parameters.attributes,
              payload: {
                ...userAction.parameters.attributes.payload,
                syncedAlertCount: syncedAlertCountCount,
              },
            },
          },
        };
      });

      return acc;
    }, {});
  }

  public async bulkCreateUpdateCase({
    builtUserActions,
    refresh,
  }: BulkCreateBulkUpdateCaseUserActions): Promise<void> {
    await this.bulkCreateAndLog({
      userActions: builtUserActions,
      refresh,
    });
  }

  private getUserActionItemByDifference(params: GetUserActionItemByDifference): UserActionEvent[] {
    const { field, originalValue, newValue, caseId, owner, user } = params;

    if (!UserActionPersister.userActionFieldsAllowed.has(field)) {
      return [];
    } else if (
      field === UserActionTypes.assignees &&
      isAssigneesArray(originalValue) &&
      isAssigneesArray(newValue)
    ) {
      return this.buildAssigneesUserActions({ ...params, originalValue, newValue });
    } else if (
      field === UserActionTypes.tags &&
      isStringArray(originalValue) &&
      isStringArray(newValue)
    ) {
      return this.buildTagsUserActions({ ...params, originalValue, newValue });
    } else if (
      field === UserActionTypes.customFields &&
      isCustomFieldsArray(originalValue) &&
      isCustomFieldsArray(newValue)
    ) {
      return this.buildCustomFieldsUserActions({ ...params, originalValue, newValue });
    } else if (
      field === UserActionTypes.settings &&
      isCaseSettings(newValue) &&
      isCaseSettings(originalValue)
    ) {
      return this.buildSettingsUserActions({
        ...params,
        originalValue,
        newValue,
      });
    } else if (field === UserActionTypes.extended_fields && isExtendedFields(newValue)) {
      return this.buildExtendedFieldsUserActions(params);
    } else if (isUserActionType(field) && newValue !== undefined) {
      const userActionBuilder = this.builderFactory.getBuilder(UserActionTypes[field]);
      const fieldUserAction = userActionBuilder?.build({
        caseId,
        owner,
        user,
        payload: { [field]: newValue },
      });

      return fieldUserAction ? [fieldUserAction] : [];
    }

    return [];
  }

  private buildExtendedFieldsUserActions(params: GetUserActionItemByDifference): UserActionEvent[] {
    const { originalValue, newValue, caseId, owner, user } = params;
    // Only record the fields that actually changed, not the full merged object.
    const oldFields = isExtendedFields(originalValue) ? originalValue : {};
    const changedFields = pickBy(
      isExtendedFields(newValue) ? newValue : {},
      (value, key) => oldFields[key] !== value
    );

    if (Object.keys(changedFields).length === 0) {
      return [];
    }

    const userActionBuilder = this.builderFactory.getBuilder(UserActionTypes.extended_fields);
    const fieldUserAction = userActionBuilder?.build({
      caseId,
      owner,
      user,
      payload: { extended_fields: changedFields },
    });
    return fieldUserAction ? [fieldUserAction] : [];
  }

  private buildAssigneesUserActions(params: TypedUserActionDiffedItems<CaseUserProfile>) {
    const createPayload: CreatePayloadFunction<
      CaseUserProfile,
      typeof UserActionTypes.assignees
    > = (items: CaseAssignees) => ({ assignees: items });

    return this.buildAddDeleteUserActions(params, createPayload, UserActionTypes.assignees);
  }

  private buildTagsUserActions(params: TypedUserActionDiffedItems<string>) {
    const createPayload: CreatePayloadFunction<string, typeof UserActionTypes.tags> = (
      items: string[]
    ) => ({
      tags: items,
    });

    return this.buildAddDeleteUserActions(params, createPayload, UserActionTypes.tags);
  }

  private buildSettingsUserActions(params: TypedUserActionItem<CaseSettings>) {
    const { newValue, originalValue, caseId, owner, user } = params;
    const settingKeys = ['syncAlerts', 'extractObservables'] as const;
    const payload: SettingsUserActionPayload = {
      settings: {},
    };
    for (const key of settingKeys) {
      const addedNewValue = originalValue[key] === undefined && newValue[key] !== undefined;
      const valueChanged =
        newValue[key] !== undefined &&
        originalValue[key] !== undefined &&
        newValue[key] !== originalValue[key];
      if (addedNewValue || valueChanged) {
        payload.settings[key] = newValue[key];
      }
    }

    const userActionBuilder = this.builderFactory.getBuilder(UserActionTypes.settings);
    const fieldUserAction = userActionBuilder?.build({
      caseId,
      owner,
      user,
      payload,
    });

    return fieldUserAction ? [fieldUserAction] : [];
  }

  private buildCustomFieldsUserActions(params: TypedUserActionDiffedItems<CaseCustomField>) {
    const createPayload: CreatePayloadFunction<
      CaseCustomField,
      typeof UserActionTypes.customFields
    > = (items: CaseCustomFields) => ({ customFields: items });

    const { originalValue: originalCustomFields, newValue: newCustomFields } = params;

    const originalCustomFieldsKeys = new Set(
      originalCustomFields.map((customField) => customField.key)
    );

    const compareValues = arraysDifference(originalCustomFields, newCustomFields);

    const updatedCustomFieldsUsersActions = compareValues?.addedItems
      .filter((customField) => {
        if (customField.value != null) {
          return true;
        }

        return originalCustomFieldsKeys.has(customField.key);
      })
      .map((customField) =>
        this.buildUserAction({
          commonArgs: params,
          actionType: UserActionTypes.customFields,
          action: UserActionActions.update,
          createPayload,
          modifiedItems: [customField],
        })
      )
      .filter((userAction): userAction is UserActionEvent => userAction != null);

    return [...(updatedCustomFieldsUsersActions ? updatedCustomFieldsUsersActions : [])];
  }

  private buildAddDeleteUserActions<Item, ActionType extends UserActionType>(
    params: TypedUserActionDiffedItems<Item>,
    createPayload: CreatePayloadFunction<Item, ActionType>,
    actionType: ActionType
  ) {
    const { originalValue, newValue } = params;
    const compareValues = arraysDifference(originalValue, newValue);

    const addUserAction = this.buildUserAction({
      commonArgs: params,
      actionType,
      action: UserActionActions.add,
      createPayload,
      modifiedItems: compareValues?.addedItems,
    });
    const deleteUserAction = this.buildUserAction({
      commonArgs: params,
      actionType,
      action: UserActionActions.delete,
      createPayload,
      modifiedItems: compareValues?.deletedItems,
    });

    return [
      ...(addUserAction ? [addUserAction] : []),
      ...(deleteUserAction ? [deleteUserAction] : []),
    ];
  }

  private buildUserAction<Item, ActionType extends UserActionType>({
    commonArgs,
    actionType,
    action,
    createPayload,
    modifiedItems,
  }: {
    commonArgs: CommonUserActionArgs;
    actionType: ActionType;
    action: UserActionAction;
    createPayload: CreatePayloadFunction<Item, ActionType>;
    modifiedItems?: Item[] | null;
  }) {
    const userActionBuilder = this.builderFactory.getBuilder(actionType);

    if (!userActionBuilder || !modifiedItems || modifiedItems.length <= 0) {
      return;
    }

    const { caseId, owner, user } = commonArgs;

    const userAction = userActionBuilder.build({
      action,
      caseId,
      user,
      owner,
      payload: createPayload(modifiedItems),
    });

    return userAction;
  }

  public async bulkCreateAttachmentDeletion({
    caseId,
    attachments,
    user,
    refresh,
  }: BulkCreateAttachmentUserAction): Promise<void> {
    await this.bulkCreateAttachment({
      caseId,
      attachments,
      user,
      action: UserActionActions.delete,
      refresh,
    });
  }

  public async bulkCreateAttachmentCreation({
    caseId,
    attachments,
    user,
    refresh,
  }: BulkCreateAttachmentUserAction): Promise<void> {
    await this.bulkCreateAttachment({
      caseId,
      attachments,
      user,
      action: UserActionActions.create,
      refresh,
    });
  }

  private async bulkCreateAttachment({
    caseId,
    attachments,
    user,
    action = UserActionActions.create,
    refresh,
  }: BulkCreateAttachmentUserAction): Promise<void> {
    this.context.log.debug(`Attempting to create a bulk create case user action`);

    if (attachments.length <= 0) {
      return;
    }

    const userActions = attachments.reduce<UserActionEvent[]>((acc, attachment) => {
      const userActionBuilder = this.builderFactory.getBuilder(UserActionTypes.comment);
      const commentUserAction = userActionBuilder?.build({
        action,
        caseId,
        user,
        owner: attachment.owner,
        savedObjectId: attachment.id,
        savedObjectType: attachment.savedObjectType,
        payload: { attachment: attachment.attachment },
      });

      if (commentUserAction == null) {
        return acc;
      }

      return [...acc, commentUserAction];
    }, []);

    await this.bulkCreateAndLog({
      userActions,
      refresh,
    });
  }

  private async bulkCreateAndLog({
    userActions,
    refresh,
  }: { userActions: UserActionEvent[] } & IndexRefresh) {
    const createdUserActions = await this.bulkCreate({ actions: userActions, refresh });

    if (!createdUserActions) {
      return;
    }

    for (let i = 0; i < userActions.length; i++) {
      this.auditLogger.log(userActions[i].eventDetails, createdUserActions.saved_objects[i].id);
    }
  }

  private async bulkCreate({
    actions,
    refresh,
  }: PostCaseUserActionArgs): Promise<
    SavedObjectsBulkResponse<UserActionPersistedAttributes> | undefined
  > {
    if (isEmpty(actions)) {
      return;
    }

    try {
      this.context.log.debug(`Attempting to bulk create user actions`);

      const response =
        await this.context.unsecuredSavedObjectsClient.bulkCreate<UserActionPersistedAttributes>(
          actions.map((action) => {
            const decodedAttributes = decodeOrThrow(UserActionPersistedAttributesRt)(
              action.parameters.attributes
            );

            return {
              type: CASE_USER_ACTION_SAVED_OBJECT,
              attributes: decodedAttributes,
              references: action.parameters.references,
            };
          }),
          { refresh }
        );

      // analyticsV2 mirror to `.cases-activity`. Fire-and-forget — the
      // SO write is the source of truth; the writer logs and lets
      // reconciliation fix anything that fails. `bulkCreate` returns one
      // entry per request entry (in the same order); a per-entry
      // `error` field marks failures, which we skip so we don't mirror
      // a doc that wasn't actually persisted.
      const successes: Array<SavedObject<UserActionPersistedAttributes>> = [];
      for (const so of response.saved_objects) {
        if (so.error == null) successes.push(so);
      }
      if (successes.length > 0) {
        this.context.analyticsV2ActivityWriter.bulkUpsertActions(successes);
      }

      return response;
    } catch (error) {
      this.context.log.error(`Error on bulk creating user action: ${error}`);
      throw error;
    }
  }

  public async createUserAction<T extends keyof BuilderParameters>({
    userAction,
    refresh,
  }: CreateUserActionArgs<T>): Promise<void> {
    const {
      action,
      type,
      caseId,
      user,
      owner,
      payload,
      connectorId,
      savedObjectId,
      savedObjectType,
    } = userAction;

    try {
      this.context.log.debug(`Attempting to create a user action of type: ${type}`);
      const userActionBuilder = this.builderFactory.getBuilder<T>(type);

      const userActionPayload = userActionBuilder?.build({
        action,
        caseId,
        user,
        owner,
        connectorId,
        savedObjectId,
        savedObjectType,
        payload,
      });

      if (userActionPayload) {
        await this.createAndLog({ userAction: userActionPayload, refresh });
      }
    } catch (error) {
      this.context.log.error(`Error on creating user action of type: ${type}. Error: ${error}`);
      throw error;
    }
  }

  public async bulkCreateUserAction<T extends keyof BuilderParameters>({
    userActions,
    refresh,
  }: BulkCreateUserActionArgs<T>): Promise<void> {
    try {
      this.context.log.debug(`Attempting to bulk create a user actions`);

      if (userActions.length <= 0) {
        return;
      }

      const userActionsPayload = userActions
        .map(
          ({
            action,
            type,
            caseId,
            user,
            owner,
            payload,
            connectorId,
            savedObjectId,
            savedObjectType,
          }) => {
            const userActionBuilder = this.builderFactory.getBuilder<T>(type);
            const userAction = userActionBuilder?.build({
              action,
              caseId,
              user,
              owner,
              connectorId,
              savedObjectId,
              savedObjectType,
              payload,
            });

            if (userAction == null) {
              return null;
            }

            return userAction;
          }
        )
        .filter(Boolean) as UserActionEvent[];

      await this.bulkCreateAndLog({ userActions: userActionsPayload, refresh });
    } catch (error) {
      this.context.log.error(`Error on bulk creating user actions. Error: ${error}`);
      throw error;
    }
  }

  private async createAndLog({
    userAction,
    refresh,
  }: {
    userAction: UserActionEvent;
  } & IndexRefresh): Promise<void> {
    const createdUserAction = await this.create({ ...userAction.parameters, refresh });

    this.auditLogger.log(userAction.eventDetails, createdUserAction.id);
  }

  private async create<T>({
    attributes,
    references,
    refresh,
  }: CreateUserActionES<T>): Promise<SavedObject<T>> {
    try {
      this.context.log.debug(`Attempting to POST a new case user action`);

      const decodedAttributes = decodeOrThrow(UserActionPersistedAttributesRt)(attributes);

      const res = await this.context.unsecuredSavedObjectsClient.create<T>(
        CASE_USER_ACTION_SAVED_OBJECT,
        decodedAttributes as unknown as T,
        {
          references: references ?? [],
          refresh,
        }
      );

      // analyticsV2 mirror to `.cases-activity`. Fire-and-forget — see
      // `bulkCreate` above for the rationale. The cast lines up with the
      // generic `T`: callers pass `UserActionPersistedAttributes`-shaped
      // attributes; the Saved Objects API just forwards them through `T`
      // for consumer convenience, so re-narrowing here is safe.
      this.context.analyticsV2ActivityWriter.upsertAction(
        res as unknown as SavedObject<UserActionPersistedAttributes>
      );

      return res;
    } catch (error) {
      this.context.log.error(`Error on POST a new case user action: ${error}`);
      throw error;
    }
  }

  public async bulkAuditLogCaseDeletion(caseIds: string[]): Promise<void> {
    this.context.log.debug(`Attempting to log bulk case deletion`);

    for (const id of caseIds) {
      this.auditLogger.log({
        getMessage: () => `User deleted case id: ${id}`,
        action: UserActionActions.delete,
        descriptiveAction: 'case_user_action_delete_case',
        savedObjectId: id,
        savedObjectType: CASE_SAVED_OBJECT,
      });
    }
  }
}
