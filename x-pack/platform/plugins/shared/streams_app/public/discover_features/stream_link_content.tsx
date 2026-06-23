/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiIconTip, EuiLink, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { StreamsAppLocator } from '../../common/locators';

type RemoteSearchType = 'cps' | 'ccs';

export interface StreamLinkContentProps {
  name: string | undefined;
  existsLocally: boolean | undefined;
  loading: boolean;
  error: Error | undefined;
  locator: StreamsAppLocator;
  remoteSearchType?: RemoteSearchType;
  renderRemoteWarning?: boolean;
  remoteName?: string;
}

export const StreamLinkContent = ({
  name,
  existsLocally,
  loading,
  error,
  locator,
  remoteSearchType,
  renderRemoteWarning,
  remoteName,
}: StreamLinkContentProps) => {
  if (loading) return <EuiLoadingSpinner size="s" />;

  if (!name || error) return <span>-</span>;

  return (
    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
      {existsLocally ? (
        <EuiLink href={locator.getRedirectUrl({ name })}>
          <EuiText size="xs">{name}</EuiText>
        </EuiLink>
      ) : (
        <EuiText size="xs">
          {name}
          {remoteName && remoteSearchType && ` (${REMOTE_LABELS[remoteSearchType]}: ${remoteName})`}
        </EuiText>
      )}
      {renderRemoteWarning && remoteSearchType && (
        <RemoteWarningIcon remoteSearchType={remoteSearchType} />
      )}
    </EuiFlexGroup>
  );
};

const REMOTE_LABELS: Record<RemoteSearchType, string> = {
  cps: i18n.translate('xpack.streams.discoverFlyout.remoteProjectLabel', {
    defaultMessage: 'Remote project',
  }),
  ccs: i18n.translate('xpack.streams.discoverFlyout.remoteClusterLabel', {
    defaultMessage: 'Remote cluster',
  }),
};

const WARNING_MESSAGES: Record<RemoteSearchType, string> = {
  cps: i18n.translate('xpack.streams.discoverFlyout.cpsWarning', {
    defaultMessage:
      'Cross-project search is active. This document may come from a linked project and might not be available in Streams.',
  }),
  ccs: i18n.translate('xpack.streams.discoverFlyout.ccsWarning', {
    defaultMessage:
      'Cross-cluster search is active. This document may come from a remote cluster and might not be available in Streams.',
  }),
};

const RemoteWarningIcon = ({ remoteSearchType }: { remoteSearchType: RemoteSearchType }) => (
  <EuiIconTip
    content={WARNING_MESSAGES[remoteSearchType]}
    type="warning"
    size="s"
    color="warning"
    anchorProps={{
      css: { display: 'flex' },
    }}
    iconProps={{
      'data-test-subj': `${remoteSearchType}StreamsWarningIcon`,
    }}
  />
);
