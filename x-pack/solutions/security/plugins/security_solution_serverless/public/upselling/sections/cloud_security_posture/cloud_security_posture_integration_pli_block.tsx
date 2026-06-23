/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiCard, EuiIcon, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

/**
 * Component displayed when a given product tier is not allowed to use Cloud Security Posture Integrations installation forms.
 */
export const CloudSecurityPostureIntegrationPliBlock = memo(() => {
  // TODO: prefer to use getProductTypeByPLI(ProductFeatureKey.cloudSecurityPosture) after we change returned text to include "Protection"
  const requiredPLI = 'Cloud Protection Essentials';

  return (
    <>
      <EuiSpacer size="s" />
      <EuiCard
        data-test-subj="cloud-security-posture-integration-pli-auth-block"
        isDisabled={true}
        description={false}
        icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
        betaBadgeProps={{
          label: i18n.translate(
            'xpack.securitySolutionServerless.cloudSecurityPostureIntegrationPliBlock.badgeText',
            {
              defaultMessage: 'Cloud Protection Essentials',
            }
          ),
        }}
        title={
          <h3>
            <strong>
              {i18n.translate(
                'xpack.securitySolutionServerless.cloudSecurityPostureIntegrationPliBlock.cardTitle',
                {
                  defaultMessage: 'Protection updates',
                }
              )}
            </strong>
          </h3>
        }
      >
        <div>
          {i18n.translate(
            'xpack.securitySolutionServerless.cloudSecurityPostureIntegrationPliBlock.cardMessage',
            {
              defaultMessage:
                'To turn on CSPM, KSPM or CNVM, view your Cloud Posture Dashboards and generate findings of misconfiguration or vulnerabilities in your cloud environment, you must add {requiredPLI} under Manage --> Project features.',
              values: {
                requiredPLI,
              },
            }
          )}
        </div>
      </EuiCard>
    </>
  );
});
CloudSecurityPostureIntegrationPliBlock.displayName = 'CloudSecurityPostureIntegrationPliBlock';
