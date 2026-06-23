/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import type {
  SavedObject,
  SavedObjectsBulkUpdateResponse,
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
  SavedObjectsUpdateResponse,
} from '@kbn/core/server';
import { isEqual } from 'lodash';

import { nodeBuilder } from '@kbn/es-query';

import type { AlertService, CasesService, CaseUserActionService } from '../../services';
import type { UpdateAlertStatusRequest } from '../alerts/types';
import type { CasesClient, CasesClientArgs } from '..';
import type { OwnerEntity, OperationDetails } from '../../authorization';
import type { PatchCasesArgs } from '../../services/cases/types';
import type { UserActionEvent, UserActionsDict } from '../../services/user_actions/types';

import type {
  CasePatchRequest,
  CasesPatchRequest,
  CasesPatchResponse,
  CaseWithUpdateSummary,
} from '../../../common/types/api';
import { PatchCasesResponseRt, CasesPatchRequestRt } from '../../../common/types/api';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  MAX_USER_ACTIONS_PER_CASE,
} from '../../../common/constants';
import type { Owner } from '../../../common/constants/types';
import { Operations } from '../../authorization';
import { createCaseError, isSOError } from '../../common/error';
import { createAlertUpdateStatusRequest, flattenCaseSavedObject } from '../../common/utils';
import {
  isAlertAttachmentType,
  UNIFIED_ALERT_TYPES_ARRAY,
} from '../../../common/utils/attachments';
import {
  arraysDifference,
  getCaseToUpdate,
  buildFilter,
  combineFilters,
  NodeBuilderOperators,
} from '../utils';
import {
  dedupAssignees,
  fillMissingCustomFields,
  getCloseReasonIfValid,
  getClosedInfoForUpdate,
  getDurationForUpdate,
  getInProgressInfoForUpdate,
  getTimingMetricsForUpdate,
} from './utils';
import { LICENSING_CASE_ASSIGNMENT_FEATURE } from '../../common/constants';
import type { LicensingService } from '../../services/licensing';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import { decodeWithExcessOrThrow, decodeOrThrow } from '../../common/runtime_types';
import type {
  CaseAttributes,
  User,
  CaseAssignees,
  AttachmentAttributes,
  CustomFieldsConfiguration,
} from '../../../common/types/domain';
import { CaseStatuses, AttachmentType } from '../../../common/types/domain';
import {
  validateCustomFields,
  validateExtendedFieldsInRequest,
  resolveGlobalFields,
} from './validators';
import { emptyCasesAssigneesSanitizer } from './sanitizers';
/**
 * Throws an error if any of the requests attempt to update the owner of a case.
 */
function throwIfUpdateOwner(requests: UpdateRequestWithOriginalCase[]) {
  const requestsUpdatingOwner = requests.filter(({ updateReq }) => updateReq.owner !== undefined);

  if (requestsUpdatingOwner.length > 0) {
    const ids = requestsUpdatingOwner.map(({ updateReq }) => updateReq.id);
    throw Boom.badRequest(`Updating the owner of a case is not allowed ids: [${ids.join(', ')}]`);
  }
}

/**
 * Throws an error if any of the requests attempt to create a number of user actions that would put
 * it's case over the limit.
 */
async function throwIfMaxUserActionsReached({
  userActionsDict,
  userActionService,
}: {
  userActionsDict: UserActionsDict;
  userActionService: CaseUserActionService;
}) {
  if (userActionsDict == null) {
    return;
  }

  const currentTotals = await userActionService.getMultipleCasesUserActionsTotal({
    caseIds: Object.keys(userActionsDict),
  });

  Object.keys(currentTotals).forEach((caseId) => {
    const totalToAdd = userActionsDict?.[caseId]?.length ?? 0;

    if (currentTotals[caseId] + totalToAdd > MAX_USER_ACTIONS_PER_CASE) {
      throw Boom.badRequest(
        `The case with case id ${caseId} has reached the limit of ${MAX_USER_ACTIONS_PER_CASE} user actions.`
      );
    }
  });
}

async function validateCustomFieldsInRequest({
  casesToUpdate,
  customFieldsConfigurationMap,
}: {
  casesToUpdate: UpdateRequestWithOriginalCase[];
  customFieldsConfigurationMap: Map<string, CustomFieldsConfiguration>;
}) {
  casesToUpdate.forEach(({ updateReq, originalCase }) => {
    if (updateReq.customFields) {
      const owner = originalCase.attributes.owner;
      const customFieldsConfiguration = customFieldsConfigurationMap.get(owner);

      validateCustomFields({
        requestCustomFields: updateReq.customFields,
        customFieldsConfiguration,
      });
    }
  });
}

/**
 * Throws an error if any of the requests attempt to update the assignees of the case
 * without the appropriate license
 */
function throwIfUpdateAssigneesWithoutValidLicense(
  requests: UpdateRequestWithOriginalCase[],
  hasPlatinumLicenseOrGreater: boolean
) {
  if (hasPlatinumLicenseOrGreater) {
    return;
  }

  const requestsUpdatingAssignees = requests.filter(
    ({ updateReq }) => updateReq.assignees !== undefined
  );

  if (requestsUpdatingAssignees.length > 0) {
    const ids = requestsUpdatingAssignees.map(({ updateReq }) => updateReq.id);
    throw Boom.forbidden(
      `In order to assign users to cases, you must be subscribed to an Elastic Platinum license, ids: [${ids.join(
        ', '
      )}]`
    );
  }
}

function notifyPlatinumUsage(
  licensingService: LicensingService,
  requests: UpdateRequestWithOriginalCase[]
) {
  const requestsUpdatingAssignees = requests.filter(
    ({ updateReq }) => updateReq.assignees !== undefined
  );

  if (requestsUpdatingAssignees.length > 0) {
    licensingService.notifyUsage(LICENSING_CASE_ASSIGNMENT_FEATURE);
  }
}

/**
 * Get the id from a reference in a comment for a specific type.
 */
function getID(
  comment: SavedObject<AttachmentAttributes>,
  type: typeof CASE_SAVED_OBJECT
): string | undefined {
  return comment.references.find((ref) => ref.type === type)?.id;
}

/**
 * Gets all the alert comments (generated or user alerts) for the requested cases.
 */
async function getAlertComments({
  casesToSync,
  caseService,
  isCasesAttachmentsEnabled,
}: {
  casesToSync: UpdateRequestWithOriginalCase[];
  caseService: CasesService;
  isCasesAttachmentsEnabled: boolean;
}): Promise<SavedObjectsFindResponse<AttachmentAttributes>> {
  const idsOfCasesToSync = casesToSync.map(({ updateReq }) => updateReq.id);

  const legacyAlertFilter = nodeBuilder.is(
    `${CASE_COMMENT_SAVED_OBJECT}.attributes.type`,
    AttachmentType.alert
  );

  const alertFilter = isCasesAttachmentsEnabled
    ? combineFilters(
        [
          legacyAlertFilter,
          buildFilter({
            filters: UNIFIED_ALERT_TYPES_ARRAY,
            field: 'type',
            operator: 'or',
            type: CASE_ATTACHMENT_SAVED_OBJECT,
          }),
        ],
        NodeBuilderOperators.or
      )
    : legacyAlertFilter;

  return (await caseService.getAllCaseComments({
    id: idsOfCasesToSync,
    options: {
      filter: alertFilter,
    },
    mode: isCasesAttachmentsEnabled ? 'unified' : 'legacy',
  })) as SavedObjectsFindResponse<AttachmentAttributes>;
}

/**
 * Returns what status the alert comment should have based on whether it is associated to a case.
 */
function getSyncStatusForComment({
  alertComment,
  casesToSyncToStatus,
}: {
  alertComment: SavedObjectsFindResult<AttachmentAttributes>;
  casesToSyncToStatus: Map<string, [CaseStatuses, string?]>;
}): [CaseStatuses, string?] {
  const id = getID(alertComment, CASE_SAVED_OBJECT);

  if (!id) {
    return [CaseStatuses.open, undefined];
  }

  return casesToSyncToStatus.get(id) ?? [CaseStatuses.open, undefined];
}

/**
 * Updates the alert ID's status field based on the patch requests
 * Returns a map of case ids to the number of alerts synced
 */
async function updateAlerts({
  casesWithSyncSettingChangedToOn,
  casesWithStatusChangedAndSynced,
  caseService,
  alertsService,
  isCasesAttachmentsEnabled,
}: {
  casesWithSyncSettingChangedToOn: UpdateRequestWithOriginalCase[];
  casesWithStatusChangedAndSynced: UpdateRequestWithOriginalCase[];
  caseService: CasesService;
  alertsService: AlertService;
  isCasesAttachmentsEnabled: boolean;
}): Promise<Map<string, number>> {
  /**
   * It's possible that a case ID can appear multiple times in each array. I'm intentionally placing the status changes
   * last so when the map is built we will use the last status change as the source of truth.
   */
  const casesToSync = [...casesWithSyncSettingChangedToOn, ...casesWithStatusChangedAndSynced];

  // build a map of case id to the status it has, and optionally a closing reason
  const casesToSyncToStatus = casesToSync.reduce((acc, { updateReq, originalCase }) => {
    const closeReason =
      updateReq.status === CaseStatuses.closed
        ? getCloseReasonIfValid(updateReq.closeReason)
        : undefined;

    acc.set(updateReq.id, [
      updateReq.status ?? originalCase.attributes.status ?? CaseStatuses.open,
      closeReason,
    ]);
    return acc;
  }, new Map<string, [CaseStatuses, string?]>());

  // get all the alerts for all the alert comments for all cases
  const totalAlerts = await getAlertComments({
    casesToSync,
    caseService,
    isCasesAttachmentsEnabled,
  });

  const alertsToUpdateByCaseId = totalAlerts.saved_objects.reduce(
    (acc: Map<string, UpdateAlertStatusRequest[]>, alertComment) => {
      if (isAlertAttachmentType(alertComment.attributes.type)) {
        const caseId = getID(alertComment, CASE_SAVED_OBJECT);
        if (caseId == null) {
          return acc;
        }

        const statusAndReason = getSyncStatusForComment({
          alertComment,
          casesToSyncToStatus,
        });

        const existingAlerts = acc.get(caseId) ?? [];
        const alertsToUpdate = createAlertUpdateStatusRequest({
          comment: alertComment.attributes,
          status: statusAndReason[0],
          closingReason: statusAndReason[1],
        });

        acc.set(caseId, [...existingAlerts, ...alertsToUpdate]);
      }

      return acc;
    },
    new Map<string, UpdateAlertStatusRequest[]>()
  );

  if (alertsToUpdateByCaseId.size === 0) {
    return new Map<string, number>();
  }

  const syncedAlertCountCountByCaseId = new Map<string, number>();

  await Promise.all(
    Array.from(alertsToUpdateByCaseId.entries()).map(async ([caseId, alertsToUpdate]) => {
      const updatedAlertsCount = await alertsService.updateAlertsStatus(alertsToUpdate);
      syncedAlertCountCountByCaseId.set(caseId, updatedAlertsCount);
    })
  );

  return syncedAlertCountCountByCaseId;
}

function partitionPatchRequest(
  casesMap: Map<string, CaseSavedObjectTransformed>,
  patchReqCases: CasePatchRequest[]
): {
  nonExistingCases: CasePatchRequest[];
  conflictedCases: CasePatchRequest[];
  // This will be a deduped array of case IDs with their corresponding owner
  casesToAuthorize: OwnerEntity[];
  reopenedCases: CasePatchRequest[];
  changedAssignees: CasePatchRequest[];
} {
  const nonExistingCases: CasePatchRequest[] = [];
  const conflictedCases: CasePatchRequest[] = [];
  const reopenedCases: CasePatchRequest[] = [];
  const changedAssignees: CasePatchRequest[] = [];
  const casesToAuthorize: Map<string, OwnerEntity> = new Map<string, OwnerEntity>();

  for (const reqCase of patchReqCases) {
    const foundCase = casesMap.get(reqCase.id);

    if (!foundCase || isSOError(foundCase)) {
      nonExistingCases.push(reqCase);
    } else if (foundCase.version !== reqCase.version) {
      conflictedCases.push(reqCase);
      // let's try to authorize the conflicted case even though we'll fail after afterwards just in case
      casesToAuthorize.set(foundCase.id, { id: foundCase.id, owner: foundCase.attributes.owner });
    } else if (
      reqCase.status != null &&
      foundCase.attributes.status !== reqCase.status &&
      foundCase.attributes.status === CaseStatuses.closed
    ) {
      // Track cases that are closed and a user is attempting to reopen
      reopenedCases.push(reqCase);
      casesToAuthorize.set(foundCase.id, { id: foundCase.id, owner: foundCase.attributes.owner });
    } else {
      casesToAuthorize.set(foundCase.id, { id: foundCase.id, owner: foundCase.attributes.owner });
    }
    if (reqCase.assignees) {
      if (
        !isEqual(
          reqCase.assignees.map(({ uid }) => uid),
          foundCase?.attributes.assignees.map(({ uid }) => uid)
        ) &&
        foundCase
      ) {
        changedAssignees.push(reqCase);
      }
    }
  }

  return {
    nonExistingCases,
    conflictedCases,
    reopenedCases,
    changedAssignees,
    casesToAuthorize: Array.from(casesToAuthorize.values()),
  };
}

export function getOperationsToAuthorize({
  reopenedCases,
  changedAssignees,
  allCases,
}: {
  reopenedCases: CasePatchRequest[];
  changedAssignees: CasePatchRequest[];
  allCases: CasePatchRequest[];
}): OperationDetails[] {
  const operations: OperationDetails[] = [];
  const onlyAssigneeOperations =
    reopenedCases.length === 0 && changedAssignees.length === allCases.length;
  const onlyReopenOperations =
    changedAssignees.length === 0 && reopenedCases.length === allCases.length;

  if (reopenedCases.length > 0) {
    operations.push(Operations.reopenCase);
  }

  if (changedAssignees.length > 0) {
    operations.push(Operations.assignCase);
  }

  if (!onlyAssigneeOperations && !onlyReopenOperations) {
    operations.push(Operations.updateCase);
  }

  return operations;
}

export interface UpdateRequestWithOriginalCase {
  updateReq: CasePatchRequest;
  originalCase: CaseSavedObjectTransformed;
}

/**
 * Updates the specified cases with new values
 *
 * @ignore
 */
export const bulkUpdate = async (
  cases: CasesPatchRequest,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
): Promise<CasesPatchResponse> => {
  const {
    services: {
      caseService,
      userActionService,
      alertsService,
      licensingService,
      notificationService,
      attachmentService,
      templatesService,
      fieldDefinitionsService,
    },
    user,
    logger,
    authorization,
    closeReasonValidator,
    config,
  } = clientArgs;

  const isCasesAttachmentsEnabled = config.attachments?.enabled === true;

  try {
    const rawQuery = decodeWithExcessOrThrow(CasesPatchRequestRt)(cases);
    const query = emptyCasesAssigneesSanitizer(rawQuery);
    const caseIds = query.cases.map((q) => q.id);
    const myCases = await caseService.getCases({
      caseIds,
    });

    /**
     * Warning: The code below assumes that the
     * casesMap is immutable. It should be used
     * only for read.
     */
    const casesMap = myCases.saved_objects.reduce((acc, so) => {
      acc.set(so.id, so as CaseSavedObjectTransformed);
      return acc;
    }, new Map<string, CaseSavedObjectTransformed>());

    const { nonExistingCases, conflictedCases, casesToAuthorize, reopenedCases, changedAssignees } =
      partitionPatchRequest(casesMap, query.cases);

    const operationsToAuthorize = getOperationsToAuthorize({
      reopenedCases,
      changedAssignees,
      allCases: query.cases,
    });

    await authorization.ensureAuthorized({
      entities: casesToAuthorize,
      operation: operationsToAuthorize,
    });

    if (nonExistingCases.length > 0) {
      throw Boom.notFound(
        `These cases ${nonExistingCases
          .map((c) => c.id)
          .join(', ')} do not exist. Please check you have the correct ids.`
      );
    }

    if (conflictedCases.length > 0) {
      throw Boom.conflict(
        `These cases ${conflictedCases
          .map((c) => c.id)
          .join(', ')} have been updated. Please refresh before saving additional updates.`
      );
    }

    const configurations = await casesClient.configure.get();
    const customFieldsConfigurationMap: Map<string, CustomFieldsConfiguration> = new Map(
      configurations.map((conf) => [conf.owner, conf.customFields])
    );

    const casesToUpdate: UpdateRequestWithOriginalCase[] = query.cases.reduce(
      (acc: UpdateRequestWithOriginalCase[], updateCase) => {
        const originalCase = casesMap.get(updateCase.id);

        if (!originalCase) {
          return acc;
        }

        const fieldsToUpdate = getCaseToUpdate(originalCase.attributes, updateCase);
        const closeReason = getCloseReasonIfValid(updateCase.closeReason);
        // Explicitly add the closing reason if it exists in the request
        const fieldsToUpdateIncludingCloseReason =
          fieldsToUpdate.status === CaseStatuses.closed && closeReason != null
            ? { ...fieldsToUpdate, closeReason }
            : fieldsToUpdate;

        const { id, version, ...restFields } = fieldsToUpdateIncludingCloseReason;

        if (Object.keys(restFields).length > 0) {
          acc.push({ originalCase, updateReq: fieldsToUpdateIncludingCloseReason });
        }

        return acc;
      },
      []
    );

    if (casesToUpdate.length <= 0) {
      throw Boom.notAcceptable('All update fields are identical to current version.');
    }

    const hasPlatinumLicense = await licensingService.isAtLeastPlatinum();

    throwIfUpdateOwner(casesToUpdate);
    throwIfUpdateAssigneesWithoutValidLicense(casesToUpdate, hasPlatinumLicense);

    // Validate close reasons
    await Promise.all(
      casesToUpdate.map(async ({ updateReq, originalCase }) => {
        const { closeReason } = updateReq;
        if (closeReason == null) {
          return;
        }

        const syncAlertsAfterUpdate =
          updateReq.settings?.syncAlerts ?? originalCase.attributes.settings.syncAlerts;
        if (!syncAlertsAfterUpdate) {
          throw Boom.badRequest(
            `Cannot provide a close reason for case ${updateReq.id} when sync alerts is disabled.`
          );
        }
        // The validator is used by specific owners (e.g., securitySolution) to restrict valid close reasons.
        // If no validator is registered, all close reasons are accepted.
        if (closeReasonValidator != null) {
          const isValid = await closeReasonValidator(closeReason, originalCase.attributes.owner);
          if (!isValid) {
            throw Boom.badRequest(`Invalid close reason: "${closeReason}"`);
          }
        }
      })
    );

    await validateCustomFieldsInRequest({ casesToUpdate, customFieldsConfigurationMap });

    // Pre-resolve global fields once per owner to avoid N SO queries inside Promise.all.
    const uniqueOwnersWithExtendedFields = [
      ...casesToUpdate.reduce((owners, { updateReq, originalCase }) => {
        if (updateReq.extended_fields) owners.add(originalCase.attributes.owner);
        return owners;
      }, new Set<string>()),
    ];
    const globalFieldsByOwner = new Map(
      await Promise.all(
        uniqueOwnersWithExtendedFields.map(async (owner) => {
          const fields = await resolveGlobalFields(owner, fieldDefinitionsService);
          return [owner, fields] as const;
        })
      )
    );

    await Promise.all(
      casesToUpdate.map(({ updateReq, originalCase }) =>
        validateExtendedFieldsInRequest({
          updateReq,
          originalCase,
          templatesService,
          globalFields: globalFieldsByOwner.get(originalCase.attributes.owner) ?? [],
        })
      )
    );

    const patchCasesPayload = createPatchCasesPayload({
      user,
      casesToUpdate,
      customFieldsConfigurationMap,
    });
    let userActionsDict = userActionService.creator.buildUserActions({
      updatedCases: patchCasesPayload,
      user,
    });

    await throwIfMaxUserActionsReached({ userActionsDict, userActionService });
    notifyPlatinumUsage(licensingService, casesToUpdate);

    const updatedCases = await patchCases({ caseService, patchCasesPayload });

    // If a status update occurred and the case is synced then we need to update all alerts' status
    // attached to the case to the new status.
    const casesWithStatusChangedAndSynced = casesToUpdate.filter(({ updateReq, originalCase }) => {
      return (
        originalCase != null &&
        updateReq.status != null &&
        originalCase.attributes.status !== updateReq.status &&
        originalCase.attributes.settings.syncAlerts
      );
    });

    // If syncAlerts setting turned on we need to update all alerts' status
    // attached to the case to the current status.
    const casesWithSyncSettingChangedToOn = casesToUpdate.filter(({ updateReq, originalCase }) => {
      return (
        originalCase != null &&
        updateReq.settings?.syncAlerts != null &&
        originalCase.attributes.settings.syncAlerts !== updateReq.settings.syncAlerts &&
        updateReq.settings.syncAlerts
      );
    });

    // Update the alert's status to match any case status or sync settings changes
    const syncedAlertCountCountByCaseId = await updateAlerts({
      casesWithStatusChangedAndSynced,
      casesWithSyncSettingChangedToOn,
      caseService,
      alertsService,
      isCasesAttachmentsEnabled,
    });

    userActionsDict = userActionService.creator.addSyncedAlertsCountToUserActions({
      userActionsDict,
      syncedAlertCountCountByCaseId,
    });

    const commentsMap = await attachmentService.getter.getCaseAttatchmentStats({
      caseIds,
    });

    const returnUpdatedCase = updatedCases.saved_objects.reduce<CasesPatchResponse>(
      (flattenCases, updatedCase) => {
        const originalCase = casesMap.get(updatedCase.id);

        if (!originalCase) {
          return flattenCases;
        }

        const {
          userComments: totalComment,
          alerts: totalAlerts,
          events: totalEvents,
        } = commentsMap.get(updatedCase.id) ?? {
          userComments: 0,
          alerts: 0,
          events: 0,
        };

        const syncedAlertCount = syncedAlertCountCountByCaseId.get(updatedCase.id) ?? 0;
        const updatedCaseWithStats: CaseWithUpdateSummary = {
          ...flattenCaseSavedObject({
            savedObject: mergeOriginalSOWithUpdatedSO(originalCase, updatedCase),
            totalComment,
            totalAlerts,
            totalEvents,
          }),
          ...(syncedAlertCount > 0 ? { updateSummary: { syncedAlertCount } } : {}),
        };

        flattenCases.push(updatedCaseWithStats);
        return flattenCases;
      },
      []
    );

    const builtUserActions =
      userActionsDict != null
        ? Object.values(userActionsDict).reduce<UserActionEvent[]>((acc, userActions) => {
            acc.push(...userActions);
            return acc;
          }, [])
        : [];

    await userActionService.creator.bulkCreateUpdateCase({
      builtUserActions,
    });

    const casesAndAssigneesToNotifyForAssignment = getCasesAndAssigneesToNotifyForAssignment(
      updatedCases,
      casesMap,
      user
    );

    await notificationService.bulkNotifyAssignees(casesAndAssigneesToNotifyForAssignment);

    const updatedCasesResponse = decodeOrThrow(PatchCasesResponseRt)(returnUpdatedCase);
    const updatedFieldsByCaseId = casesToUpdate.reduce<Map<string, string[]>>(
      (acc, { updateReq }) => {
        // Keep first occurrence for duplicate ids handling.
        if (acc.has(updateReq.id)) {
          return acc;
        }

        const { id, version, ...restFields } = updateReq;
        const updatedFields = Object.keys(restFields);
        if (updatedFields.length > 0) {
          acc.set(updateReq.id, updatedFields);
        }

        return acc;
      },
      new Map()
    );

    for (const updatedCase of updatedCasesResponse) {
      const updatedFields = updatedFieldsByCaseId.get(updatedCase.id);
      clientArgs.casesEventBus?.emitCaseUpdated(
        clientArgs.request,
        {
          caseId: updatedCase.id,
          owner: updatedCase.owner as Owner,

          ...(updatedFields != null ? { updatedFields } : {}),
        },
        { previousCase: casesMap.get(updatedCase.id), updatedCase }
      );
    }

    return updatedCasesResponse;
  } catch (error) {
    const idVersions = cases.cases.map((caseInfo) => ({
      id: caseInfo.id,
      version: caseInfo.version,
    }));

    throw createCaseError({
      message: `Failed to update case, ids: ${JSON.stringify(idVersions)}: ${error}`,
      error,
      logger,
    });
  }
};

const normalizeCaseAttributes = (
  updateCaseAttributes: Omit<
    CasePatchRequest,
    'id' | 'version' | 'owner' | 'assignees' | 'closeReason'
  >,
  customFieldsConfiguration?: CustomFieldsConfiguration
) => {
  let trimmedAttributes = { ...updateCaseAttributes };

  if (updateCaseAttributes.title) {
    trimmedAttributes = { ...trimmedAttributes, title: updateCaseAttributes.title.trim() };
  }

  if (updateCaseAttributes.description) {
    trimmedAttributes = {
      ...trimmedAttributes,
      description: updateCaseAttributes.description.trim(),
    };
  }

  if (updateCaseAttributes.category) {
    trimmedAttributes = { ...trimmedAttributes, category: updateCaseAttributes.category.trim() };
  }

  if (updateCaseAttributes.tags) {
    trimmedAttributes = {
      ...trimmedAttributes,
      tags: updateCaseAttributes.tags.map((tag: string) => tag.trim()),
    };
  }

  if (updateCaseAttributes.customFields) {
    trimmedAttributes = {
      ...trimmedAttributes,
      customFields: fillMissingCustomFields({
        customFields: updateCaseAttributes.customFields,
        customFieldsConfiguration,
      }),
    };
  }

  return trimmedAttributes;
};

const createPatchCasesPayload = ({
  casesToUpdate,
  user,
  customFieldsConfigurationMap,
}: {
  casesToUpdate: UpdateRequestWithOriginalCase[];
  user: User;
  customFieldsConfigurationMap: Map<string, CustomFieldsConfiguration>;
}): PatchCasesArgs => {
  const updatedDt = new Date().toISOString();

  return {
    cases: casesToUpdate.map(({ updateReq, originalCase }) => {
      // intentionally removing owner and closeReason from the case so that we don't accidentally allow it to be updated
      const {
        id: caseId,
        version,
        owner,
        assignees,
        closeReason: _closeReason,
        ...updateCaseAttributes
      } = updateReq;

      const dedupedAssignees = dedupAssignees(assignees);

      const trimmedCaseAttributes = normalizeCaseAttributes(
        updateCaseAttributes,
        customFieldsConfigurationMap.get(originalCase.attributes.owner)
      );

      // Merge incoming extended_fields on top of existing so that concurrent saves
      // from GlobalCaseFields and TemplateFields (two independent form instances)
      // don't clobber each other's values.
      //
      // Intentional: ALL existing keys are preserved — including any template-specific
      // keys that remain on the SO after a template is cleared. Orphaned keys are
      // harmless: the UI only renders fields that have a matching definition, and
      // validation rejects future writes of non-global keys without a template.
      // Preserving them also allows values to survive a template re-application.
      if (
        trimmedCaseAttributes.extended_fields &&
        typeof trimmedCaseAttributes.extended_fields === 'object'
      ) {
        trimmedCaseAttributes.extended_fields = {
          ...(originalCase.attributes.extended_fields ?? {}),
          ...trimmedCaseAttributes.extended_fields,
        };
      }

      return {
        caseId,
        originalCase,
        closeReason: updateReq.closeReason,
        updatedAttributes: {
          ...trimmedCaseAttributes,
          ...(dedupedAssignees && { assignees: dedupedAssignees }),
          ...getClosedInfoForUpdate({
            user,
            closedDate: updatedDt,
            status: trimmedCaseAttributes.status,
          }),
          ...getDurationForUpdate({
            status: trimmedCaseAttributes.status,
            closedAt: updatedDt,
            createdAt: originalCase.attributes.created_at,
          }),
          ...getInProgressInfoForUpdate({
            status: trimmedCaseAttributes.status,
            stateTransitionTimestamp: updatedDt,
            inProgressAt: originalCase.attributes.in_progress_at,
          }),
          ...getTimingMetricsForUpdate({
            status: trimmedCaseAttributes.status,
            stateTransitionTimestamp: updatedDt,
            createdAt: originalCase.attributes.created_at,
            inProgressAt: originalCase.attributes.in_progress_at,
          }),
          updated_at: updatedDt,
          updated_by: user,
        },
        version,
      };
    }),
    refresh: false,
  };
};

const patchCases = async ({
  caseService,
  patchCasesPayload,
}: {
  caseService: CasesService;
  patchCasesPayload: PatchCasesArgs;
}) => {
  return caseService.patchCases(patchCasesPayload);
};

const getCasesAndAssigneesToNotifyForAssignment = (
  updatedCases: SavedObjectsBulkUpdateResponse<CaseAttributes>,
  casesMap: Map<string, CaseSavedObjectTransformed>,
  user: CasesClientArgs['user']
) => {
  return updatedCases.saved_objects.reduce<
    Array<{ assignees: CaseAssignees; theCase: CaseSavedObjectTransformed }>
  >((acc, updatedCase) => {
    const originalCaseSO = casesMap.get(updatedCase.id);

    if (!originalCaseSO) {
      return acc;
    }

    const alreadyAssignedToCase = originalCaseSO.attributes.assignees;
    const comparedAssignees = arraysDifference(
      alreadyAssignedToCase,
      updatedCase.attributes.assignees ?? []
    );

    if (comparedAssignees && comparedAssignees.addedItems.length > 0) {
      const theCase = mergeOriginalSOWithUpdatedSO(originalCaseSO, updatedCase);

      const assigneesWithoutCurrentUser = comparedAssignees.addedItems.filter(
        (assignee) => assignee.uid !== user.profile_uid
      );

      acc.push({ theCase, assignees: assigneesWithoutCurrentUser });
    }

    return acc;
  }, []);
};

const mergeOriginalSOWithUpdatedSO = (
  originalSO: CaseSavedObjectTransformed,
  updatedSO: SavedObjectsUpdateResponse<CaseAttributes>
): CaseSavedObjectTransformed => {
  return {
    ...originalSO,
    ...updatedSO,
    attributes: { ...originalSO.attributes, ...updatedSO?.attributes },
    references: updatedSO.references ?? originalSO.references,
    version: updatedSO?.version ?? updatedSO.version,
  };
};
