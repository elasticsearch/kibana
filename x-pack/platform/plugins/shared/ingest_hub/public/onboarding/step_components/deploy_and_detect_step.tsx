/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonEmpty, EuiEmptyPrompt, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

interface DeployAndDetectStepProps {
  onNext: () => void;
  onBack?: () => void;
}

export function DeployAndDetectStep({ onBack }: DeployAndDetectStepProps) {
  return (
    <>
      {onBack && (
        <>
          <EuiButtonEmpty iconType="arrowLeft" iconSide="left" onClick={onBack}>
            <FormattedMessage
              id="xpack.ingestHub.deployAndDetectStep.backButton"
              defaultMessage="Back"
            />
          </EuiButtonEmpty>
          <EuiSpacer size="m" />
        </>
      )}
      <EuiEmptyPrompt
        data-test-subj="onboardingStep-deploy-and-detect"
        title={<h2>Deploy and Detect</h2>}
        body={<p>Deploy and Detect step content will go here.</p>}
      />
    </>
  );
}
