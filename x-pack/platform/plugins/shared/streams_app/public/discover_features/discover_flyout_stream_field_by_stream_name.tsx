/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import React from 'react';
import type { StreamsAppLocator } from '../../common/locators';
import { useResolvedDefinitionName } from './use_resolved_definition_name';
import { StreamLinkContent } from './stream_link_content';

export interface DiscoverFlyoutStreamFieldByStreamNameProps {
  streamName: string;
  streamsRepositoryClient: StreamsRepositoryClient;
  locator: StreamsAppLocator;
  cpsHasLinkedProjects?: boolean;
}

export function DiscoverFlyoutStreamFieldByStreamName({
  streamName,
  streamsRepositoryClient,
  locator,
  cpsHasLinkedProjects,
}: DiscoverFlyoutStreamFieldByStreamNameProps) {
  const { value, loading, error } = useResolvedDefinitionName({
    streamsRepositoryClient,
    fallbackStreamName: streamName,
    cpsHasLinkedProjects,
  });

  return (
    <StreamLinkContent
      name={value?.name}
      existsLocally={value?.existsLocally}
      loading={loading}
      error={error}
      locator={locator}
      remoteSearchType={cpsHasLinkedProjects ? 'cps' : undefined}
    />
  );
}
