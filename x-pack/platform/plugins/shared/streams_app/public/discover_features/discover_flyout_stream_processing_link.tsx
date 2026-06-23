/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type DataTableRecord } from '@kbn/discover-utils';
import type { HttpStart } from '@kbn/core/public';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import {
  EuiIconTip,
  EuiLoadingSpinner,
  EuiLink,
  EuiFlexGroup,
  EuiToolTip,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { CUSTOM_SAMPLES_DATA_SOURCE_STORAGE_KEY_PREFIX } from '../../common/url_schema/common';
import type { StreamsAppLocator, StreamsAppLocatorDefinitionParams } from '../../common/locators';
import {
  adaptDocToResolverInputs,
  useResolvedDefinitionName,
} from './use_resolved_definition_name';
import { useCcsHasRemoteClusters } from './use_ccs_has_remote_clusters';

export interface DiscoverFlyoutStreamProcessingLinkProps {
  dataView: DataView;
  doc: DataTableRecord;
  fieldFormats: FieldFormatsStart;
  locator: StreamsAppLocator;
  streamsRepositoryClient: StreamsRepositoryClient;
  http: HttpStart;
  isServerless: boolean;
  cpsHasLinkedProjects?: boolean;
}

export function DiscoverFlyoutStreamProcessingLink({
  doc,
  locator,
  streamsRepositoryClient,
  http,
  isServerless,
  cpsHasLinkedProjects,
}: DiscoverFlyoutStreamProcessingLinkProps) {
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

  if (loading) return <EuiLoadingSpinner size="s" />;

  const { name, existsLocally } = value ?? {};

  if (!name || !existsLocally || error) return null;

  const href = locator.getRedirectUrl({
    name,
    managementTab: 'processing',
    pageState: {
      v: 1,
      dataSources: [getTargetDataSource(doc, name)],
    },
  } as StreamsAppLocatorDefinitionParams);

  const message = i18n.translate('xpack.streams.discoverFlyoutStreamProcessingLink', {
    defaultMessage: 'Parse content in Streams',
  });

  return (
    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
      <EuiLink href={href}>
        <EuiToolTip content={message} display="block">
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiText size="xs" className="eui-textTruncate">
              {message}
            </EuiText>
          </EuiFlexGroup>
        </EuiToolTip>
      </EuiLink>
      {remoteSearchType && !index && (
        <EuiIconTip
          content={PROCESSING_WARNING_MESSAGES[remoteSearchType]}
          type="warning"
          size="s"
          color="warning"
          data-test-subj={`${remoteSearchType}StreamsProcessingWarningIcon`}
          anchorProps={{
            css: { display: 'flex' },
          }}
        />
      )}
    </EuiFlexGroup>
  );
}

const PROCESSING_WARNING_MESSAGES: Record<'cps' | 'ccs', string> = {
  cps: i18n.translate('xpack.streams.discoverFlyoutStreamProcessingLink.cpsWarning', {
    defaultMessage:
      'Cross-project search is active. This document may come from a linked project and might not be available in Streams.',
  }),
  ccs: i18n.translate('xpack.streams.discoverFlyoutStreamProcessingLink.ccsWarning', {
    defaultMessage:
      'Cross-cluster search is active. This document may come from a remote cluster and might not be available in Streams.',
  }),
};

const getTargetDataSource = (doc: DataTableRecord, streamName: string) => {
  const baseDataSource = {
    enabled: true,
    name: i18n.translate('xpack.streams.discoverFlyoutStreamProcessingLink.customSamplesName', {
      defaultMessage: 'Discover document from {streamName}',
      values: { streamName },
    }),
  };

  if (doc.raw._id) {
    return {
      ...baseDataSource,
      type: 'kql-samples',
      query: {
        language: 'kuery',
        query: `_id: ${doc.raw._id}`,
      },
    };
  }

  return {
    ...baseDataSource,
    type: 'custom-samples',
    documents: [doc.flattened],
    storageKey: `${CUSTOM_SAMPLES_DATA_SOURCE_STORAGE_KEY_PREFIX}${streamName}__discover-document`,
  };
};
