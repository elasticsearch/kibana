/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Suspense } from 'react';
import type { ApplicationStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../common/agent_builder';
import type { DiscoverAppLocator } from '../../common';
import type { DiscoverSessionApiData } from '../../server';

const LazyDiscoverSessionInline = React.lazy(async () => {
  const { DiscoverSessionInline } = await import('./discover_session_inline');
  return { default: DiscoverSessionInline };
});

export const registerDiscoverSessionAttachmentUi = ({
  agentBuilder,
  unifiedSearch,
  locator,
  embeddable,
  application,
}: {
  agentBuilder: AgentBuilderPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  locator?: DiscoverAppLocator;
  embeddable?: EmbeddableStart;
  application?: ApplicationStart;
}) => {
  agentBuilder.attachments.addAttachmentType<
    Attachment<typeof DISCOVER_SESSION_ATTACHMENT_TYPE, DiscoverSessionApiData>
  >(DISCOVER_SESSION_ATTACHMENT_TYPE, {
    getLabel: (attachment) => {
      const title = attachment.data?.title;
      if (title) {
        return title;
      }
      return i18n.translate('discover.agentBuilder.discoverSessionAttachmentLabelDefault', {
        defaultMessage: 'Discover session',
      });
    },
    getIcon: () => 'discoverApp',
    renderInlineContent: ({ attachment, screenContext }, callbacks) => (
      <Suspense fallback={null}>
        <LazyDiscoverSessionInline
          data={attachment.data}
          screenContextTimeRange={screenContext?.time_range}
          unifiedSearch={unifiedSearch}
          locator={locator}
          embeddable={embeddable}
          application={application}
          registerActionButtons={callbacks?.registerActionButtons}
        />
      </Suspense>
    ),
  });
};
