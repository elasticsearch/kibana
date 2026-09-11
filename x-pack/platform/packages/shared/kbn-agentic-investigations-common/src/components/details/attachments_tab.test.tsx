/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import type { Conversation, VersionedAttachment } from '@kbn/agent-builder-common';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import { AttachmentsTab } from './details_flyout_tab_contents';

const buildAttachment = (overrides: Partial<VersionedAttachment> = {}): VersionedAttachment => ({
  id: 'attachment-1',
  type: 'blastRadius',
  current_version: 2,
  versions: [
    {
      version: 1,
      data: { content: 'stale' },
      created_at: '2024-01-01T00:00:00Z',
      content_hash: 'a',
    },
    {
      version: 2,
      data: { content: 'blast radius attachment' },
      created_at: '2024-01-02T00:00:00Z',
      content_hash: 'b',
    },
  ],
  ...overrides,
});

const buildConversation = (attachments: VersionedAttachment[]): Conversation => ({
  id: 'conversation-1',
  agent_id: 'agent',
  user: { username: 'test' },
  title: 'Impossible travel',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  rounds: [],
  attachments,
});

const createService = (getAttachmentUiDefinition: jest.Mock): AttachmentServiceStartContract =>
  ({
    addAttachmentType: jest.fn(),
    getAttachmentUiDefinition,
    getClient: jest.fn(),
  } as unknown as AttachmentServiceStartContract);

describe('AttachmentsTab', () => {
  it('renders the latest version through the registered details renderer', () => {
    const service = createService(
      jest.fn().mockReturnValue({
        getLabel: () => 'Blast radius',
        renderConversationDetailsContent: ({
          attachment,
        }: {
          attachment: { data: { content: string } };
        }) => <p>{attachment.data.content}</p>,
      })
    );

    renderWithKibanaRenderContext(
      <AttachmentsTab
        conversation={buildConversation([buildAttachment()])}
        attachmentsService={service}
      />
    );

    expect(screen.getByText('Blast radius')).toBeInTheDocument();
    expect(screen.getByText('blast radius attachment')).toBeInTheDocument();
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
  });

  it('skips attachment types without a details renderer', () => {
    const service = createService(jest.fn().mockReturnValue({ getLabel: () => 'Plain' }));

    renderWithKibanaRenderContext(
      <AttachmentsTab
        conversation={buildConversation([buildAttachment()])}
        attachmentsService={service}
      />
    );

    expect(screen.getByText('No attachments')).toBeInTheDocument();
  });

  it('skips hidden attachments', () => {
    const service = createService(
      jest.fn().mockReturnValue({
        getLabel: () => 'Blast radius',
        renderConversationDetailsContent: () => <p>{'rendered'}</p>,
      })
    );

    renderWithKibanaRenderContext(
      <AttachmentsTab
        conversation={buildConversation([buildAttachment({ hidden: true })])}
        attachmentsService={service}
      />
    );

    expect(screen.getByText('No attachments')).toBeInTheDocument();
  });

  it('renders the empty prompt when the conversation has no attachments', () => {
    const service = createService(jest.fn());

    renderWithKibanaRenderContext(
      <AttachmentsTab conversation={buildConversation([])} attachmentsService={service} />
    );

    expect(screen.getByText('No attachments')).toBeInTheDocument();
    expect(service.getAttachmentUiDefinition).not.toHaveBeenCalled();
  });
});
