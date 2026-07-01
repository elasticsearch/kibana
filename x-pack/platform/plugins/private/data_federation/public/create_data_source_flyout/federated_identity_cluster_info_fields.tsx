/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonIcon, EuiCopy, EuiFieldText, EuiFormRow } from '@elastic/eui';
import type { FederatedIdentityClusterInfo } from './federated_identity_cluster_info';

function ReadOnlyFormRow({ label, value }: { label: string; value: string }) {
  return (
    <EuiFormRow label={label} fullWidth>
      <div style={{ position: 'relative' }}>
        <EuiFieldText readOnly fullWidth value={value} style={{ paddingRight: '2rem' }} />
        <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
          <EuiCopy textToCopy={value}>
            {(copy) => (
              <EuiButtonIcon
                iconType="copyClipboard"
                display="empty"
                onClick={copy}
                aria-label={i18n.translate(
                  'xpack.dataFederation.createFlyout.federated.copyAriaLabel',
                  { defaultMessage: 'Copy to clipboard' }
                )}
              />
            )}
          </EuiCopy>
        </div>
      </div>
    </EuiFormRow>
  );
}

/**
 * Read-only fields shown below Role ARN in the S3 federated identity auth section.
 * They display cluster-level values the user needs to configure the CSP trust policy.
 * These fields do NOT use useController, so they are never submitted with the form.
 */
export function FederatedIdentityClusterInfoFields({
  cloudInfo,
}: {
  cloudInfo?: FederatedIdentityClusterInfo;
}) {
  if (!cloudInfo?.jwtIssuer) return null;

  return (
    <>
      <ReadOnlyFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.federated.jwtIssuer', {
          defaultMessage: 'JWT issuer',
        })}
        value={cloudInfo?.jwtIssuer ?? ''}
      />
      <ReadOnlyFormRow
        label={
          cloudInfo?.isServerless
            ? i18n.translate('xpack.dataFederation.createFlyout.s3.federated.projectId', {
                defaultMessage: 'Project ID',
              })
            : i18n.translate('xpack.dataFederation.createFlyout.s3.federated.deploymentId', {
                defaultMessage: 'Deployment ID',
              })
        }
        value={cloudInfo?.deploymentId ?? ''}
      />
    </>
  );
}
