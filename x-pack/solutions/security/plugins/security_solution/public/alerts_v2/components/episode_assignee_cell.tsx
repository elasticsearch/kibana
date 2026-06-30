/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import { useQuery } from '@kbn/react-query';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { UserAvatar, UserToolTip } from '@kbn/user-profile-components';
import { i18n } from '@kbn/i18n';

const UNASSIGNED = i18n.translate('xpack.securitySolution.alertsV2.assignee.empty', {
  defaultMessage: 'Unassigned',
});

const LOAD_ERROR = i18n.translate('xpack.securitySolution.alertsV2.assignee.loadError', {
  defaultMessage: 'Unable to load user',
});

export interface EpisodeAssigneeCellProps {
  assigneeUid: string | null | undefined;
  userProfile: UserProfileService;
}

export const EpisodeAssigneeCell: React.FC<EpisodeAssigneeCellProps> = ({
  assigneeUid,
  userProfile,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['securityAlertsV2AssigneeProfile', assigneeUid],
    queryFn: () =>
      userProfile.bulkGet({
        uids: new Set([assigneeUid as string]),
        dataPath: 'avatar',
      }),
    enabled: Boolean(assigneeUid),
    staleTime: 60_000,
    retry: 1,
  });

  if (!assigneeUid) {
    return (
      <EuiText color="subdued" size="s">
        {UNASSIGNED}
      </EuiText>
    );
  }

  if (isLoading) {
    return <EuiLoadingSpinner size="s" />;
  }

  if (isError) {
    return (
      <EuiText color="danger" size="s" title={assigneeUid}>
        {LOAD_ERROR}
      </EuiText>
    );
  }

  const profile = data?.[0] as UserProfileWithAvatar;

  if (!profile) {
    return (
      <EuiText color="subdued" size="s" title={assigneeUid}>
        {assigneeUid}
      </EuiText>
    );
  }

  const { user } = profile;
  const avatar = profile.data?.avatar;

  return (
    <UserToolTip user={user} avatar={avatar} position="top">
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} css={{ minWidth: 0 }}>
        <EuiFlexItem grow={false}>
          <UserAvatar user={user} avatar={avatar} size="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false} css={{ minWidth: 0 }}>
          <EuiText size="s" className="eui-textTruncate" title={user.username}>
            {user.username}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </UserToolTip>
  );
};
