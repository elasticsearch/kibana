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
import type { UserActionAttributes, UserActions } from '../../../common/types/domain';
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

export const getSearchableContent = (attributes: UserActionTransformedAttributes): string[] => {
  const payload = attributes.payload as Record<string, unknown>;
  const texts: string[] = [];

  switch (attributes.type) {
    case UserActionTypes.comment: {
      const comment = payload.comment as Record<string, unknown> | undefined;
      const text = asString(comment?.comment);
      if (text) texts.push(text);
      break;
    }
    case UserActionTypes.title: {
      const text = asString(payload.title);
      if (text) texts.push(text);
      break;
    }
    case UserActionTypes.description: {
      const text = asString(payload.description);
      if (text) texts.push(text);
      break;
    }
    case UserActionTypes.tags: {
      texts.push(...asStringArray(payload.tags));
      break;
    }
    case UserActionTypes.category: {
      const text = asString(payload.category);
      if (text) texts.push(text);
      break;
    }
    case UserActionTypes.customFields: {
      texts.push(...extractCustomFieldValues(payload.customFields));
      break;
    }
    case UserActionTypes.extended_fields: {
      const extendedFields = payload.extended_fields;
      if (extendedFields != null && typeof extendedFields === 'object') {
        texts.push(...asStringArray(Object.values(extendedFields)));
      }
      break;
    }
    case UserActionTypes.create_case: {
      const title = asString(payload.title);
      const description = asString(payload.description);
      if (title) texts.push(title);
      if (description) texts.push(description);
      texts.push(...asStringArray(payload.tags));
      texts.push(...extractCustomFieldValues(payload.customFields));
      break;
    }
    default:
      break;
  }

  return texts;
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

  const createdBy = attributes.created_by;
  if (createdBy) {
    const username = createdBy.username?.toLowerCase() ?? '';
    const fullName = createdBy.full_name?.toLowerCase() ?? '';

    if (username.includes(term) || fullName.includes(term)) {
      return true;
    }
  }

  return false;
};
