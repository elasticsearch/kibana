/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import type { HttpStart } from '@kbn/core/public';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { ContentFrameworkSection } from '@kbn/unified-doc-viewer-plugin/public';
import type { StreamsAppLocator } from '../../common/locators';
import {
  adaptDocToResolverInputs,
  useResolvedDefinitionName,
} from './use_resolved_definition_name';
import { StreamLinkContent } from './stream_link_content';
import { useCcsHasRemoteClusters } from './use_ccs_has_remote_clusters';

export interface DiscoverFlyoutStreamFieldProps {
  doc: DataTableRecord;
  streamsRepositoryClient: StreamsRepositoryClient;
  locator: StreamsAppLocator;
  http: HttpStart;
  isServerless: boolean;
  cpsHasLinkedProjects?: boolean;
}

export function DiscoverFlyoutStreamField(props: DiscoverFlyoutStreamFieldProps) {
  return (
    <ContentFrameworkSection
      id="discoverFlyoutStreamField"
      title={i18n.translate('xpack.streams.discoverFlyoutStreamField.title', {
        defaultMessage: 'Stream',
      })}
    >
      <DiscoverFlyoutStreamFieldContent {...props} />
    </ContentFrameworkSection>
  );
}

function DiscoverFlyoutStreamFieldContent({
  streamsRepositoryClient,
  doc,
  locator,
  http,
  isServerless,
  cpsHasLinkedProjects,
}: DiscoverFlyoutStreamFieldProps) {
  const { index, fallbackStreamName } = adaptDocToResolverInputs(doc);
  const ccsHasRemoteClusters = useCcsHasRemoteClusters({ http, isServerless });
  const { value, loading, error } = useResolvedDefinitionName({
    streamsRepositoryClient,
    index,
    fallbackStreamName,
    cpsHasLinkedProjects,
    ccsHasRemoteClusters,
  });

  const remoteSearchType = cpsHasLinkedProjects ? 'cps' : ccsHasRemoteClusters ? 'ccs' : undefined;

  return (
    <StreamLinkContent
      name={value?.name}
      existsLocally={value?.existsLocally}
      loading={loading}
      error={error}
      locator={locator}
      remoteSearchType={remoteSearchType}
      renderRemoteWarning={!!remoteSearchType && !index && value?.existsLocally}
      remoteName={value?.remoteProject}
    />
  );
}
