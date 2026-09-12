/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { memoize, partition } from 'lodash';

import { EuiCode, EuiLoadingSpinner } from '@elastic/eui';

import type {
  AttachmentType,
  AttachmentCreationActivity,
  CommonAttachmentViewProps,
} from '../../../client/attachment_framework/types';

import { renderAttachmentAction } from '../attachment_action';
import { UserActionTimestamp } from '../timestamp';
import type { AttachmentTypeRegistry } from '../../../../common/registry';
import type { AttachmentV2 } from '../../../../common/types/domain';
import type { UserActionBuilder, UserActionBuilderArgs } from '../types';
import type { SnakeToCamelCase } from '../../../../common/types';
import {
  ATTACHMENT_NOT_REGISTERED_ERROR,
  DEFAULT_EVENT_ATTACHMENT_TITLE,
  DELETE_REGISTERED_ATTACHMENT,
} from './translations';
import { UserActionContentToolbar } from '../content_toolbar';
import { HoverableUserWithAvatarResolver } from '../../user_profiles/hoverable_user_with_avatar_resolver';
import { RegisteredAttachmentsPropertyActions } from '../property_actions/registered_attachments_property_actions';
import { AttachmentErrorCallout } from './attachment_error_callout';
import { AttachmentRenderErrorBoundary } from './attachment_render_error_boundary';

type BuilderArgs<C, R> = Pick<
  UserActionBuilderArgs,
  'userAction' | 'caseData' | 'permissions' | 'handleDeleteComment' | 'userProfiles'
> & {
  attachment: SnakeToCamelCase<C>;
  registry: R;
  isLoading: boolean;
  getId: () => string;
  getAttachmentViewProps: () => object;
};

/**
 * Provides a render function for attachment type.
 * memoize uses the first argument as the caching key.
 * The argument is intentionally declared and unused to
 * be able for TS to warn us in case we forgot to provide one.
 */
const getAttachmentRenderer = memoize((cachingKey: string) => {
  let AttachmentElement: React.ReactElement;

  const renderCallback = (
    creationActivity: AttachmentCreationActivity<CommonAttachmentViewProps>,
    props: CommonAttachmentViewProps
  ) => {
    if (!creationActivity.children) return;

    if (!AttachmentElement) {
      AttachmentElement = React.createElement(creationActivity.children, props);
    } else {
      AttachmentElement = React.cloneElement(AttachmentElement, props);
    }

    return (
      <AttachmentRenderErrorBoundary>
        <Suspense fallback={<EuiLoadingSpinner />}>{AttachmentElement}</Suspense>
      </AttachmentRenderErrorBoundary>
    );
  };

  return renderCallback;
});

export const createRegisteredAttachmentUserActionBuilder = <
  C extends AttachmentV2,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R extends AttachmentTypeRegistry<AttachmentType<any>>
>({
  userAction,
  userProfiles,
  attachment,
  registry,
  caseData,
  permissions,
  isLoading,
  getId,
  getAttachmentViewProps,
  handleDeleteComment,
}: BuilderArgs<C, R>): ReturnType<UserActionBuilder> => ({
  build: () => {
    const attachmentTypeId: string = getId();
    const isTypeRegistered = registry.has(attachmentTypeId);

    if (!isTypeRegistered) {
      return [
        {
          username: (
            <HoverableUserWithAvatarResolver
              user={attachment.createdBy}
              userProfiles={userProfiles}
            />
          ),
          event: (
            <>
              {`${DEFAULT_EVENT_ATTACHMENT_TITLE} `}
              <EuiCode>{attachmentTypeId}</EuiCode>
            </>
          ),
          className: `comment-${attachment.type}-not-found`,
          'data-test-subj': `comment-${attachment.type}-not-found`,
          timestamp: <UserActionTimestamp createdAt={userAction.createdAt} />,
          children: <AttachmentErrorCallout title={ATTACHMENT_NOT_REGISTERED_ERROR} />,
        },
      ];
    }

    const attachmentType = registry.get(attachmentTypeId);

    const props = {
      ...getAttachmentViewProps(),
      savedObjectId: attachment.id,
      caseData: { id: caseData.id, title: caseData.title },
      permissions,
    };

    const creationActivity = attachmentType.getCreationActivity(props);
    const deleteSuccessToast = creationActivity.deleteSuccessToast ?? DELETE_REGISTERED_ATTACHMENT;

    const renderer = getAttachmentRenderer(userAction.id);
    const actions = creationActivity.getActions?.(props) ?? [];
    const [primaryActions, nonPrimaryActions] = partition(actions, 'isPrimary');
    const visiblePrimaryActions = primaryActions.slice(0, 2);
    const nonVisiblePrimaryActions = primaryActions.slice(2, primaryActions.length);
    const className =
      creationActivity.className ?? `comment-${attachment.type}-attachment-${attachmentTypeId}`;

    return [
      {
        username: (
          <HoverableUserWithAvatarResolver
            user={attachment.createdBy}
            userProfiles={userProfiles}
          />
        ),
        className,
        css: creationActivity.css,
        event: creationActivity.event,
        eventColor: creationActivity.eventColor,
        'data-test-subj': `comment-${attachment.type}-${attachmentTypeId}`,
        timestamp: <UserActionTimestamp createdAt={userAction.createdAt} />,
        timelineAvatar: attachmentType.getIcon(props),
        timelineAvatarAriaLabel: attachmentType.getLabel(),
        actions: (
          <UserActionContentToolbar id={attachment.id}>
            {visiblePrimaryActions.map((action) =>
              renderAttachmentAction(action, `attachment-${attachmentTypeId}-${attachment.id}`)
            )}
            <RegisteredAttachmentsPropertyActions
              isLoading={isLoading}
              onDelete={() => handleDeleteComment(attachment.id, deleteSuccessToast)}
              registeredAttachmentActions={[...nonVisiblePrimaryActions, ...nonPrimaryActions]}
              hideDefaultActions={!!creationActivity.hideDefaultActions}
            />
          </UserActionContentToolbar>
        ),
        children: renderer(creationActivity, props),
      },
    ];
  },
});
