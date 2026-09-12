/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsFindResponse } from '@kbn/core-saved-objects-api-server';
import type {
  CaseUserActionDeprecatedResponse,
  CaseUserActionsDeprecatedResponse,
} from '../../../common/types/api';
import type {
  UserActionAttributes,
  UserActions,
  UserActionType,
} from '../../../common/types/domain';
import { UserActionTypes } from '../../../common/types/domain';
import type { UserActionTransformedAttributes } from '../../common/types/user_actions';

export const extractAttributes = (
  userActions: SavedObjectsFindResponse<CaseUserActionDeprecatedResponse>
): CaseUserActionsDeprecatedResponse => {
  return userActions.saved_objects.map((so) => so.attributes);
};

export const formatSavedObject = (so: SavedObject<UserActionAttributes>) => ({
  id: so.id,
  version: so.version ?? '',
  ...so.attributes,
});

export const formatSavedObjects = (
  response: SavedObjectsFindResponse<UserActionAttributes>
): UserActions => response.saved_objects.map(formatSavedObject);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const extractAssigneeUids = (assignees: unknown): string[] => {
  if (!Array.isArray(assignees)) {
    return [];
  }

  return assignees
    .filter(
      (assignee): assignee is { uid: string } =>
        assignee != null && typeof assignee.uid === 'string'
    )
    .map((assignee) => assignee.uid);
};

const extractCustomFieldValues = (customFields: unknown): string[] => {
  if (!Array.isArray(customFields)) {
    return [];
  }

  return customFields
    .filter(
      (cf): cf is { type: string; value: string } =>
        cf != null && cf.type === 'text' && typeof cf.value === 'string'
    )
    .map((cf) => cf.value);
};

type SearchableContentExtractor = (payload: Record<string, unknown>) => string[];

const extractField =
  (field: string): SearchableContentExtractor =>
  (payload) => {
    const text = asString(payload[field]);
    return text ? [text] : [];
  };

const extractArrayField =
  (field: string): SearchableContentExtractor =>
  (payload) =>
    asStringArray(payload[field]);

const extractFileNames = (files: unknown): string[] => {
  if (!Array.isArray(files)) {
    return [];
  }

  return files.flatMap((file) => {
    const name = asString((file as Record<string, unknown> | undefined)?.name);
    return name ? [name] : [];
  });
};

const extractCommentContent: SearchableContentExtractor = (payload) => {
  const comment = payload.comment as Record<string, unknown> | undefined;
  const texts: string[] = [];

  const legacyText = asString(comment?.comment);
  if (legacyText) texts.push(legacyText);

  const data = comment?.data as Record<string, unknown> | undefined;
  const content = asString(data?.content);
  if (content) texts.push(content);

  // Unified file attachments (`payload.comment.type: 'file'`).
  const metadata = comment?.metadata as Record<string, unknown> | undefined;
  texts.push(...extractFileNames(metadata?.files));

  // Legacy file attachments (`payload.comment.type: 'externalReference'`,
  // `externalReferenceAttachmentTypeId: '.files'`).
  const externalReferenceMetadata = comment?.externalReferenceMetadata as
    | Record<string, unknown>
    | undefined;
  texts.push(...extractFileNames(externalReferenceMetadata?.files));

  return texts;
};

const extractCustomFields: SearchableContentExtractor = (payload) =>
  extractCustomFieldValues(payload.customFields);

const extractAssignees: SearchableContentExtractor = (payload) =>
  extractAssigneeUids(payload.assignees);

const extractExtendedFields: SearchableContentExtractor = (payload) => {
  const extendedFields = payload.extended_fields;
  return extendedFields != null && typeof extendedFields === 'object'
    ? asStringArray(Object.values(extendedFields))
    : [];
};

const combineExtractors =
  (...extractors: SearchableContentExtractor[]): SearchableContentExtractor =>
  (payload) =>
    extractors.flatMap((extractor) => extractor(payload));

/**
 * Extracts free-text-searchable content from a workflow user-action payload.
 * The workflow name is the primary human-visible label on every row. For observable
 * origins the value is also rendered, so it is included. IDs (`workflow.id`,
 * `workflow.executionId`, `origin.attachmentType`) are opaque identifiers and are
 * excluded, consistent with the rationale for the excluded types listed below.
 *
 * Must be defensive against undecoded payloads: `findWithSearch` calls `findAll` with
 * `decode: false`, so io-ts has not validated `payload.workflow` before this runs.
 */
const extractWorkflowContent: SearchableContentExtractor = (payload) => {
  const workflow = payload.workflow as Record<string, unknown> | undefined;
  const origin = payload.origin as Record<string, unknown> | undefined;
  const texts: string[] = [];

  const name = asString(workflow?.name);
  if (name) texts.push(name);

  // Observable origins render the observable value in the activity row (`workflow.tsx:98-110`).
  const value = asString(origin?.value);
  if (value) texts.push(value);

  return texts;
};

/**
 * Maps a user action type to the function that pulls its free-text-searchable
 * content out of the payload. Types not present here either carry no meaningful
 * free text or only reference IDs, so they're excluded from search:
 *   - `connector`, `pushed`, `settings`, `status`, `observables`, `template`: no free text
 *   - `delete_case`: no payload
 * `workflow` is indexed but narrowly: only `workflow.name` and, for observable origins,
 * the rendered observable value (IDs are excluded — see `extractWorkflowContent`).
 *
 * `comment` also covers file attachments (both the unified `file` type and
 * the legacy `.files` externalReference type), whose file name(s) are
 * included via `extractCommentContent`.
 */
const SEARCHABLE_CONTENT_EXTRACTORS: Partial<Record<UserActionType, SearchableContentExtractor>> = {
  [UserActionTypes.comment]: extractCommentContent,
  [UserActionTypes.title]: extractField('title'),
  [UserActionTypes.description]: extractField('description'),
  [UserActionTypes.tags]: extractArrayField('tags'),
  [UserActionTypes.category]: extractField('category'),
  [UserActionTypes.severity]: extractField('severity'),
  [UserActionTypes.assignees]: extractAssignees,
  [UserActionTypes.customFields]: extractCustomFields,
  [UserActionTypes.extended_fields]: extractExtendedFields,
  [UserActionTypes.workflow]: extractWorkflowContent,
  [UserActionTypes.create_case]: combineExtractors(
    extractField('title'),
    extractField('description'),
    extractField('severity'),
    extractArrayField('tags'),
    extractCustomFields,
    extractAssignees
  ),
};

export const getSearchableContent = (attributes: UserActionTransformedAttributes): string[] => {
  const payload = attributes.payload as Record<string, unknown>;
  const extractor = SEARCHABLE_CONTENT_EXTRACTORS[attributes.type];
  return extractor ? extractor(payload) : [];
};

const authorMatchesSearch = (
  attributes: UserActionTransformedAttributes,
  term: string
): boolean => {
  const createdBy = attributes.created_by;
  if (!createdBy) {
    return false;
  }

  const username = createdBy.username?.toLowerCase() ?? '';
  const fullName = createdBy.full_name?.toLowerCase() ?? '';

  return username.includes(term) || fullName.includes(term);
};

export const matchesSearch = (
  attributes: UserActionTransformedAttributes,
  search: string
): boolean => {
  if (!search) {
    return true;
  }

  const term = search.toLowerCase();

  const searchableTexts = getSearchableContent(attributes);
  if (searchableTexts.some((text) => text.toLowerCase().includes(term))) {
    return true;
  }

  return authorMatchesSearch(attributes, term);
};

/**
 * After a document has matched search, project `extended_fields` payloads so the
 * Activity UI only draws fields that explain the hit. Author hits keep the full
 * map. Returns `null` when a value projection leaves no fields (caller must omit
 * the document so the empty-map expander fallback never appears). Non-field-update
 * actions and empty search are returned unchanged. This is a read-time projection
 * on the find-with-search path only — stored user actions are never rewritten.
 */
export const projectUserActionForSearch = (
  attributes: UserActionTransformedAttributes,
  search: string
): UserActionTransformedAttributes | null => {
  if (!search || attributes.type !== UserActionTypes.extended_fields) {
    return attributes;
  }

  const term = search.toLowerCase();

  if (authorMatchesSearch(attributes, term)) {
    return attributes;
  }

  const payload = attributes.payload as { extended_fields?: Record<string, unknown> };
  const extendedFields = payload.extended_fields;
  if (extendedFields == null || typeof extendedFields !== 'object') {
    return attributes;
  }

  const matchingFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(extendedFields)) {
    if (typeof value === 'string' && value.toLowerCase().includes(term)) {
      matchingFields[key] = value;
    }
  }

  if (Object.keys(matchingFields).length === 0) {
    return null;
  }

  return {
    ...attributes,
    payload: {
      ...attributes.payload,
      extended_fields: matchingFields,
    },
  };
};
