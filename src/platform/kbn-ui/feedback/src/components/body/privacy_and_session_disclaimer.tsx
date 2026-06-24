/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

export const PrivacyAndSessionDisclaimer = () => (
  <>
    <EuiSpacer size="l" />
    <EuiText size="xs" color="subdued" data-test-subj="feedbackDisclaimerSupportInfo">
      <FormattedMessage
        id="kbnUI.feedback.disclaimer.supportInfo"
        defaultMessage="If you need assistance, submit a <supportLink>support request</supportLink> instead."
        values={{
          supportLink: (linkText) => (
            <EuiLink href="https://support.elastic.co" target="_blank">
              {linkText}
            </EuiLink>
          ),
        }}
      />
    </EuiText>
    <EuiSpacer size="xs" />
    <EuiText size="xs" color="subdued" data-test-subj="feedbackDisclaimerSessionInfo">
      <FormattedMessage
        id="kbnUI.feedback.disclaimer.sessionInfo"
        defaultMessage="Some session information is sent to Elastic. We use it to improve Elastic. If you've opted-in, we'll use your email to follow up. Please avoid sharing sensitive info (like passwords)."
      />
    </EuiText>
    <EuiText size="xs" color="subdued" data-test-subj="feedbackDisclaimerPrivacyStatement">
      <FormattedMessage
        id="kbnUI.feedback.disclaimer.privacyStatement"
        defaultMessage="See our <privacyStatement>Privacy Statement</privacyStatement> for details and your rights."
        values={{
          privacyStatement: (linkText) => (
            <EuiLink href="https://www.elastic.co/legal/privacy-statement" target="_blank">
              {linkText}
            </EuiLink>
          ),
        }}
      />
    </EuiText>
  </>
);
