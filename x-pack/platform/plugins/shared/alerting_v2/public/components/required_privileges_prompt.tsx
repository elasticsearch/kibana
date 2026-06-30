/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AlertingRequiredPrivilege } from '../lib/required_privileges';

export interface RequiredPrivilegesPromptProps {
  /** Human-readable name of the page the user attempted to view, e.g. "Rules". */
  pageName: string;
  /** Privileges the user is missing, shown so they know exactly what to request. */
  requiredPrivileges: readonly AlertingRequiredPrivilege[];
}

const PRIVILEGE_LABELS: Record<AlertingRequiredPrivilege['privilege'], string> = {
  read: i18n.translate('xpack.alertingV2.requiredPrivileges.readPrivilegeLabel', {
    defaultMessage: 'Read',
  }),
  all: i18n.translate('xpack.alertingV2.requiredPrivileges.allPrivilegeLabel', {
    defaultMessage: 'All',
  }),
};

/**
 * Full-page interstitial shown when a user navigates to an alerting_v2
 * management page without the required feature privileges. Follows the
 * standard Kibana "Privileges required" empty-prompt pattern and lists the
 * feature privileges the user needs so they can request access.
 */
export const RequiredPrivilegesPrompt = ({
  pageName,
  requiredPrivileges,
}: RequiredPrivilegesPromptProps) => (
  <EuiEmptyPrompt
    data-test-subj="alertingRequiredPrivilegesPrompt"
    iconType="lock"
    color="subdued"
    title={
      <h2>
        <FormattedMessage
          id="xpack.alertingV2.requiredPrivileges.title"
          defaultMessage="Privileges required"
        />
      </h2>
    }
    body={
      <>
        <EuiText size="m">
          <p>
            <FormattedMessage
              id="xpack.alertingV2.requiredPrivileges.body"
              defaultMessage="To view {pageName}, you need the following {count, plural, one {privilege} other {privileges}}. Contact your administrator to request access."
              values={{ pageName: <strong>{pageName}</strong>, count: requiredPrivileges.length }}
            />
          </p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiText size="s">
          {requiredPrivileges.map(({ featureId, featureName, privilege }) => (
            <p key={featureId} data-test-subj={`alertingRequiredPrivilege-${featureId}`}>
              <FormattedMessage
                id="xpack.alertingV2.requiredPrivileges.privilegeItem"
                defaultMessage="{featureName}: {privilege}"
                values={{
                  featureName: <strong>{featureName}</strong>,
                  privilege: <strong>{PRIVILEGE_LABELS[privilege]}</strong>,
                }}
              />
            </p>
          ))}
        </EuiText>
      </>
    }
  />
);
