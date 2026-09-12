/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import { AttachmentActionType } from '@kbn/cases-plugin/public';
import type { AttachmentAction } from '@kbn/cases-plugin/public';

import { getEventType } from '.';
import { EVENT_COMMENT_LABEL_TITLE, MULTIPLE_EVENTS_COMMENT_LABEL_TITLE } from './translations';

const baseProps = {
  savedObjectId: 'saved-object-id-1',
  metadata: { index: '.alerts-security.alerts-default' },
} as unknown as UnifiedReferenceAttachmentViewProps;

describe('Event attachment label rendering', () => {
  it('renders single-event label with the expected test-subj', () => {
    const attachmentType = getEventType();
    const creationActivity = attachmentType.getCreationActivity({
      ...baseProps,
      attachmentId: 'event-id-1',
    });

    render(<>{creationActivity.event}</>);

    expect(screen.getByTestId('event-user-action-saved-object-id-1')).toHaveTextContent(
      EVENT_COMMENT_LABEL_TITLE
    );
  });

  it('renders multiple-event label with the expected test-subj', () => {
    const attachmentType = getEventType();
    const creationActivity = attachmentType.getCreationActivity({
      ...baseProps,
      attachmentId: ['event-id-1', 'event-id-2'],
    });

    render(<>{creationActivity.event}</>);

    expect(screen.getByTestId('event-user-action-saved-object-id-1')).toHaveTextContent(
      MULTIPLE_EVENTS_COMMENT_LABEL_TITLE(2)
    );
  });
});

describe('getDocumentAction', () => {
  const attachmentType = getEventType();

  it('returns a CUSTOM action when index is provided', () => {
    const action = attachmentType.getDocumentAction!({
      id: 'ua-1',
      documentId: 'event-1',
      index: '.alerts-security.alerts-default',
    });

    expect(action).toEqual(
      expect.objectContaining({ type: AttachmentActionType.CUSTOM, isPrimary: true })
    );
  });

  it('returns null when index is undefined', () => {
    const action = attachmentType.getDocumentAction!({
      id: 'ua-1',
      documentId: 'event-1',
      index: undefined,
    });

    expect(action).toBeNull();
  });

  it('returns null when index is an empty string', () => {
    const action = attachmentType.getDocumentAction!({
      id: 'ua-1',
      documentId: 'event-1',
      index: '',
    });

    expect(action).toBeNull();
  });

  it('passes id and eventId to ShowEventButton', () => {
    const action = attachmentType.getDocumentAction!({
      id: 'ua-1',
      documentId: 'event-abc',
      index: '.alerts-security.alerts-default',
    }) as Extract<AttachmentAction, { type: typeof AttachmentActionType.CUSTOM }>;

    // The CUSTOM action render() returns <Suspense><ShowEventButton .../></Suspense>.
    const suspense = action.render() as React.ReactElement;
    const showEventButton = suspense.props.children as React.ReactElement;
    expect(showEventButton.props.id).toBe('ua-1');
    expect(showEventButton.props.eventId).toBe('event-abc');
    expect(showEventButton.props.index).toBe('.alerts-security.alerts-default');
  });
});
