/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import type { IamPolicyDocument } from '../../../common/iam_policy_document';
import type { ServiceIamPermissions } from '../../../common/iam_permissions_api';

export const AWS_PERMISSIONS_VIEWER_TEST_SUBJ = 'awsPermissionsViewer';
export const ALL_SERVICES_OPTION_VALUE = '__all__';

export interface AwsPermissionsViewerService {
  id: string;
  name: string;
}

export interface AwsPermissionsViewerProps {
  /** Per-service permissions (policy + managed ARNs) keyed by service id, from the endpoint. */
  byService: Record<string, ServiceIamPermissions>;
  /** Deduped union of all services' inline policy actions, from the endpoint. */
  merged: IamPolicyDocument;
  /** Deduped union of all services' managed policy ARNs, from the endpoint. */
  mergedManagedPolicyArns: string[];
  /** Display info for the dropdown (id + name). */
  services: AwsPermissionsViewerService[];
}

function getServiceLabel(service: AwsPermissionsViewerService, hasDuplicateNames: boolean): string {
  return hasDuplicateNames ? `${service.name} (${service.id})` : service.name;
}

export const AwsPermissionsViewer: React.FC<AwsPermissionsViewerProps> = ({
  byService,
  merged,
  mergedManagedPolicyArns,
  services,
}) => {
  const [selectedOption, setSelectedOption] = useState(ALL_SERVICES_OPTION_VALUE);

  const duplicateNames = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const { name } of services) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    return new Set(
      [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
    );
  }, [services]);

  const selectOptions = useMemo(() => {
    const allIntegrationsLabel = i18n.translate(
      'xpack.ingestHub.awsPermissionsViewer.allIntegrationsOption',
      { defaultMessage: 'All integrations' }
    );

    return [
      { value: ALL_SERVICES_OPTION_VALUE, text: allIntegrationsLabel },
      ...services
        .filter(({ id }) => id in byService)
        .map((service) => ({
          value: service.id,
          text: getServiceLabel(service, duplicateNames.has(service.name)),
        })),
    ];
  }, [services, byService, duplicateNames]);

  // Fall back to "all" if the selected service is no longer in the list.
  useEffect(() => {
    if (selectedOption !== ALL_SERVICES_OPTION_VALUE && !(selectedOption in byService)) {
      setSelectedOption(ALL_SERVICES_OPTION_VALUE);
    }
  }, [byService, selectedOption]);

  const { policyDocument, visibleManagedPolicyArns } = useMemo(() => {
    if (selectedOption === ALL_SERVICES_OPTION_VALUE) {
      return {
        policyDocument: JSON.stringify(merged, null, 2),
        visibleManagedPolicyArns: mergedManagedPolicyArns,
      };
    }
    const svc = byService[selectedOption];
    return {
      policyDocument: svc ? JSON.stringify(svc.policy, null, 2) : JSON.stringify(merged, null, 2),
      visibleManagedPolicyArns: svc ? svc.managedPolicyArns : mergedManagedPolicyArns,
    };
  }, [selectedOption, merged, mergedManagedPolicyArns, byService]);

  // Render only when at least one service has inline actions or managed policy ARNs.
  const hasPermissions =
    merged.Statement.flatMap((s) => s.Action).length > 0 || mergedManagedPolicyArns.length > 0;
  if (!hasPermissions) {
    return null;
  }

  return (
    <div data-test-subj={AWS_PERMISSIONS_VIEWER_TEST_SUBJ}>
      <EuiPanel
        paddingSize="none"
        hasBorder
        data-test-subj={`${AWS_PERMISSIONS_VIEWER_TEST_SUBJ}-panel`}
      >
        <EuiPanel color="subdued" paddingSize="s" hasShadow={false} hasBorder={false}>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    type="securityApp"
                    size="m"
                    color="primary"
                    aria-hidden={true}
                    data-test-subj={`${AWS_PERMISSIONS_VIEWER_TEST_SUBJ}-titleIcon`}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="xs">
                    <h4>
                      <FormattedMessage
                        id="xpack.ingestHub.awsPermissionsViewer.title"
                        defaultMessage="Required IAM permissions"
                      />
                    </h4>
                  </EuiTitle>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSelect
                compressed
                options={selectOptions}
                value={selectedOption}
                onChange={(event) => setSelectedOption(event.target.value)}
                aria-label={i18n.translate(
                  'xpack.ingestHub.awsPermissionsViewer.integrationSelectorLabel',
                  { defaultMessage: 'View permissions for' }
                )}
                data-test-subj={`${AWS_PERMISSIONS_VIEWER_TEST_SUBJ}-serviceSelector`}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
        <EuiPanel paddingSize="m" hasShadow={false} hasBorder={false}>
          <EuiText size="s" color="subdued">
            <p>
              <FormattedMessage
                id="xpack.ingestHub.awsPermissionsViewer.intro"
                defaultMessage="Attach this policy to the IAM user whose access keys you'll enter below."
              />
            </p>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiCodeBlock
            language="json"
            isCopyable
            paddingSize="s"
            overflowHeight={200}
            fontSize="s"
            data-test-subj={`${AWS_PERMISSIONS_VIEWER_TEST_SUBJ}-actionsList`}
          >
            {policyDocument}
          </EuiCodeBlock>
          {visibleManagedPolicyArns.length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiText size="s" color="subdued">
                <p>
                  <FormattedMessage
                    id="xpack.ingestHub.awsPermissionsViewer.managedPoliciesIntro"
                    defaultMessage="Also attach these AWS managed policies via {command}:"
                    values={{ command: <code>aws iam attach-user-policy</code> }}
                  />
                </p>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiListGroup
                bordered
                data-test-subj={`${AWS_PERMISSIONS_VIEWER_TEST_SUBJ}-managedPoliciesList`}
              >
                {visibleManagedPolicyArns.map((arn) => (
                  <EuiListGroupItem key={arn} label={arn} />
                ))}
              </EuiListGroup>
            </>
          )}
        </EuiPanel>
      </EuiPanel>
      <EuiSpacer size="l" />
    </div>
  );
};
