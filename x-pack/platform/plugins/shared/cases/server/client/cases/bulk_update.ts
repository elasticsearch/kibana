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
import { isSavedObjectErrorResult } from '@kbn/core/server';
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
  isDetectionAttachmentType,
  UNIFIED_DETECTION_TYPES_ARRAY,
} from '../../../common/utils/attachments';
import { getCaseToUpdate, buildFilter, combineFilters, NodeBuilderOperators } from '../utils';
import {
  applyProfilesToAssignees,
  dedupAssignees,
  fillMissingCustomFields,
  getCloseReasonIfValid,
  getClosedInfoForUpdate,
  getDurationForUpdate,
  getInProgressInfoForUpdate,
  getTimingMetricsForUpdate,
  getUserProfilesSafe,
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
  validateCaseExtendedFields,
  validateExtendedFieldsInRequest,
  validateExtendedFieldsOnClose,
  resolveTemplateFieldsForClose,
  resolveGlobalFields,
} from './validators';
import type { InlineField } from '../../../common/types/domain/template/fields';
import type { TemplatesService } from '../../services/templates';
import type { FieldDefinitionsService } from '../../services/field_definitions';
import { emptyCasesAssigneesSanitizer } from './sanitizers';
import {
  loadFieldLinkIndexes,
  logUnresolvedMirrorKeys,
  throwIfMalformedFieldLinkage,
} from '../../common/utils/mirror_custom_fields';
import type { ActiveLinkMaps } from '../../common/utils/pair_field_representations';
import {
  buildActiveLinkMaps,
  incrementPairedWriteCounter,
  pairUpdatedCaseFields,
  throwIfFieldRepresentationConflicts,
  throwIfInvalidLinkedFieldValues,
} from '../../common/utils/pair_field_representations';
import {
  APPLY_TEMPLATE_COUNTER,
  CLEAR_TEMPLATE_COUNTER,
  incrementCasesClientCounter,
} from '../usage_counters';
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
 * Gets all the detection comments (legacy alerts, unified alerts and attacks) for the
 * requested cases. Attacks are included because their documents carry the same
 * `kibana.alert.workflow_status` field the status sync writes.
 */
async function getAlertComments({
  casesToSync,
  caseService,
}: {
  casesToSync: UpdateRequestWithOriginalCase[];
  caseService: CasesService;
}): Promise<SavedObjectsFindResponse<AttachmentAttributes>> {
  const idsOfCasesToSync = casesToSync.map(({ updateReq }) => updateReq.id);

  const legacyAlertFilter = nodeBuilder.is(
    `${CASE_COMMENT_SAVED_OBJECT}.attributes.type`,
    AttachmentType.alert
  );

  const alertFilter = combineFilters(
    [
      legacyAlertFilter,
      buildFilter({
        filters: UNIFIED_DETECTION_TYPES_ARRAY,
        field: 'type',
        operator: 'or',
        type: CASE_ATTACHMENT_SAVED_OBJECT,
      }),
    ],
    NodeBuilderOperators.or
  );

  return (await caseService.getAllCaseComments({
    id: idsOfCasesToSync,
    options: {
      filter: alertFilter,
    },
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
}: {
  casesWithSyncSettingChangedToOn: UpdateRequestWithOriginalCase[];
  casesWithStatusChangedAndSynced: UpdateRequestWithOriginalCase[];
  caseService: CasesService;
  alertsService: AlertService;
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
  });

  const alertsToUpdateByCaseId = totalAlerts.saved_objects.reduce(
    (acc: Map<string, UpdateAlertStatusRequest[]>, alertComment) => {
      if (isDetectionAttachmentType(alertComment.attributes.type)) {
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
          isSupportedType: isDetectionAttachmentType,
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

/**
 * Fields that are allowed to be present when users reopen cases
 */
const REOPEN_ONLY_CASE_FIELDS = new Set(['id', 'version', 'status']);

/**
 * Fields that are allowed to be present when case is reassigned
 */
const ASSIGN_ONLY_CASE_FIELDS = new Set(['id', 'version', 'assignees']);

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
    reopenedCases.length === 0 &&
    changedAssignees.length === allCases.length &&
    changedAssignees.every((caseReq) =>
      Object.keys(caseReq).every((key) => ASSIGN_ONLY_CASE_FIELDS.has(key))
    );
  const onlyReopenOperations =
    changedAssignees.length === 0 &&
    reopenedCases.length === allCases.length &&
    reopenedCases.every((caseReq) =>
      Object.keys(caseReq).every((key) => REOPEN_ONLY_CASE_FIELDS.has(key))
    );

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
 * Counts the cases that had a template applied or cleared, once per case.
 *
 * A `template` key only survives into `updateReq` when it differs from the case's current
 * template, so re-sending an unchanged one is not an apply. Restricted to the cases that actually
 * persisted, since a bulk update can partially fail, and deduped by id so a request repeating a
 * case id counts that case once, keeping the first change as `updatedFieldsByCaseId` does.
 */
const countTemplateChanges = (
  casesToUpdate: UpdateRequestWithOriginalCase[],
  persistedCaseIds: Set<string>
): {
  appliedCases: number;
  clearedCases: number;
  casesPerTemplateId: Map<string, number>;
} => {
  const countedCaseIds = new Set<string>();
  const casesPerTemplateId = new Map<string, number>();
  let appliedCases = 0;
  let clearedCases = 0;

  for (const { updateReq } of casesToUpdate) {
    const { id, template } = updateReq;
    const isCountable =
      template !== undefined && persistedCaseIds.has(id) && !countedCaseIds.has(id);

    if (isCountable) {
      countedCaseIds.add(id);

      if (template === null) {
        clearedCases += 1;
      } else {
        appliedCases += 1;
        casesPerTemplateId.set(template.id, (casesPerTemplateId.get(template.id) ?? 0) + 1);
      }
    }
  }

  return { appliedCases, clearedCases, casesPerTemplateId };
};

/**
 * Adds the cases that just received a template to each template's usage tally.
 *
 * Best effort: the tally is a display concern, so a failure is logged and swallowed rather than
 * failing an update whose cases are already persisted.
 */
const incrementTemplateUsageStats = async (
  casesPerTemplateId: Map<string, number>,
  templatesService: TemplatesService,
  logger: CasesClientArgs['logger']
): Promise<void> => {
  await Promise.allSettled(
    [...casesPerTemplateId].map(async ([templateId, caseCount]) => {
      try {
        await templatesService.incrementUsageStats(templateId, caseCount);
      } catch (error) {
        logger.warn(`Failed to update template usage stats for template ${templateId}: ${error}`);
      }
    })
  );
};

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
  } = clientArgs;

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
    // Owners are collected for both cases that include extended_fields in the request and
    // cases that are transitioning to closed (close-time validation needs the global fields
    // even when the request does not include extended_fields).
    const uniqueOwnersNeedingFields = [
      ...casesToUpdate.reduce((owners, { updateReq, originalCase }) => {
        const isBeingClosed =
          updateReq.status === CaseStatuses.closed &&
          originalCase.attributes.status !== CaseStatuses.closed;
        if (updateReq.extended_fields || isBeingClosed) owners.add(originalCase.attributes.owner);
        return owners;
      }, new Set<string>()),
    ];
    const globalFieldsByOwner = new Map(
      await Promise.all(
        uniqueOwnersNeedingFields.map(async (owner) => {
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
          fieldDefinitionsService,
          globalFields: globalFieldsByOwner.get(originalCase.attributes.owner) ?? [],
        })
      )
    );

    // Pre-resolve template fields for cases transitioning to closed.
    // Deduplicates SO fetches: N cases sharing the same (template id, version) pair issue only one getTemplate call.
    const getEffectiveTemplate = (
      updateReq: CasePatchRequest,
      originalCase: CaseSavedObjectTransformed
    ): { id: string; version: number } | null => {
      if (updateReq.template === null) return null;
      if (updateReq.template != null) {
        return { id: updateReq.template.id, version: updateReq.template.version };
      }
      const t = originalCase.attributes.template;
      return t != null ? { id: t.id, version: t.version } : null;
    };

    // Deduplicate by "id@version" so different versions of the same template are fetched separately.
    const closingCasesTemplates = [
      ...new Map(
        casesToUpdate
          .filter(
            ({ updateReq, originalCase }) =>
              updateReq.status === CaseStatuses.closed &&
              originalCase.attributes.status !== CaseStatuses.closed
          )
          .map(({ updateReq, originalCase }) => getEffectiveTemplate(updateReq, originalCase))
          .filter((t): t is { id: string; version: number } => t != null)
          .map((t) => [`${t.id}@${t.version}`, t] as const)
      ).values(),
    ];
    const templateFieldsByKey = new Map<string, InlineField[]>(
      await Promise.all(
        closingCasesTemplates.map(async ({ id, version }) => {
          const fields = await resolveTemplateFieldsForClose({
            templateId: id,
            templateVersion: version,
            templatesService,
            fieldDefinitionsService,
            logger,
          });
          return [`${id}@${version}`, fields] as [string, InlineField[]];
        })
      )
    );

    // Preload per-owner active-link maps for the customFields ⇄ extended_fields
    // pairing adapter. Only owners with at least one update touching either
    // representation pay the (bounded) definitions fetch. Pairing for existing
    // links runs independently of the templates feature flag (addendum A1).
    const linkMapsByOwner = new Map<string, ActiveLinkMaps>();
    const ownersNeedingLinks = [
      ...new Set(
        casesToUpdate
          .filter(
            ({ updateReq }) => updateReq.customFields?.length || updateReq.extended_fields != null
          )
          .map(({ originalCase }) => originalCase.attributes.owner)
      ),
    ];
    for (const ownerNeedingLinks of ownersNeedingLinks) {
      const indexes = await loadFieldLinkIndexes(ownerNeedingLinks, fieldDefinitionsService);
      linkMapsByOwner.set(
        ownerNeedingLinks,
        buildActiveLinkMaps(customFieldsConfigurationMap.get(ownerNeedingLinks) ?? [], indexes)
      );
    }

    const patchCasesPayload = await createPatchCasesPayload({
      user,
      casesToUpdate,
      customFieldsConfigurationMap,
      linkMapsByOwner,
      logger,
      usageCounter: clientArgs.usageCounter,
      templatesService,
      fieldDefinitionsService,
      globalFieldsByOwner,
    });

    // Close-time required_on_close check must run against the exact extended_fields map that
    // will be persisted. `updatedAttributes.extended_fields`, when present, is that map: it is
    // the complete post-merge, post-pairing state (a key deleted by pairing — e.g. a linked
    // field cleared via customFields or via an empty-string extended_fields entry — is absent
    // from it and must read as empty). When absent, the update did not touch extended_fields
    // through either representation, so the persisted state is the original map merged with the
    // raw request delta (the delta is nil here; the merge keeps the fallback explicit).
    // `patchCasesPayload.cases` is produced by mapping `casesToUpdate` 1:1 in order, so the two
    // arrays are index-aligned.
    casesToUpdate.forEach(({ updateReq, originalCase }, index) => {
      const effectiveTemplate = getEffectiveTemplate(updateReq, originalCase);
      const templateKey =
        effectiveTemplate != null ? `${effectiveTemplate.id}@${effectiveTemplate.version}` : null;
      const finalExtendedFields = patchCasesPayload.cases[index].updatedAttributes
        .extended_fields ?? {
        ...(originalCase.attributes.extended_fields ?? {}),
        ...(updateReq.extended_fields ?? {}),
      };
      validateExtendedFieldsOnClose({
        caseId: updateReq.id,
        requestedStatus: updateReq.status,
        originalStatus: originalCase.attributes.status,
        finalExtendedFields,
        templateFields: templateKey != null ? templateFieldsByKey.get(templateKey) ?? [] : [],
        globalFields: globalFieldsByOwner.get(originalCase.attributes.owner) ?? [],
      });
    });

    // Resolve names of newly-applied templates so the "applied template" user action records the
    // name (durable in the audit trail). Only templates being set on this update; deduped by
    // "id@version" because template names can change across versions and the recorded name must be a
    // point-in-time snapshot of the exact version applied (not the current latest).
    const appliedTemplates = [
      ...new Map(
        casesToUpdate
          .map(({ updateReq }) => updateReq.template)
          .filter((t): t is NonNullable<typeof t> => t != null)
          .map((t) => [`${t.id}@${t.version}`, t] as const)
      ).values(),
    ];
    const templateNamesByKey = new Map<string, string>(
      (
        await Promise.all(
          appliedTemplates.map(async ({ id, version }) => {
            const templateSO = await templatesService.getTemplate(id, String(version));
            return templateSO
              ? ([`${id}@${version}`, templateSO.attributes.name] as [string, string])
              : null;
          })
        )
      ).filter((entry): entry is [string, string] => entry != null)
    );

    let userActionsDict = userActionService.creator.buildUserActions({
      updatedCases: patchCasesPayload,
      user,
      templateNamesByKey,
    });

    await throwIfMaxUserActionsReached({ userActionsDict, userActionService });
    notifyPlatinumUsage(licensingService, casesToUpdate);

    // Server-derived assignee identity, gated by feature flag `assigneeIdentity`
    if (clientArgs.config.assigneeIdentity.enabled) {
      const allUids = new Set(
        patchCasesPayload.cases.flatMap(
          ({ updatedAttributes }) => updatedAttributes.assignees?.map(({ uid }) => uid) ?? []
        )
      );

      if (allUids.size > 0) {
        const profiles = await getUserProfilesSafe(clientArgs.securityStartPlugin, allUids, logger);

        if (profiles) {
          for (const patchCase of patchCasesPayload.cases) {
            const { assignees } = patchCase.updatedAttributes;
            if (assignees && assignees.length > 0) {
              patchCase.updatedAttributes.assignees = applyProfilesToAssignees(assignees, profiles);
            }
          }
        }
      }
    }

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

        if (!originalCase || isSavedObjectErrorResult(updatedCase)) {
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

    const { appliedCases, clearedCases, casesPerTemplateId } = countTemplateChanges(
      casesToUpdate,
      new Set(updatedCasesResponse.map(({ id }) => id))
    );

    incrementCasesClientCounter(clientArgs, APPLY_TEMPLATE_COUNTER, appliedCases);
    incrementCasesClientCounter(clientArgs, CLEAR_TEMPLATE_COUNTER, clearedCases);

    await incrementTemplateUsageStats(casesPerTemplateId, templatesService, logger);

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

const createPatchCasesPayload = async ({
  casesToUpdate,
  user,
  customFieldsConfigurationMap,
  linkMapsByOwner,
  logger,
  usageCounter,
  templatesService,
  fieldDefinitionsService,
  globalFieldsByOwner,
}: {
  casesToUpdate: UpdateRequestWithOriginalCase[];
  user: User;
  customFieldsConfigurationMap: Map<string, CustomFieldsConfiguration>;
  linkMapsByOwner: Map<string, ActiveLinkMaps>;
  logger: CasesClientArgs['logger'];
  usageCounter: CasesClientArgs['usageCounter'];
  templatesService: TemplatesService;
  fieldDefinitionsService: FieldDefinitionsService;
  /** Per-owner (isGlobal) field-definition cache; populated lazily for owners not pre-resolved by the caller. */
  globalFieldsByOwner: Map<string, InlineField[]>;
}): Promise<PatchCasesArgs> => {
  const updatedDt = new Date().toISOString();

  // Concurrent callers for the same not-yet-cached owner (this runs per-case under the
  // `Promise.all` below) must await the SAME fetch rather than each racing to see an empty
  // `globalFieldsByOwner` and issuing their own — otherwise N cases sharing one owner cost
  // N queries instead of 1. Caching the in-flight promise (not just the resolved value)
  // closes that window.
  const globalFieldsFetchesInFlight = new Map<string, Promise<InlineField[]>>();

  const resolveCachedGlobalFields = async (owner: string): Promise<InlineField[]> => {
    const cached = globalFieldsByOwner.get(owner);
    if (cached) {
      return cached;
    }
    let inFlight = globalFieldsFetchesInFlight.get(owner);
    if (!inFlight) {
      inFlight = resolveGlobalFields(owner, fieldDefinitionsService);
      globalFieldsFetchesInFlight.set(owner, inFlight);
    }
    const globalFields = await inFlight;
    globalFieldsByOwner.set(owner, globalFields);
    return globalFields;
  };

  const cases = await Promise.all(
    casesToUpdate.map(async ({ updateReq, originalCase }) => {
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

      // Pair the two representations of every linked field the request touches
      // (customFields ⇄ extended_fields) so one case write persists a consistent
      // pair. Runs whenever the update includes either representation — an
      // update touching neither must not change either map.
      //
      // Pass the RAW request values (updateCaseAttributes.customFields and
      // updateReq.extended_fields), never post-fill / post-merge derivatives:
      // fillMissingCustomFields pads absent optional-no-default fields with
      // { key, value: null }, and the PATCH merge above folds existing keys into
      // the map — both would otherwise be mistaken for explicit caller intent
      // and clear or conflict with values the update never touched.
      //
      // Explicit conflicting dual input rejects with a structured 400; malformed
      // linkage rejects with a structured 400; codec failures reject with a 400;
      // unresolved fields are skipped with a diagnostic. Same-reference results
      // mean "unchanged" — guard on reference inequality to avoid spurious
      // writes/user-actions.
      const links = linkMapsByOwner.get(originalCase.attributes.owner);
      let pairedStorageKeys: Record<string, string> | undefined;
      if (
        links !== undefined &&
        (updateCaseAttributes.customFields || updateCaseAttributes.extended_fields)
      ) {
        const baseCustomFields =
          trimmedCaseAttributes.customFields ?? originalCase.attributes.customFields ?? [];
        const baseExtendedFields =
          trimmedCaseAttributes.extended_fields ?? originalCase.attributes.extended_fields;
        const paired = pairUpdatedCaseFields({
          requestCustomFields: updateCaseAttributes.customFields,
          requestExtendedFields: updateCaseAttributes.extended_fields as
            | Record<string, unknown>
            | undefined,
          baseCustomFields,
          baseExtendedFields,
          links,
        });
        throwIfMalformedFieldLinkage(paired.malformedFields);
        throwIfFieldRepresentationConflicts(paired.conflictFields, usageCounter);
        throwIfInvalidLinkedFieldValues(paired.invalidValues);
        logUnresolvedMirrorKeys(paired.unresolvedKeys, {
          owner: originalCase.attributes.owner,
          logger,
        });
        const extendedFieldsChanged =
          paired.extendedFields !== baseExtendedFields && paired.extendedFields != null;
        const customFieldsChanged =
          paired.customFields !== undefined && paired.customFields !== baseCustomFields;
        if (extendedFieldsChanged) {
          const finalExtendedFields = paired.extendedFields as Record<string, string>;

          // Definition-aware validation of the FINAL map, matching create.ts/bulk_create.ts:
          // pairing-derived values must also be valid keys with valid values against the
          // linked definition. `partial: true` — pairing never makes an absent field
          // "required-missing".
          const templateId =
            updateReq.template === null
              ? null
              : updateReq.template?.id ?? originalCase.attributes.template?.id;
          const globalFields = await resolveCachedGlobalFields(originalCase.attributes.owner);
          await validateCaseExtendedFields({
            extendedFields: finalExtendedFields,
            templateId,
            globalFields,
            templatesService,
            fieldDefinitionsService,
            owner: originalCase.attributes.owner,
            partial: true,
          });

          trimmedCaseAttributes.extended_fields = finalExtendedFields;
        }
        if (customFieldsChanged) {
          // Values were decoded through the per-type codecs, so they satisfy the
          // customFields union even though the adapter is structurally typed.
          trimmedCaseAttributes.customFields =
            paired.customFields as unknown as CaseAttributes['customFields'];
        }
        if (Object.keys(paired.pairedKeyToStorageKey).length > 0) {
          pairedStorageKeys = paired.pairedKeyToStorageKey;
        }
        incrementPairedWriteCounter(
          usageCounter,
          paired,
          extendedFieldsChanged || customFieldsChanged
        );
      }

      return {
        caseId,
        originalCase,
        closeReason: updateReq.closeReason,
        ...(pairedStorageKeys !== undefined && {
          pairedCustomFieldStorageKeys: pairedStorageKeys,
        }),
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
    })
  );

  return {
    cases,
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

    if (!originalCaseSO || isSavedObjectErrorResult(updatedCase)) {
      return acc;
    }

    // Compare by uid, not object identity: server-derived identity fields make an enriched
    // assignee unequal to the legacy uid-only record, so a deep diff would flag every retained
    // assignee on a pre-rollout case as newly added and re-notify them.
    const alreadyAssignedUids = new Set(originalCaseSO.attributes.assignees.map(({ uid }) => uid));
    const addedAssignees = (updatedCase.attributes.assignees ?? []).filter(
      ({ uid }) => !alreadyAssignedUids.has(uid)
    );

    if (addedAssignees.length > 0) {
      const theCase = mergeOriginalSOWithUpdatedSO(originalCaseSO, updatedCase);

      const assigneesWithoutCurrentUser = addedAssignees.filter(
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
