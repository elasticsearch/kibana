/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../common/agent_builder';
import { registerDiscoverSessionAttachmentUi } from './register_discover_session_ui';

describe('registerDiscoverSessionAttachmentUi', () => {
  it('registers discover.session with a title label', () => {
    const addAttachmentType = jest.fn();
    const unifiedSearch = {
      ui: { SearchBar: () => null },
    } as unknown as UnifiedSearchPublicPluginStart;

    registerDiscoverSessionAttachmentUi({
      agentBuilder: {
        attachments: { addAttachmentType },
      } as unknown as AgentBuilderPluginStart,
      unifiedSearch,
    });

    expect(addAttachmentType).toHaveBeenCalledWith(
      DISCOVER_SESSION_ATTACHMENT_TYPE,
      expect.objectContaining({
        getIcon: expect.any(Function),
        renderInlineContent: expect.any(Function),
      })
    );

    const definition = addAttachmentType.mock.calls[0][1];
    expect(definition.getLabel({ data: { title: 'Nginx errors' } })).toBe('Nginx errors');
    expect(definition.getLabel({ data: {} })).toBe('Discover session');
    expect(definition.getIcon()).toBe('discoverApp');
  });
});
