/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, uniqBy } from 'lodash';
import type { UserProfile } from '@kbn/security-plugin/common';
import type { IBasePath } from '@kbn/core-http-browser';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { v4 } from 'uuid';
import type { SavedObject } from '@kbn/core/server';
import type {
  ActionConnector,
  AttachmentV2,
  Case,
  CaseAssignees,
  CaseAttributes,
  CaseCustomField,
  ConnectorMappings,
  ConnectorMappingSource,
  ConnectorMappingTarget,
  CustomFieldsConfiguration,
  ExternalService,
  Observable,
  User,
} from '../../../common/types/domain';
import type { Template } from '../../../common/types/domain/template/latest';
import { AttachmentType, CaseStatuses, UserActionTypes } from '../../../common/types/domain';
import type {
  AttachmentRequestV2,
  CasePostRequest,
  CaseRequestCustomFields,
  CaseUserActionsDeprecatedResponse,
  ObservablePost,
} from '../../../common/types/api';
import { CASE_VIEW_PAGE_TABS } from '../../../common/types';
import { isPushedUserAction } from '../../../common/utils/user_actions';
import type { CasesClientGetAlertsResponse } from '../alerts/types';
import type { ExternalServiceComment, ExternalServiceIncident } from './types';
import type { CasesConnectorsMap } from '../../connectors';
import { getCaseViewPath } from '../../common/utils';
import {
  isCommentAttachmentType,
  isLegacyAttachmentRequest,
  isUnifiedAlertAttachment,
  toStringArray,
} from '../../../common/utils/attachments';
import { COMMENT_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import * as i18n from './translations';

interface CreateIncidentArgs {
  theCase: Case;
  userActions: CaseUserActionsDeprecatedResponse;
  connector: ActionConnector;
  alerts: CasesClientGetAlertsResponse;
  casesConnectors: CasesConnectorsMap;
  spaceId: string;
  userProfiles?: Map<string, UserProfile>;
  publicBaseUrl?: IBasePath['publicBaseUrl'];
}

export const dedupAssignees = (assignees?: CaseAssignees): CaseAssignees | undefined => {
  if (assignees == null) {
    return;
  }

  return uniqBy(assignees, 'uid');
};

export const getCloseReasonIfValid = (closeReason?: string): string | undefined =>
  closeReason != null && closeReason.trim().length > 0 ? closeReason : undefined;

type LatestPushInfo = { index: number; pushedInfo: ExternalService | null } | null;

export const getLatestPushInfo = (
  connectorId: string,
  userActions: CaseUserActionsDeprecatedResponse
): LatestPushInfo => {
  for (const [index, action] of [...userActions].reverse().entries()) {
    if (isPushedUserAction(action) && connectorId === action.payload.externalService.connector_id) {
      try {
        const pushedInfo = action.payload.externalService;
        // We returned the index of the element in the userActions array.
        // As we traverse the userActions in reverse we need to calculate the index of a normal traversal
        return {
          index: userActions.length - index - 1,
          pushedInfo,
        };
      } catch (e) {
        // ignore parse failures and check the next user action
      }
    }
  }

  return null;
};

/**
 * Returns the body text for a comment pushed to an external incident system
 * (ServiceNow, Jira, Resilient, Swimlane).
 */
const getCommentContent = (comment: AttachmentV2): string => {
  if (isLegacyAttachmentRequest(comment) && comment.type === AttachmentType.user) {
    return comment.comment;
  }

  if (comment.type === COMMENT_ATTACHMENT_TYPE && 'data' in comment) {
    const content = comment.data?.content;
    return typeof content === 'string' ? content : '';
  }

  return '';
};

interface CountAlertsInfo {
  totalComments: number;
  pushed: number;
  totalAlerts: number;
}

// Returns the number of alert ids on the attachment, or `null` when the
// attachment is not an alert
const countAlertIds = (comment: AttachmentV2): number | null => {
  if (isLegacyAttachmentRequest(comment) && comment.type === AttachmentType.alert) {
    return toStringArray(comment.alertId).length;
  }
  const asRequest = comment as AttachmentRequestV2;
  if (isUnifiedAlertAttachment(asRequest)) {
    return toStringArray(asRequest.attachmentId).length;
  }
  return null;
};

const getAlertsInfo = (
  comments: Case['comments']
): { totalAlerts: number; hasUnpushedAlertComments: boolean } => {
  const countingInfo = { totalComments: 0, pushed: 0, totalAlerts: 0 };

  const res =
    comments?.reduce<CountAlertsInfo>(({ totalComments, pushed, totalAlerts }, comment) => {
      const alertIdCount = countAlertIds(comment);
      if (alertIdCount === null) {
        return { totalComments, pushed, totalAlerts };
      }

      return {
        totalComments: totalComments + 1,
        pushed: comment.pushed_at != null ? pushed + 1 : pushed,
        totalAlerts: totalAlerts + alertIdCount,
      };
    }, countingInfo) ?? countingInfo;

  return {
    totalAlerts: res.totalAlerts,
    hasUnpushedAlertComments: res.totalComments > res.pushed,
  };
};

const addAlertMessage = (params: {
  theCase: Case;
  externalServiceComments: ExternalServiceComment[];
  spaceId: string;
  publicBaseUrl?: IBasePath['publicBaseUrl'];
}): ExternalServiceComment[] => {
  const { theCase, externalServiceComments, spaceId, publicBaseUrl } = params;
  const { totalAlerts, hasUnpushedAlertComments } = getAlertsInfo(theCase.comments);

  const newComments = [...externalServiceComments];

  if (hasUnpushedAlertComments) {
    let comment = `Elastic Alerts attached to the case: ${totalAlerts}`;

    if (publicBaseUrl) {
      const alertsTableUrl = getCaseViewPath({
        publicBaseUrl,
        spaceId,
        caseId: theCase.id,
        owner: theCase.owner,
        tabId: CASE_VIEW_PAGE_TABS.ALERTS,
      });

      comment = `${comment}\n\n${i18n.VIEW_ALERTS_IN_KIBANA}\n${i18n.ALERTS_URL(alertsTableUrl)}`;
    }

    newComments.push({
      comment,
      commentId: `${theCase.id}-total-alerts`,
    });
  }

  return newComments;
};

export const createIncident = async ({
  theCase,
  userActions,
  connector,
  alerts,
  casesConnectors,
  userProfiles,
  spaceId,
  publicBaseUrl,
}: CreateIncidentArgs): Promise<ExternalServiceIncident> => {
  const latestPushInfo = getLatestPushInfo(connector.id, userActions);
  const externalId = latestPushInfo?.pushedInfo?.external_id ?? null;

  const externalServiceFields =
    casesConnectors.get(connector.actionTypeId)?.format(theCase, alerts) ?? {};

  const connectorMappings = casesConnectors.get(connector.actionTypeId)?.getMapping() ?? [];
  const descriptionWithKibanaInformation = addKibanaInformationToDescription(
    theCase,
    spaceId,
    userProfiles,
    publicBaseUrl
  );

  const comments = formatComments({
    userActions,
    latestPushInfo,
    theCase,
    userProfiles,
    spaceId,
    publicBaseUrl,
  });

  const mappedIncident = mapCaseFieldsToExternalSystemFields(
    { title: theCase.title, description: descriptionWithKibanaInformation },
    connectorMappings
  );

  const incident = {
    ...mappedIncident,
    ...externalServiceFields,
    externalId,
  };
  return { incident, comments };
};

export const mapCaseFieldsToExternalSystemFields = (
  caseFields: Record<Exclude<ConnectorMappingSource, 'comments' | 'tags'>, unknown>,
  mapping: ConnectorMappings
): Record<ConnectorMappingTarget, unknown> => {
  const mappedCaseFields: Record<ConnectorMappingTarget, unknown> = {};

  for (const caseFieldKey of Object.keys(caseFields) as Array<
    Exclude<ConnectorMappingSource, 'comments' | 'tags'>
  >) {
    const mapDefinition = mapping.find(
      (mappingEntry) => mappingEntry.source === caseFieldKey && mappingEntry.target !== 'not_mapped'
    );

    if (mapDefinition) {
      mappedCaseFields[mapDefinition.target] = caseFields[caseFieldKey];
    }
  }

  return mappedCaseFields;
};

export const formatComments = ({
  userActions,
  latestPushInfo,
  theCase,
  spaceId,
  userProfiles,
  publicBaseUrl,
}: {
  theCase: Case;
  latestPushInfo: LatestPushInfo;
  userActions: CaseUserActionsDeprecatedResponse;
  spaceId: string;
  userProfiles?: Map<string, UserProfile>;
  publicBaseUrl?: IBasePath['publicBaseUrl'];
}): ExternalServiceComment[] => {
  const commentsIdsToBeUpdated = new Set(
    userActions
      .slice(latestPushInfo?.index ?? 0)
      .filter((action) => action.type === UserActionTypes.comment)
      .map((action) => action.comment_id)
  );

  const commentsToBeUpdated = theCase.comments?.filter(
    // Push only user-authored comments — legacy `user` and unified `comment`.
    (comment) => isCommentAttachmentType(comment.type) && commentsIdsToBeUpdated.has(comment.id)
  );

  let comments: ExternalServiceComment[] = [];

  if (commentsToBeUpdated && Array.isArray(commentsToBeUpdated) && commentsToBeUpdated.length > 0) {
    comments = addKibanaInformationToComments(commentsToBeUpdated, userProfiles);
  }

  comments = addAlertMessage({
    theCase,
    externalServiceComments: comments,
    spaceId,
    publicBaseUrl,
  });
  return comments;
};

export const addKibanaInformationToDescription = (
  theCase: Case,
  spaceId: string,
  userProfiles?: Map<string, UserProfile>,
  publicBaseUrl?: IBasePath['publicBaseUrl']
) => {
  const addedBy = i18n.ADDED_BY(
    getEntity(
      {
        createdBy: theCase.created_by,
        updatedBy: theCase.updated_by,
      },
      userProfiles
    )
  );

  const descriptionWithKibanaInformation = `${theCase.description}\n\n${addedBy}.`;

  if (!publicBaseUrl) {
    return descriptionWithKibanaInformation;
  }

  const caseUrl = getCaseViewPath({
    publicBaseUrl,
    spaceId,
    caseId: theCase.id,
    owner: theCase.owner,
  });

  return `${descriptionWithKibanaInformation}\n${i18n.VIEW_IN_KIBANA}.\n${i18n.CASE_URL(caseUrl)}`;
};

const addKibanaInformationToComments = (
  comments: Case['comments'] = [],
  userProfiles?: Map<string, UserProfile>
): ExternalServiceComment[] =>
  comments.map((theComment) => {
    const addedBy = i18n.ADDED_BY(
      getEntity(
        {
          createdBy: theComment.created_by,
          updatedBy: theComment.updated_by,
        },
        userProfiles
      )
    );

    return {
      comment: `${getCommentContent(theComment)}\n\n${addedBy}.`,
      commentId: theComment.id,
    };
  });

export const getEntity = (
  entity: { createdBy: Case['created_by']; updatedBy: Case['updated_by'] },
  userProfiles?: Map<string, UserProfile>
): string => {
  return (
    getDisplayName(entity.updatedBy, userProfiles) ??
    getDisplayName(entity.createdBy, userProfiles) ??
    i18n.UNKNOWN
  );
};

const getDisplayName = (
  user: User | null | undefined,
  userProfiles?: Map<string, UserProfile>
): string | undefined => {
  if (user == null) {
    return;
  }

  if (user.profile_uid != null) {
    const updatedByProfile = userProfiles?.get(user.profile_uid);

    if (updatedByProfile != null) {
      return (
        validOrUndefined(updatedByProfile.user.full_name) ??
        validOrUndefined(updatedByProfile.user.username)
      );
    }
  }

  return validOrUndefined(user.full_name) ?? validOrUndefined(user.username) ?? i18n.UNKNOWN;
};

const validOrUndefined = (value: string | undefined | null): string | undefined => {
  if (value == null || isEmpty(value)) {
    return;
  }

  return value;
};

export const getClosedInfoForUpdate = ({
  user,
  status,
  closedDate,
}: {
  closedDate: string;
  user: User;
  status?: CaseStatuses;
}): Pick<CaseAttributes, 'closed_at' | 'closed_by'> | undefined => {
  if (status && status === CaseStatuses.closed) {
    return {
      closed_at: closedDate,
      closed_by: user,
    };
  }

  if (status && (status === CaseStatuses.open || status === CaseStatuses['in-progress'])) {
    return {
      closed_at: null,
      closed_by: null,
    };
  }
};

/**
 * If the status changes to 'in-progress' and in_progress_at is not set, we set it to the current date.
 * If the status does not change to 'in-progress' or in_progress_at is already set, we do not change it.
 */

export const getInProgressInfoForUpdate = ({
  status,
  stateTransitionTimestamp,
  inProgressAt,
}: {
  status?: CaseStatuses;
  stateTransitionTimestamp: string;
  inProgressAt?: string | null;
}): Partial<Pick<CaseAttributes, 'in_progress_at'>> | undefined => {
  if (status && status === CaseStatuses['in-progress'] && inProgressAt == null) {
    return {
      in_progress_at: stateTransitionTimestamp,
    };
  }
};

const areValidDatesWhenChangingToInProgress = (createdAtMillis: number, updatedAtMillis: number) =>
  !isNaN(createdAtMillis) && !isNaN(updatedAtMillis) && updatedAtMillis >= createdAtMillis;

const areValidDatesWhenClosing = (
  createdAtMillis: number,
  stateTransitionTimestampMillis: number,
  inProgressAtMillis: number | null
) => {
  if (
    isNaN(createdAtMillis) ||
    isNaN(stateTransitionTimestampMillis) ||
    stateTransitionTimestampMillis < createdAtMillis
  ) {
    return false;
  }

  if (inProgressAtMillis != null) {
    return (
      !isNaN(inProgressAtMillis) &&
      inProgressAtMillis >= createdAtMillis &&
      stateTransitionTimestampMillis >= inProgressAtMillis
    );
  }

  return true;
};

/**
 * Calculates timing metrics based on the case status and timestamps.
 * If the status is 'closed', it calculates all metrics.
 * If the status is 'in-progress', it calculates only the time to acknowledge and sets the other metrics to null.
 * If the status is 'open', it nullifies all metrics.
 */

export const getTimingMetricsForUpdate = ({
  status,
  createdAt,
  inProgressAt,
  stateTransitionTimestamp,
}: {
  status?: CaseStatuses;
  createdAt: string;
  stateTransitionTimestamp: string;
  inProgressAt?: string | null;
}):
  | Partial<Pick<CaseAttributes, 'time_to_acknowledge' | 'time_to_investigate' | 'time_to_resolve'>>
  | undefined => {
  try {
    const createdAtMillis = new Date(createdAt).getTime();
    const stateTransitionTimestampMillis = new Date(stateTransitionTimestamp).getTime();
    const inProgressAtMillis = inProgressAt ? new Date(inProgressAt).getTime() : null;

    if (status && status === CaseStatuses['in-progress']) {
      if (
        createdAt != null &&
        stateTransitionTimestamp != null &&
        areValidDatesWhenChangingToInProgress(createdAtMillis, stateTransitionTimestampMillis)
      ) {
        return {
          time_to_acknowledge: calculateTimeDifferenceInSeconds(
            stateTransitionTimestampMillis,
            createdAtMillis
          ),
          time_to_investigate: null,
          time_to_resolve: null,
        };
      }
    }

    if (status && status === CaseStatuses.closed) {
      if (
        createdAt != null &&
        stateTransitionTimestamp != null &&
        areValidDatesWhenClosing(
          createdAtMillis,
          stateTransitionTimestampMillis,
          inProgressAtMillis
        )
      ) {
        const timeToResolve = calculateTimeDifferenceInSeconds(
          stateTransitionTimestampMillis,
          createdAtMillis
        );

        const timeToAcknowledge =
          inProgressAtMillis != null
            ? calculateTimeDifferenceInSeconds(inProgressAtMillis, createdAtMillis)
            : timeToResolve;

        const timeToInvestigate =
          inProgressAtMillis != null
            ? calculateTimeDifferenceInSeconds(stateTransitionTimestampMillis, inProgressAtMillis)
            : 0;

        return {
          time_to_acknowledge: timeToAcknowledge,
          time_to_investigate: timeToInvestigate,
          time_to_resolve: timeToResolve,
        };
      }
    }

    if (status && status === CaseStatuses.open) {
      // Reset all metrics when the status is re-opened
      return {
        time_to_acknowledge: null,
        time_to_investigate: null,
        time_to_resolve: null,
      };
    }
  } catch (err) {
    // Silence date errors
  }
};

const calculateTimeDifferenceInSeconds = (endTime: number, startTime: number) =>
  Math.floor((endTime - startTime) / 1000);

export const getDurationInSeconds = ({
  closedAt,
  createdAt,
}: {
  closedAt: string;
  createdAt: CaseAttributes['created_at'];
}) => {
  try {
    if (createdAt != null && closedAt != null) {
      const createdAtMillis = new Date(createdAt).getTime();
      const closedAtMillis = new Date(closedAt).getTime();

      if (!isNaN(createdAtMillis) && !isNaN(closedAtMillis) && closedAtMillis >= createdAtMillis) {
        return { duration: Math.floor((closedAtMillis - createdAtMillis) / 1000) };
      }
    }
  } catch (err) {
    // Silence date errors
  }
};

export const getDurationForUpdate = ({
  status,
  closedAt,
  createdAt,
}: {
  closedAt: string;
  createdAt: CaseAttributes['created_at'];
  status?: CaseStatuses;
}): Pick<CaseAttributes, 'duration'> | undefined => {
  if (status && status === CaseStatuses.closed) {
    return getDurationInSeconds({ createdAt, closedAt });
  }

  if (status && (status === CaseStatuses.open || status === CaseStatuses['in-progress'])) {
    return {
      duration: null,
    };
  }
};

export const getUserProfiles = async (
  securityStartPlugin: SecurityPluginStart,
  uids: Set<string>,
  dataPath?: string
): Promise<Map<string, UserProfileWithAvatar>> => {
  if (uids.size <= 0) {
    return new Map();
  }

  const userProfiles =
    (await securityStartPlugin.userProfiles.bulkGet({
      uids,
      dataPath,
    })) ?? [];

  return userProfiles.reduce<Map<string, UserProfileWithAvatar>>((acc, profile) => {
    acc.set(profile.uid, profile);
    return acc;
  }, new Map());
};

export const fillMissingCustomFields = ({
  customFields = [],
  customFieldsConfiguration = [],
}: {
  customFields?: CaseRequestCustomFields;
  customFieldsConfiguration?: CustomFieldsConfiguration;
}): CaseRequestCustomFields => {
  const customFieldsKeys = new Set(customFields.map((customField) => customField.key));
  const missingCustomFields: CaseRequestCustomFields = [];

  // only populate with the default value required custom fields missing from the request
  for (const confCustomField of customFieldsConfiguration) {
    if (!customFieldsKeys.has(confCustomField.key)) {
      if (confCustomField?.defaultValue !== null && confCustomField?.defaultValue !== undefined) {
        missingCustomFields.push({
          key: confCustomField.key,
          type: confCustomField.type,
          value: confCustomField.defaultValue,
        } as CaseCustomField);
      } else if (!confCustomField.required) {
        missingCustomFields.push({
          key: confCustomField.key,
          type: confCustomField.type,
          value: null,
        } as CaseCustomField);
      } // else, missing required custom fields without default are not touched
    }
  }

  return [...customFields, ...missingCustomFields];
};

export const normalizeCreateCaseRequest = (
  request: CasePostRequest,
  customFieldsConfiguration?: CustomFieldsConfiguration
) => ({
  ...request,
  title: request.title.trim(),
  description: request.description.trim(),
  category: request.category?.trim() ?? null,
  tags: request.tags?.map((tag) => tag.trim()) ?? [],
  customFields: fillMissingCustomFields({
    customFields: request.customFields,
    customFieldsConfiguration,
  }),
});

export const isObservable = (observable: ObservablePost | Observable): observable is Observable =>
  'id' in observable && 'typeKey' in observable && 'value' in observable;

export const processObservables = (
  observablesMap: Map<string, Observable>,
  observable: ObservablePost | Observable
) => {
  const key = `${observable.typeKey}-${observable.value}`;
  const isExistingObservable = observablesMap.has(key);
  if (isExistingObservable) {
    return;
  }
  if (isObservable(observable)) {
    observablesMap.set(key, observable);
  } else {
    observablesMap.set(key, {
      ...observable,
      id: v4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
};

/**
 *
 * For cases that have a template and extended fields, fetches the template definitions
 * and populates `extended_fields_labels` with a mapping from storage keys (e.g.,
 * `priority_as_keyword`) to user-facing labels (e.g., "Priority"). Cases without templates
 * or extended fields, or whose templates cannot be retrieved, are returned unchanged.
 *
 * @param cases - Array of cases to enrich
 * @param templateSOs - Pre-fetched template saved objects
 * @returns The enriched cases array, preserving original order
 */
export const enrichCasesWithFieldLabels = (
  cases: Case[],
  templateSOs: Array<SavedObject<Template>>
): Case[] => {
  type EligibleCase = Case & {
    template: NonNullable<Case['template']>;
    extended_fields: NonNullable<Case['extended_fields']>;
  };
  const isEligible = (c: Case): c is EligibleCase =>
    c.template?.id != null && c.extended_fields != null;

  const eligibleCases = cases.filter(isEligible);

  if (eligibleCases.length === 0) {
    return cases;
  }

  const labelsByTemplateKey = new Map<string, Record<string, string>>();
  for (const so of templateSOs) {
    const fieldKeyToLabel = Object.fromEntries(
      (so.attributes.fieldNames ?? []).map((field) => [
        `${field.name}_as_${field.type}`,
        field.label,
      ])
    );
    labelsByTemplateKey.set(
      `${so.attributes.templateId}:${so.attributes.templateVersion}`,
      fieldKeyToLabel
    );
  }

  const enrichedCasesById = new Map(
    eligibleCases.flatMap((c) => {
      const fieldKeyToLabel = labelsByTemplateKey.get(`${c.template.id}:${c.template.version}`);
      return fieldKeyToLabel != null
        ? [[c.id, { ...c, extended_fields_labels: fieldKeyToLabel }]]
        : [];
    })
  );

  return cases.map((c) => enrichedCasesById.get(c.id) ?? c);
};
