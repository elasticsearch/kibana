/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { EuiFieldText, EuiFormRow, EuiFormErrorText } from '@elastic/eui';
import { parseOneAddress } from 'email-addresses';
import { i18n } from '@kbn/i18n';

export interface EmailInputProps {
  email: string;
  handleChangeEmail: (email: string) => void;
  onValidationChange: (isValid: boolean) => void;
  getCurrentUserEmail: () => Promise<string | undefined>;
  forceShowError?: boolean;
}

const validateEmail = (value: string): boolean => {
  if (!value) {
    return false;
  }
  try {
    const parsed = parseOneAddress(value);
    return parsed !== null;
  } catch {
    return false;
  }
};

export const EmailInput = ({
  email,
  handleChangeEmail,
  onValidationChange,
  getCurrentUserEmail,
  forceShowError = false,
}: EmailInputProps) => {
  const hasFetchedEmailRef = useRef(false);
  const [touched, setTouched] = useState(false);

  const isValid = useMemo(() => validateEmail(email), [email]);

  const showError = (touched || forceShowError) && !isValid;

  useEffect(() => {
    onValidationChange(isValid);
  }, [isValid, onValidationChange]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleChangeEmail(e.target.value);
  };

  const handleBlur = () => {
    setTouched(true);
  };

  useEffect(() => {
    const fetchEmail = async () => {
      if (email || hasFetchedEmailRef.current) {
        return;
      }

      try {
        const userEmail = await getCurrentUserEmail();
        if (userEmail) {
          handleChangeEmail(userEmail);
        }
      } catch {
        handleChangeEmail('');
      } finally {
        hasFetchedEmailRef.current = true;
      }
    };

    fetchEmail();
  }, [getCurrentUserEmail, email, handleChangeEmail]);

  return (
    <>
      <EuiFormRow>
        <EuiFieldText
          data-test-subj="feedbackEmailInput"
          onChange={handleChange}
          onBlur={handleBlur}
          type="email"
          value={email}
          isInvalid={showError}
          placeholder={i18n.translate('kbnUI.feedback.emailInput.placeholder', {
            defaultMessage: 'Your email',
          })}
        />
      </EuiFormRow>
      {showError && (
        <EuiFormErrorText>
          {i18n.translate('kbnUI.feedback.emailInput.errorMessage', {
            defaultMessage: 'Enter a valid email address',
          })}
        </EuiFormErrorText>
      )}
    </>
  );
};
