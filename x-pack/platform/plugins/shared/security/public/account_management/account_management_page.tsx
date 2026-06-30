/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiEmptyPrompt } from '@elastic/eui';
import type { FunctionComponent } from 'react';
import React from 'react';

import type { CoreStart } from '@kbn/core/public';
import { useCurrentUser } from '@kbn/core-user-profile-browser';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';

import { UserProfile } from './user_profile';
import { canUserHaveProfile } from '../../common/model';
import { Breadcrumb } from '../components/breadcrumb';

export const AccountManagementPage: FunctionComponent = () => {
  const { services } = useKibana<CoreStart>();

  const { rawAuthQuery, rawProfileQuery } = useCurrentUser({ includeRawQuerySource: true });
  const user = rawAuthQuery.state;
  const authError = rawAuthQuery.error;

  // If we fail to load profile, we treat it as a failure _only_ if user is supposed
  // to have a profile. For example, anonymous and users authenticated via
  // authentication proxies don't have profiles.
  const profileLoadError =
    rawProfileQuery.error && user && canUserHaveProfile(user) ? rawProfileQuery.error : undefined;

  const error = authError || profileLoadError;
  if (error) {
    return <EuiEmptyPrompt iconType="warning" title={<h2>{error.message}</h2>} />;
  }

  if (!user || (canUserHaveProfile(user) && !rawProfileQuery.state)) {
    return null;
  }

  return (
    <Breadcrumb
      text={i18n.translate('xpack.security.accountManagement.userSettingsBreadcrumbRootLabel', {
        defaultMessage: 'User settings',
      })}
      href={services.http.basePath.prepend('/security/account')}
    >
      <UserProfile user={user} data={rawProfileQuery.state?.data} />
    </Breadcrumb>
  );
};
