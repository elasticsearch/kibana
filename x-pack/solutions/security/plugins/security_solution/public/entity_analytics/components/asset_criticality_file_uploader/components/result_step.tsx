/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { SecurityPageName } from '@kbn/deeplinks-security';
import { SecuritySolutionLinkButton } from '../../../../common/components/links';
import type { BulkUpsertAssetCriticalityRecordsResponse } from '../../../../../common/api/entity_analytics';
import { buildAnnotationsFromError } from '../helpers';

export const AssetCriticalityResultStep: React.FC<{
  result?: BulkUpsertAssetCriticalityRecordsResponse;
  validLinesAsText: string;
  errorMessage?: string;
  onReturn: () => void;
}> = React.memo(({ result, validLinesAsText, errorMessage, onReturn }) => {
  const { euiTheme } = useEuiTheme();

  if (errorMessage !== undefined) {
    return (
      <>
        <EuiCallOut
          announceOnMount
          data-test-subj="asset-criticality-result-step-error"
          title={
            <FormattedMessage
              defaultMessage="Asset criticality assignment failed."
              id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.errorMessage"
            />
          }
          color="danger"
          iconType="error"
        >
          {errorMessage}
        </EuiCallOut>
        <ResultStepFooter onReturn={onReturn} />
      </>
    );
  }

  if (result === undefined) {
    return null;
  }

  if (result.stats.failed === 0) {
    return (
      <>
        <EuiCallOut
          announceOnMount
          data-test-subj="asset-criticality-result-step-success"
          title={
            <FormattedMessage
              defaultMessage="Success"
              id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.successTitle"
            />
          }
          color="success"
          iconType="checkCircleFill"
        >
          <FormattedMessage
            defaultMessage="Your asset criticality levels have been assigned. Note that your assignments can take a few moments to populate."
            id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.successMessage"
          />
          <EuiSpacer size="s" />
          <SecuritySolutionLinkButton deepLinkId={SecurityPageName.entityAnalytics} color="success">
            {
              <FormattedMessage
                defaultMessage="View asset criticality assignments."
                id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.viewAssetCriticalityAssignments"
              />
            }
          </SecuritySolutionLinkButton>
        </EuiCallOut>
        <EuiSpacer size="s" />
        <ResultStepFooter onReturn={onReturn} />
      </>
    );
  }

  const annotations = buildAnnotationsFromError(result.errors);

  return (
    <>
      <EuiCallOut
        data-test-subj="asset-criticality-result-step-warning"
        title={
          <FormattedMessage
            defaultMessage="Some asset criticality assignments were unsuccessful due to errors."
            id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.partialError.title"
          />
        }
        color="warning"
        iconType="warning"
      >
        <EuiSpacer size="s" />
        <p>
          <FormattedMessage
            defaultMessage="{assignedCount, plural, one {# asset criticality assignment succeeded.} other {# asset criticality assignments succeeded.}}"
            id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.partialError.assignedEntities"
            values={{ assignedCount: result.stats.successful }}
          />
        </p>
        <p>
          <FormattedMessage
            defaultMessage="{failedCount, plural, one {# asset criticality assignment failed.} other {# asset criticality assignments failed.}}"
            id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.partialError.failedEntities"
            values={{ failedCount: result.stats.failed }}
          />
        </p>

        <EuiCodeBlock
          overflowHeight={400}
          language="CSV"
          isVirtualized
          css={css`
            border: 1px solid ${euiTheme.colors.warning};
          `}
          lineNumbers={{ annotations }}
        >
          {validLinesAsText}
        </EuiCodeBlock>
      </EuiCallOut>
      <ResultStepFooter onReturn={onReturn} />
    </>
  );
});

AssetCriticalityResultStep.displayName = 'AssetCriticalityResultStep';

const ResultStepFooter = ({ onReturn }: { onReturn: () => void }) => (
  <>
    <EuiSpacer size="xl" />
    <EuiHorizontalRule />
    <EuiFlexGroup justifyContent="flexEnd">
      <EuiButtonEmpty onClick={onReturn}>
        <FormattedMessage
          defaultMessage="Upload another file"
          id="xpack.securitySolution.entityAnalytics.assetCriticalityResultStep.uploadAnotherFile"
        />
      </EuiButtonEmpty>
    </EuiFlexGroup>
  </>
);
