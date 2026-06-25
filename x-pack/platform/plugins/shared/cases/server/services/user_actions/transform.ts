/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsFindResponse } from '@kbn/core/server';

import type { CaseUserActionDeprecatedResponse } from '../../../common/types/api';
import {
  isConnectorUserAction,
  isPushedUserAction,
  isCreateCaseUserAction,
  isCommentUserAction,
} from '../../../common/utils/user_actions';
import { CASE_SAVED_OBJECT, NONE_CONNECTOR_ID } from '../../../common/constants';
import {
  ATTACHMENT_ID_REF_NAME,
  CASE_REF_NAME,
  CONNECTOR_ID_REFERENCE_NAME,
  EXTERNAL_REFERENCE_REF_NAME,
  PUSH_CONNECTOR_ID_REFERENCE_NAME,
} from '../../common/constants';
import { findConnectorIdReference } from '../transform';
import {
  isCommentRequestTypeExternalReferenceSO,
  isUnifiedAttachmentWithSoReference,
} from '../type_guards';
import { findCommentReferenceId, findReferenceId } from '../../common/references';
import type {
  UserActionPersistedAttributes,
  UserActionSavedObjectTransformed,
  UserActionTransformedAttributes,
} from '../../common/types/user_actions';
import type { UserActionAttributes } from '../../../common/types/domain';

export function transformFindResponseToExternalModel(
  userActions: SavedObjectsFindResponse<UserActionPersistedAttributes>
): SavedObjectsFindResponse<UserActionTransformedAttributes> {
  return {
    ...userActions,
    saved_objects: userActions.saved_objects.map((so) => ({
      ...so,
      ...transformToExternalModel(so),
    })),
  };
}

export function transformToExternalModel(
  userAction: SavedObject<UserActionPersistedAttributes>
): UserActionSavedObjectTransformed {
  const { references } = userAction;

  const commentId = findCommentReferenceId(references) ?? null;
  const payload = addReferenceIdToPayload(userAction);

  return {
    ...userAction,
    attributes: {
      ...userAction.attributes,
      comment_id: commentId,
      payload,
    } as UserActionTransformedAttributes,
  };
}

/**
 * This function should only be used in the getAll user actions and it is deprecated. It should be removed when the
 * getAll route is removed.
 *
 * @deprecated remove when the getAllRoute is removed
 */
export function legacyTransformFindResponseToExternalModel(
  userActions: SavedObjectsFindResponse<UserActionPersistedAttributes>
): SavedObjectsFindResponse<CaseUserActionDeprecatedResponse> {
  return {
    ...userActions,
    saved_objects: userActions.saved_objects.map((so) => ({
      ...so,
      ...legacyTransformToExternalModel(so),
    })),
  };
}

/**
 * @deprecated remove when the getAll route is removed
 */
function legacyTransformToExternalModel(
  userAction: SavedObject<UserActionPersistedAttributes>
): SavedObject<CaseUserActionDeprecatedResponse> {
  const { references } = userAction;

  const caseId = findReferenceId(CASE_REF_NAME, CASE_SAVED_OBJECT, references) ?? '';
  const commentId = findCommentReferenceId(references) ?? null;
  const payload = addReferenceIdToPayload(userAction);

  return {
    ...userAction,
    attributes: {
      ...userAction.attributes,
      action_id: userAction.id,
      case_id: caseId,
      comment_id: commentId,
      payload,
    } as CaseUserActionDeprecatedResponse,
  };
}

const addReferenceIdToPayload = (
  userAction: SavedObject<UserActionPersistedAttributes>
): UserActionAttributes['payload'] => {
  const connectorId = getConnectorIdFromReferences(userAction);
  const userActionAttributes = userAction.attributes;

  if (isConnectorUserAction(userActionAttributes) || isCreateCaseUserAction(userActionAttributes)) {
    return {
      ...userActionAttributes.payload,
      connector: {
        ...userActionAttributes.payload.connector,
        id: connectorId ?? NONE_CONNECTOR_ID,
      },
    };
  } else if (isPushedUserAction(userActionAttributes)) {
    return {
      ...userAction.attributes.payload,
      externalService: {
        ...userActionAttributes.payload.externalService,
        connector_id: connectorId ?? NONE_CONNECTOR_ID,
      },
    };
  } else if (isCommentUserAction(userActionAttributes)) {
    if (isCommentRequestTypeExternalReferenceSO(userActionAttributes.payload.comment)) {
      const externalReferenceId = findReferenceId(
        EXTERNAL_REFERENCE_REF_NAME,
        userActionAttributes.payload.comment.externalReferenceStorage.soType,
        userAction.references
      );

      return {
        ...userAction.attributes.payload,
        comment: {
          ...userActionAttributes.payload.comment,
          externalReferenceId: externalReferenceId ?? '',
        },
      };
    }
    if (isUnifiedAttachmentWithSoReference(userActionAttributes.payload.comment)) {
      const { attachmentId } = userActionAttributes.payload.comment;

      if (typeof attachmentId === 'string' && attachmentId.length > 0) {
        return userAction.attributes.payload;
      }

      const refId = findReferenceId(
        ATTACHMENT_ID_REF_NAME,
        userActionAttributes.payload.comment.metadata.soType,
        userAction.references
      );

      return {
        ...userAction.attributes.payload,
        comment: {
          ...userActionAttributes.payload.comment,
          attachmentId: refId ?? '',
        },
      };
    }
  }

  return userAction.attributes.payload;
};

function getConnectorIdFromReferences(
  userAction: SavedObject<UserActionPersistedAttributes>
): string | null {
  const { references } = userAction;

  if (
    isConnectorUserAction(userAction.attributes) ||
    isCreateCaseUserAction(userAction.attributes)
  ) {
    return findConnectorIdReference(CONNECTOR_ID_REFERENCE_NAME, references)?.id ?? null;
  } else if (isPushedUserAction(userAction.attributes)) {
    return findConnectorIdReference(PUSH_CONNECTOR_ID_REFERENCE_NAME, references)?.id ?? null;
  }

  return null;
}
