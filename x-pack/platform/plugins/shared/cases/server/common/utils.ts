/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type {
  SavedObjectsFindResult,
  SavedObjectsFindResponse,
  SavedObject,
  SavedObjectReference,
  IBasePath,
} from '@kbn/core/server';
import { isNonLocalIndexName } from '@kbn/es-query';
import { flatMap, uniqWith, xorWith } from 'lodash';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';
import { addSpaceIdToPath } from '@kbn/core-spaces-common';
import type { LensEmbeddableStateWithType } from '@kbn/lens-plugin/server/embeddable/types';
import type {
  ActionsAttachmentPayload,
  AlertAttachmentPayload,
  AttachmentV2,
  AttachmentAttributes,
  AttachmentAttributesV2,
  Case,
  EventAttachmentPayload,
  FileAttachmentMetadata,
  User,
  UserCommentAttachmentPayload,
  UnifiedReferenceAttachmentPayload,
} from '../../common/types/domain';
import {
  AttachmentType,
  ExternalReferenceSOAttachmentPayloadRt,
  FileAttachmentMetadataRt,
  CaseSeverity,
  CaseStatuses,
  ConnectorTypes,
} from '../../common/types/domain';
import { isValidOwner } from '../../common/utils/owner';
import {
  CASE_VIEW_COMMENT_PATH,
  CASE_VIEW_PATH,
  CASE_VIEW_TAB_PATH,
  FILE_ATTACHMENT_TYPE,
  GENERAL_CASES_OWNER,
  OWNER_INFO,
  PERSISTABLE_ATTACHMENT_TYPES,
  UNIFIED_TO_EXTERNAL_REFERENCE_TYPE_MAP,
} from '../../common/constants';
import type { CASE_VIEW_PAGE_TABS } from '../../common/types';
import type { AlertInfo, FileAttachmentRequest } from './types';

import type { UpdateAlertStatusRequest } from '../client/alerts/types';
import {
  parseCommentString,
  getLensVisualizations,
} from '../../common/utils/markdown_plugins/utils';
import { dedupAssignees } from '../client/cases/utils';
import type { CaseSavedObjectTransformed, CaseTransformedAttributes } from './types/case';
import type {
  AttachmentRequest,
  AttachmentRequestV2,
  AttachmentsFindResponseV2,
  CasePostRequest,
  CasesSearchResponse,
} from '../../common/types/api';
import {
  isEventAttachmentType,
  isAlertAttachmentType,
  isCommentAttachmentType,
  isUnifiedReferenceAttachmentRequest,
  getIndexFromMetadata,
  toStringArray,
} from '../../common/utils/attachments';

/**
 * Default sort field for querying saved objects.
 */
export const defaultSortField = 'created_at';

/**
 * Default unknown user
 */
export const nullUser: User = { username: null, full_name: null, email: null };

/**
 * A stored template reference is always version-pinned. The create request may omit `version`
 * (server-side template expansion resolves it to the latest), so by the time a case is persisted
 * the version must have been stamped — this converts the request shape to the storage shape and
 * guards the invariant.
 */
const pinStoredTemplate = (
  template: CasePostRequest['template']
): CaseTransformedAttributes['template'] => {
  if (template == null) {
    return template;
  }

  if (template.version === undefined) {
    throw new Error(
      `Cannot persist case: template ${template.id} has no pinned version. Template expansion must resolve the version before the case is saved.`
    );
  }

  return { id: template.id, version: template.version };
};

export const transformNewCase = ({
  user,
  newCase: { template, ...newCase },
}: {
  user: User;
  newCase: CasePostRequest;
}): CaseTransformedAttributes => ({
  ...newCase,
  // Re-added only when present so an absent template stays absent (an explicit
  // `template: undefined` key changes SO create payloads and snapshots).
  ...(template !== undefined ? { template: pinStoredTemplate(template) } : {}),
  duration: null,
  severity: newCase.severity ?? CaseSeverity.LOW,
  closed_at: null,
  closed_by: null,
  created_at: new Date().toISOString(),
  created_by: user,
  external_service: null,
  status: CaseStatuses.open,
  updated_at: null,
  updated_by: null,
  assignees: dedupAssignees(newCase.assignees) ?? [],
  category: newCase.category ?? null,
  customFields: newCase.customFields ?? [],
  observables: [],
  total_observables: 0,
  incremental_id: undefined,
});

export const transformCases = ({
  casesMap,
  countOpenCases,
  countInProgressCases,
  countClosedCases,
  page,
  perPage,
  total,
  mttr,
}: {
  casesMap: Map<string, Case>;
  countOpenCases: number;
  countInProgressCases: number;
  countClosedCases: number;
  page: number;
  perPage: number;
  total: number;
  /** Average resolve time in seconds of the matching cases; only the search API provides it. */
  mttr?: number | null;
}): CasesSearchResponse => ({
  page,
  per_page: perPage,
  total,
  cases: Array.from(casesMap.values()),
  count_open_cases: countOpenCases,
  count_in_progress_cases: countInProgressCases,
  count_closed_cases: countClosedCases,
  // Only add the `mttr` key when a value was passed. The public `find` caller passes nothing, so
  // the resulting object has no `mttr` key and still satisfies the strict `CasesFindResponseRt`
  // decode. Do NOT change this to `mttr: mttr ?? null` — that would leak `mttr` onto the public
  // `_find` response and break its strict decode / OpenAPI contract.
  ...(mttr !== undefined ? { mttr } : {}),
});

export const flattenCaseSavedObject = ({
  savedObject,
  comments = [],
  totalComment = comments.length,
  totalAlerts = 0,
  totalEvents = 0,
}: {
  savedObject: CaseSavedObjectTransformed;
  comments?: Array<SavedObject<AttachmentAttributesV2>>;
  totalComment?: number;
  totalAlerts?: number;
  totalEvents?: number;
}): Case => ({
  id: savedObject.id,
  version: savedObject.version ?? '0',
  comments: flattenAttachmentSavedObjects(comments),
  totalComment,
  totalAlerts,
  totalEvents,
  ...savedObject.attributes,
});

export const transformComments = (
  comments: SavedObjectsFindResponse<AttachmentAttributesV2>
): AttachmentsFindResponseV2 => ({
  page: comments.page,
  per_page: comments.per_page,
  total: comments.total,
  comments: flattenAttachmentSavedObjects(comments.saved_objects),
});

export const flattenAttachmentSavedObjects = (
  savedObjects: Array<SavedObject<AttachmentAttributesV2>>
): AttachmentV2[] =>
  savedObjects.reduce((acc: AttachmentV2[], savedObject: SavedObject<AttachmentAttributesV2>) => {
    acc.push(flattenAttachmentSavedObject(savedObject));
    return acc;
  }, []);

export const flattenAttachmentSavedObject = (
  savedObject: SavedObject<AttachmentAttributesV2>
): AttachmentV2 => ({
  id: savedObject.id,
  version: savedObject.version ?? '0',
  ...savedObject.attributes,
});

/**
 * Filters out alerts whose index belongs to a linked project (`cluster:index`),
 * which cannot be resolved through the origin-only alerts ES client.
 */
export const filterOriginAlerts = <T extends { index: string }>(alerts: T[]): T[] =>
  alerts.filter((alert) => !isNonLocalIndexName(alert.index));

export const getIDsAndIndicesAsArrays = (
  comment: AttachmentRequestV2
): { ids: string[]; indices: string[] } => {
  if ('alertId' in comment) {
    return {
      ids: Array.isArray(comment.alertId) ? comment.alertId : [comment.alertId],
      indices: Array.isArray(comment.index) ? comment.index : [comment.index],
    };
  }

  if ('eventId' in comment) {
    return {
      ids: Array.isArray(comment.eventId) ? comment.eventId : [comment.eventId],
      indices: Array.isArray(comment.index) ? comment.index : [comment.index],
    };
  }

  if ('attachmentId' in comment) {
    const metadataIndex = getIndexFromMetadata(comment.metadata);
    return {
      ids: toStringArray(comment.attachmentId),
      indices: toStringArray(metadataIndex),
    };
  }

  return {
    ids: [],
    indices: [],
  };
};

/**
 * Extracts id/index pairs for an alert/event comment: 1-to-1 arrays, or a scalar `metadata.index`
 * broadcasting across every id. Pass `strict: true` to throw on an invalid pairing instead of dropping it.
 */
const getAndValidateIndexedAttachmentInfo = (
  comment: AttachmentRequestV2,
  isTargetType: (type: string) => boolean,
  strict: boolean
): AlertInfo[] => {
  if (!isTargetType(comment.type)) {
    return [];
  }

  const { ids, indices } = getIDsAndIndicesAsArrays(comment);

  // Only a scalar metadata.index broadcasts; an array (even length 1) must match 1-to-1.
  const rawMetadataIndex =
    'attachmentId' in comment ? getIndexFromMetadata(comment.metadata) : undefined;
  const isBroadcastIndex = typeof rawMetadataIndex === 'string';

  if (!isBroadcastIndex && ids.length !== indices.length) {
    if (strict) {
      throw Boom.badRequest(
        `Attachment of type "${comment.type}" is missing a valid index reference (id count=${ids.length}, index count=${indices.length}).`
      );
    }

    return [];
  }

  return ids.map((id, index) => ({ id, index: isBroadcastIndex ? indices[0] : indices[index] }));
};

/**
 * Builds AlertInfo for the alerts in `comments`. Pass `strict: true` only when validating a new
 * write before it's persisted; reads of already-persisted attachments must stay lenient.
 * `isSupportedType` widens which attachment types contribute; the status sync passes
 * `isDetectionAttachmentType` so attached attacks are collected alongside alerts.
 */
export const getAlertInfoFromComments = (
  comments: AttachmentRequestV2[] = [],
  strict = false,
  isSupportedType: (type: string) => boolean = isAlertAttachmentType
): AlertInfo[] =>
  comments.reduce((acc: AlertInfo[], comment) => {
    acc.push(...getAndValidateIndexedAttachmentInfo(comment, isSupportedType, strict));
    return acc;
  }, []);

/**
 * Same as {@link getAlertInfoFromComments}, but for events (legacy `event` + unified `security.event`).
 */
export const getEventInfoFromComments = (
  comments: AttachmentRequestV2[] = [],
  strict = false
): AlertInfo[] =>
  comments.reduce((acc: AlertInfo[], comment) => {
    acc.push(...getAndValidateIndexedAttachmentInfo(comment, isEventAttachmentType, strict));
    return acc;
  }, []);

export type NewCommentArgs = AttachmentRequestV2 & {
  createdDate: string;
  owner: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  profile_uid?: string;
};

export const transformNewComment = ({
  createdDate,
  email,
  full_name,
  username,
  profile_uid: profileUid,
  ...comment
}: NewCommentArgs): AttachmentAttributesV2 => {
  return {
    ...comment,
    created_at: createdDate,
    created_by: { email, full_name, username, profile_uid: profileUid },
    pushed_at: null,
    pushed_by: null,
    updated_at: null,
    updated_by: null,
  };
};

/**
 * A type narrowing function for actions comments.
 */
export const isCommentRequestTypeActions = (
  context: AttachmentRequest
): context is ActionsAttachmentPayload => {
  return context.type === AttachmentType.actions;
};

/**
 * A type narrowing function for alert comments.
 */
export const isCommentRequestTypeAlert = (
  context: AttachmentRequest
): context is AlertAttachmentPayload => {
  return context.type === AttachmentType.alert;
};

/**
 * A type narrowing function for event comments.
 */
export const isCommentRequestTypeEvent = (
  context: AttachmentRequest
): context is EventAttachmentPayload => {
  return context.type === AttachmentType.event;
};

/**
 * Returns true if a Comment Request is trying to create either a persistableState or an
 * externalReference attachment.
 */
export const isPersistableStateOrExternalReference = (context: AttachmentRequest): boolean => {
  return (
    context.type === AttachmentType.persistableState ||
    context.type === AttachmentType.externalReference
  );
};

/**
 * A type narrowing function for file attachments.
 */
export const isFileAttachmentRequest = (
  context: Partial<AttachmentRequest>
): context is FileAttachmentRequest => {
  return (
    ExternalReferenceSOAttachmentPayloadRt.is(context) &&
    FileAttachmentMetadataRt.is(context.externalReferenceMetadata)
  );
};

/**
 * A type narrowing function for unified file attachments (`type: 'file'`), the
 * counterpart of {@link isFileAttachmentRequest} for the legacy `.files` shape.
 */
export const isUnifiedFileAttachmentRequest = (
  context: AttachmentRequestV2
): context is UnifiedReferenceAttachmentPayload & { metadata: FileAttachmentMetadata } => {
  return (
    isUnifiedReferenceAttachmentRequest(context) &&
    context.type === FILE_ATTACHMENT_TYPE &&
    FileAttachmentMetadataRt.is(context.metadata)
  );
};

/**
 * True for a unified persistable-state or external-reference request, excluding `file`.
 * Counterpart of {@link isPersistableStateOrExternalReference}.
 */
export const isUnifiedPersistableStateOrExternalReference = (
  context: AttachmentRequestV2
): boolean => {
  return (
    PERSISTABLE_ATTACHMENT_TYPES.has(context.type) ||
    (context.type in UNIFIED_TO_EXTERNAL_REFERENCE_TYPE_MAP &&
      context.type !== FILE_ATTACHMENT_TYPE)
  );
};

/**
 * Adds the ids and indices to a map of statuses
 */
export function createAlertUpdateStatusRequest({
  comment,
  status,
  closingReason,
  isSupportedType,
}: {
  comment: AttachmentRequestV2;
  status: CaseStatuses;
  closingReason?: string;
  isSupportedType?: (type: string) => boolean;
}): UpdateAlertStatusRequest[] {
  return getAlertInfoFromComments([comment], false, isSupportedType).map((alert) => ({
    ...alert,
    status,
    closingReason,
  }));
}

/**
 * Counts the total alert IDs within a single comment.
 */
export const countAlerts = (comment: SavedObjectsFindResult<AttachmentAttributesV2>) => {
  let totalAlerts = 0;
  const { type } = comment.attributes;

  if (type === AttachmentType.alert && 'alertId' in comment.attributes) {
    const { alertId } = comment.attributes;
    totalAlerts += Array.isArray(alertId) ? alertId.length : 1;
  } else if (isAlertAttachmentType(type) && 'attachmentId' in comment.attributes) {
    const { attachmentId } = comment.attributes as { attachmentId: string | string[] };
    totalAlerts += Array.isArray(attachmentId) ? attachmentId.length : 1;
  }

  return totalAlerts;
};

/**
 * Count the number of alerts for each id in the alert's references.
 */
export const groupTotalAlertsByID = ({
  comments,
}: {
  comments: SavedObjectsFindResponse<AttachmentAttributes>;
}): Map<string, number> => {
  return comments.saved_objects.reduce((acc, alertsInfo) => {
    const alertTotalForComment = countAlerts(alertsInfo);
    for (const alert of alertsInfo.references) {
      if (alert.id) {
        const totalAlerts = acc.get(alert.id);

        if (totalAlerts !== undefined) {
          acc.set(alert.id, totalAlerts + alertTotalForComment);
        } else {
          acc.set(alert.id, alertTotalForComment);
        }
      }
    }

    return acc;
  }, new Map<string, number>());
};

/**
 * Counts the total alert IDs for a single case.
 */
export const countAlertsForID = ({
  comments,
  id,
}: {
  comments: SavedObjectsFindResponse<AttachmentAttributes>;
  id: string;
}): number | undefined => {
  return groupTotalAlertsByID({ comments }).get(id);
};

/**
 * Counts total events in a single case.
 */
export const countEventsForID = ({
  comments,
}: {
  comments: SavedObjectsFindResponse<AttachmentAttributes>;
}): number | undefined => {
  return comments.saved_objects.reduce((sum, current) => {
    const attrs = current.attributes;
    if (!isEventAttachmentType(attrs.type)) {
      return sum;
    }
    if ('attachmentId' in attrs && attrs.attachmentId != null) {
      const id = attrs.attachmentId;
      return sum + (Array.isArray(id) ? id.length : 1);
    }
    if ('eventId' in attrs && attrs.eventId != null) {
      return sum + [attrs.eventId].flat().length;
    }
    return sum;
  }, 0);
};

/**
 * Returns a connector that indicates that no connector was set.
 *
 * @returns the 'none' connector
 */
export const getNoneCaseConnector = () => ({
  id: 'none',
  name: 'none',
  type: ConnectorTypes.none,
  fields: null,
});

export const extractLensReferencesFromCommentString = (
  lensEmbeddableFactory: LensServerPluginSetup['lensEmbeddableFactory'],
  comment: string
): SavedObjectReference[] => {
  const extract = lensEmbeddableFactory().extract;

  if (extract) {
    const parsedComment = parseCommentString(comment);
    const lensVisualizations = getLensVisualizations(parsedComment.children);
    const flattenRefs = flatMap(lensVisualizations, (vis) => {
      // TODO: Improve these types
      const lensVis = vis as unknown as LensEmbeddableStateWithType;
      return extract(lensVis).references;
    });

    const uniqRefs = uniqWith(
      flattenRefs,
      (refA, refB) => refA.type === refB.type && refA.id === refB.id && refA.name === refB.name
    );

    return uniqRefs;
  }
  return [];
};

export const getOrUpdateLensReferences = (
  lensEmbeddableFactory: LensServerPluginSetup['lensEmbeddableFactory'],
  newComment: string,
  currentComment?: Pick<SavedObject<UserCommentAttachmentPayload>, 'references'> & {
    attributes: { comment: string };
  }
) => {
  if (!currentComment) {
    return extractLensReferencesFromCommentString(lensEmbeddableFactory, newComment);
  }

  const savedObjectReferences = currentComment.references;
  const savedObjectLensReferences = extractLensReferencesFromCommentString(
    lensEmbeddableFactory,
    currentComment.attributes.comment
  );

  const currentNonLensReferences = xorWith(
    savedObjectReferences,
    savedObjectLensReferences,
    (refA, refB) => refA.type === refB.type && refA.id === refB.id
  );

  const newCommentLensReferences = extractLensReferencesFromCommentString(
    lensEmbeddableFactory,
    newComment
  );

  return currentNonLensReferences.concat(newCommentLensReferences);
};

export const asArray = <T>(field?: T | T[] | null): T[] => {
  if (field === undefined || field === null) {
    return [];
  }

  return Array.isArray(field) ? field : [field];
};

export const assertUnreachable = (x: never): never => {
  throw new Error('You should not reach this part of code');
};

export const getApplicationRoute = (
  appRouteInfo: { [K in keyof typeof OWNER_INFO]: { appRoute: string } },
  owner: string
): string => {
  const appRoute = isValidOwner(owner)
    ? appRouteInfo[owner].appRoute
    : OWNER_INFO[GENERAL_CASES_OWNER].appRoute;

  return appRoute.startsWith('/') ? appRoute : `/${appRoute}`;
};

export const getCaseViewPath = (params: {
  publicBaseUrl: NonNullable<IBasePath['publicBaseUrl']>;
  spaceId: string;
  caseId: string;
  owner: string;
  commentId?: string;
  tabId?: CASE_VIEW_PAGE_TABS;
}): string => {
  const normalizePath = (path: string): string => path.replaceAll('//', '/');
  const removeEndingSlash = (path: string): string =>
    path.endsWith('/') ? path.slice(0, -1) : path;

  const { publicBaseUrl, caseId, owner, commentId, tabId, spaceId } = params;

  const publicBaseUrlWithoutEndingSlash = removeEndingSlash(publicBaseUrl);
  const publicBaseUrlWithSpace = addSpaceIdToPath(publicBaseUrlWithoutEndingSlash, spaceId);
  const ownerInfo = isValidOwner(owner) ? OWNER_INFO[owner] : OWNER_INFO[GENERAL_CASES_OWNER];
  const basePath = `${publicBaseUrlWithSpace}${ownerInfo.appBasePath}${ownerInfo.casesBasePath}`;

  if (commentId) {
    const commentPath = normalizePath(
      CASE_VIEW_COMMENT_PATH.replace(':detailName', caseId).replace(':commentId', commentId)
    );

    return `${basePath}${commentPath}`;
  }

  if (tabId) {
    const tabPath = normalizePath(
      CASE_VIEW_TAB_PATH.replace(':detailName', caseId).replace(':tabId', tabId)
    );

    return `${basePath}${tabPath}`;
  }

  return `${basePath}${normalizePath(CASE_VIEW_PATH.replace(':detailName', caseId))}`;
};

export const countUserAttachments = (
  attachments: Array<SavedObject<AttachmentAttributes>>
): number => {
  let total = 0;

  for (const attachment of attachments) {
    if (isCommentAttachmentType(attachment.attributes.type)) {
      total += 1;
    }
  }

  return total;
};
