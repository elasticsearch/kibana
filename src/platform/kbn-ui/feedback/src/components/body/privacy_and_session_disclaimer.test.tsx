/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { PrivacyAndSessionDisclaimer } from './privacy_and_session_disclaimer';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { screen } from '@testing-library/dom';

describe('PrivacyAndSessionDisclaimer', () => {
  it('should render privacy and session disclaimers', () => {
    renderWithI18n(<PrivacyAndSessionDisclaimer />);

    expect(screen.getByTestId('feedbackDisclaimerSupportInfo')).toBeInTheDocument();
    expect(screen.getByTestId('feedbackDisclaimerSessionInfo')).toBeInTheDocument();
    expect(screen.getByTestId('feedbackDisclaimerPrivacyStatement')).toBeInTheDocument();
  });
});
