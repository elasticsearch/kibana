/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { HttpStart } from '@kbn/core-http-browser';
import {
  buildCloudFormationUrl,
  buildS3BucketArn,
  isValidS3BucketName,
} from '../../application/quickstart_flows/cloudforwarder/utils';

interface CloudForwarderFlowResponse {
  onboardingId: string;
  apiKeyEncoded: string;
  managedOtlpServiceUrl: string;
}

interface ElbLogsPanelProps {
  http: Pick<HttpStart, 'post'>;
}

export const ElbLogsPanel: React.FC<ElbLogsPanelProps> = ({ http }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [s3BucketName, setS3BucketName] = useState('');
  const [flowData, setFlowData] = useState<CloudForwarderFlowResponse | null>(null);
  const [isFlowLoading, setIsFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const trimmedBucketName = s3BucketName.trim();
  const isBucketNameInvalid =
    trimmedBucketName.length > 0 && !isValidS3BucketName(trimmedBucketName);

  const fetchFlowData = useCallback(async () => {
    setIsFlowLoading(true);
    setFlowError(null);
    try {
      const data = await http.post<CloudForwarderFlowResponse>(
        '/internal/observability_onboarding/cloudforwarder/flow'
      );
      setFlowData(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : i18n.translate(
              'xpack.observability_onboarding.fleetIntegration.elbLogs.flowErrorFallback',
              { defaultMessage: 'Failed to initialize the EDOT Cloud Forwarder configuration' }
            );
      setFlowError(message);
    } finally {
      setIsFlowLoading(false);
    }
  }, [http]);

  useEffect(() => {
    if (isEnabled && !flowData && !isFlowLoading && !flowError) {
      fetchFlowData();
    }
  }, [isEnabled, flowData, isFlowLoading, flowError, fetchFlowData]);

  const handleToggleChange = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const cloudFormationHref =
    flowData !== null && isValidS3BucketName(trimmedBucketName)
      ? buildCloudFormationUrl(
          'elbaccess',
          flowData.managedOtlpServiceUrl,
          flowData.apiKeyEncoded,
          buildS3BucketArn(trimmedBucketName)
        )
      : undefined;

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiSwitch
            data-test-subj="fleetIntegrationElbLogsSwitch"
            label={
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate(
                    'xpack.observability_onboarding.fleetIntegration.elbLogs.toggleLabel',
                    { defaultMessage: 'ELB Logs' }
                  )}
                </h3>
              </EuiTitle>
            }
            checked={isEnabled}
            onChange={handleToggleChange}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            <p>
              {i18n.translate(
                'xpack.observability_onboarding.fleetIntegration.elbLogs.description',
                {
                  defaultMessage:
                    'Deploy the EDOT Cloud Forwarder to collect ELB access logs from S3.',
                }
              )}
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isEnabled && (
        <>
          <EuiSpacer size="m" />

          {isFlowLoading && <EuiLoadingSpinner />}

          {flowError !== null && !isFlowLoading && (
            <>
              <EuiCallOut
                announceOnMount
                title={i18n.translate(
                  'xpack.observability_onboarding.fleetIntegration.elbLogs.flowErrorTitle',
                  { defaultMessage: 'Unable to load ELB logs configuration' }
                )}
                color="danger"
                iconType="error"
              >
                <p>{flowError}</p>
              </EuiCallOut>
              <EuiSpacer size="m" />
              <EuiButton
                data-test-subj="fleetIntegrationElbLogsRetryButton"
                onClick={fetchFlowData}
                color="danger"
                size="s"
              >
                {i18n.translate(
                  'xpack.observability_onboarding.fleetIntegration.elbLogs.retryButtonLabel',
                  { defaultMessage: 'Retry' }
                )}
              </EuiButton>
            </>
          )}

          {!isFlowLoading && flowData !== null && (
            <>
              <EuiFormRow
                label={i18n.translate(
                  'xpack.observability_onboarding.fleetIntegration.elbLogs.s3BucketNameLabel',
                  { defaultMessage: 'S3 bucket name' }
                )}
                isInvalid={isBucketNameInvalid}
                error={
                  isBucketNameInvalid
                    ? i18n.translate(
                        'xpack.observability_onboarding.fleetIntegration.elbLogs.s3BucketNameError',
                        {
                          defaultMessage:
                            'Enter a valid S3 bucket name (3-63 lowercase characters, numbers, hyphens, or periods)',
                        }
                      )
                    : undefined
                }
              >
                <EuiFieldText
                  data-test-subj="fleetIntegrationElbLogsS3BucketNameInput"
                  value={s3BucketName}
                  onChange={(e) => setS3BucketName(e.target.value)}
                  isInvalid={isBucketNameInvalid}
                  placeholder={i18n.translate(
                    'xpack.observability_onboarding.fleetIntegration.elbLogs.s3BucketNamePlaceholder',
                    { defaultMessage: 'my-logs-bucket' }
                  )}
                />
              </EuiFormRow>
              <EuiSpacer size="m" />
              <EuiFlexGroup>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    data-test-subj="fleetIntegrationElbLogsLaunchStackButton"
                    href={cloudFormationHref}
                    target="_blank"
                    iconSide="right"
                    iconType="external"
                    size="s"
                    isDisabled={!isValidS3BucketName(trimmedBucketName)}
                  >
                    {i18n.translate(
                      'xpack.observability_onboarding.fleetIntegration.elbLogs.launchStackButtonLabel',
                      { defaultMessage: 'Launch stack in AWS' }
                    )}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}
        </>
      )}
    </>
  );
};
