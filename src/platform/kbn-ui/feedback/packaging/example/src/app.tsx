/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import {
  EuiProvider,
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiSpacer,
  EuiText,
  EuiCode,
} from '@elastic/eui';

import { FeedbackTriggerButton } from '../../..';
import type { FeedbackRegistryEntry, FeedbackFormData } from '../../..';

const QUESTIONS: FeedbackRegistryEntry[] = [
  {
    id: 'experience',
    order: 1,
    question: 'How was your experience?',
    label: { i18nId: 'example.experience', defaultMessage: 'How was your experience?' },
    placeholder: { i18nId: 'example.experience.placeholder', defaultMessage: 'Tell us more...' },
  },
  {
    id: 'general',
    order: 2,
    question: 'Anything else to share?',
    label: { i18nId: 'example.general', defaultMessage: 'Anything else to share?' },
  },
];

const App = () => {
  const [lastSubmitted, setLastSubmitted] = useState<FeedbackFormData | null>(null);
  const [lastToast, setLastToast] = useState<string>('');

  const getQuestions = async () => QUESTIONS;
  const getAppDetails = () => ({ title: 'Example App', id: 'example', url: window.location.href });
  const getCurrentUserEmail = async () => undefined;
  const checkTelemetryOptIn = async () => true;

  const sendFeedback = async (data: FeedbackFormData) => {
    setLastSubmitted(data);
  };

  const showToast = (title: string, type: 'success' | 'error') => {
    setLastToast(`[${type}] ${title}`);
  };

  return (
    <EuiProvider colorMode="light">
      <EuiHeader>
        <EuiHeaderSection side="right">
          <EuiHeaderSectionItem>
            <FeedbackTriggerButton
              {...{
                getQuestions,
                getAppDetails,
                getCurrentUserEmail,
                sendFeedback,
                showToast,
                checkTelemetryOptIn,
              }}
            />
          </EuiHeaderSectionItem>
        </EuiHeaderSection>
      </EuiHeader>

      <main role="main" style={{ padding: '24px' }}>
        <EuiText>
          <h1>
            <EuiCode>FeedbackTriggerButton</EuiCode> Example
          </h1>
          <p>Click the comment icon in the header to open the feedback form.</p>
          <p>
            Last toast: <EuiCode>{lastToast || 'none'}</EuiCode>
          </p>
        </EuiText>

        <EuiSpacer />

        <EuiText>
          <h2>Last submission</h2>
          <pre>{lastSubmitted ? JSON.stringify(lastSubmitted, null, 2) : 'none yet'}</pre>
        </EuiText>

        <EuiSpacer />

        <EuiText>
          <h2>Test cases</h2>
          <ul>
            <li>Open the modal and submit a CSAT rating only.</li>
            <li>Answer the free-text questions and submit.</li>
            <li>Toggle email contact and provide an email address.</li>
            <li>Verify the submitted payload appears above.</li>
          </ul>
        </EuiText>
      </main>
    </EuiProvider>
  );
};

// eslint-disable-next-line import/no-default-export
export default App;
