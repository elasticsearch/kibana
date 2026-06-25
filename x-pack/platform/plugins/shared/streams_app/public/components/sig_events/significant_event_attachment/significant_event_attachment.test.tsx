/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { BehaviorSubject, EMPTY } from 'rxjs';
import type { SignificantEventAttachment } from '@kbn/streams-plugin/common';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '@kbn/streams-plugin/common';
import { FocusedSignificantEventService } from '../../../services/significant_events/focused_significant_event_service';
import {
  registerSignificantEventAttachment,
  significantEventAttachmentDefinition,
} from './significant_event_attachment';
import { ActionButtonType } from '@kbn/agent-builder-browser/attachments';

const attachment: SignificantEventAttachment = {
  id: 'attachment-1',
  type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  data: {
    '@timestamp': '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    event_id: 'event-1',
    discovery_slug: 'payment-outage',
    status: 'promoted',
    stream_names: ['logs.payment'],
    title: 'Payment outage',
    summary: 'Payments are failing.',
    root_cause: 'Payment gateway timeout.',
    criticality: 90,
    confidence: 0.8,
    recommendations: ['Restart gateway client'],
  },
};

describe('significantEventAttachmentDefinition', () => {
  it('registers the attachment renderer', () => {
    const addAttachmentType = jest.fn();
    const cleanup = registerSignificantEventAttachment({
      agentBuilder: {
        addAttachment: jest.fn(),
        attachments: { addAttachmentType },
        events: {
          ui: { activeConversation$: new BehaviorSubject(null).asObservable() },
          getChatEvents$: jest.fn(() => EMPTY),
        },
      } as never,
      chrome: {
        sidebar: { getCurrentAppId$: () => new BehaviorSubject(null).asObservable() },
      } as never,
      focusedSignificantEventService: new FocusedSignificantEventService(),
    });

    cleanup();

    expect(addAttachmentType).toHaveBeenCalledWith(
      SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
      significantEventAttachmentDefinition
    );
  });

  it('returns the event title as label', () => {
    expect(significantEventAttachmentDefinition.getLabel(attachment)).toBe('Payment outage');
  });

  it('falls back to "Significant event" when title is empty', () => {
    const noTitle = { ...attachment, data: { ...attachment.data, title: '' } };
    expect(significantEventAttachmentDefinition.getLabel(noTitle)).toBe('Significant event');
  });

  it('returns "Significant event" as the header subtitle', () => {
    const header = significantEventAttachmentDefinition.getHeader?.({ attachment });
    expect(header?.subtitle).toBe('Significant event');
  });

  describe('getActionButtons', () => {
    const baseParams = {
      attachment,
      isSidebar: false,
      updateOrigin: jest.fn(),
    };

    it('returns an "Open" SECONDARY button when openCanvas is provided and not in canvas', () => {
      const openCanvas = jest.fn();
      const buttons =
        significantEventAttachmentDefinition.getActionButtons?.({
          ...baseParams,
          isCanvas: false,
          openCanvas,
        }) ?? [];

      expect(buttons).toHaveLength(1);
      expect(buttons[0].label).toBe('Open');
      expect(buttons[0].type).toBe(ActionButtonType.SECONDARY);

      buttons[0].handler();
      expect(openCanvas).toHaveBeenCalledTimes(1);
    });

    it('returns no buttons when already in canvas', () => {
      const buttons =
        significantEventAttachmentDefinition.getActionButtons?.({
          ...baseParams,
          isCanvas: true,
          openCanvas: jest.fn(),
        }) ?? [];

      expect(buttons).toHaveLength(0);
    });

    it('returns no buttons when openCanvas is undefined', () => {
      const buttons =
        significantEventAttachmentDefinition.getActionButtons?.({
          ...baseParams,
          isCanvas: false,
          openCanvas: undefined,
        }) ?? [];

      expect(buttons).toHaveLength(0);
    });
  });

  it('renders the canvas content with static event details', () => {
    render(
      <I18nProvider>
        <>
          {significantEventAttachmentDefinition.renderCanvasContent?.(
            { attachment, isSidebar: false },
            {
              registerActionButtons: jest.fn(),
              updateOrigin: jest.fn(),
              closeCanvas: jest.fn(),
            }
          )}
        </>
      </I18nProvider>
    );

    expect(screen.getByText('Payments are failing.')).toBeInTheDocument();
    expect(screen.getByText('Payment gateway timeout.')).toBeInTheDocument();
    expect(screen.getByText('logs.payment')).toBeInTheDocument();
    expect(screen.getByText('1. Restart gateway client')).toBeInTheDocument();
  });

  it('does not render inline content', () => {
    expect(significantEventAttachmentDefinition.renderInlineContent).toBeUndefined();
  });
});
