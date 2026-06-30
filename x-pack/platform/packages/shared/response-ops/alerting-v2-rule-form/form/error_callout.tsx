/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';
import { useFormContext, type FieldErrors } from 'react-hook-form';
import type { FormValues } from './types';

/**
 * Recursively extracts all error messages from a nested FieldErrors object.
 * Handles both flat errors (e.g., { name: { message: "..." } })
 * and nested errors (e.g., { evaluation: { query: { base: { message: "..." } } } })
 */
const extractErrorMessages = (errors: FieldErrors): string[] => {
  const messages: string[] = [];

  for (const value of Object.values(errors)) {
    if (!value) continue;

    // If this level has a message, it's a leaf error node
    if (typeof value.message === 'string' && value.message.length > 0) {
      messages.push(value.message);
    } else if (typeof value === 'object') {
      // Recurse into nested objects (excluding known FieldError properties)
      messages.push(...extractErrorMessages(value as FieldErrors));
    }
  }

  return messages;
};

export const ErrorCallOut = () => {
  const {
    formState: { errors, isSubmitted, submitCount },
  } = useFormContext<FormValues>();
  const calloutRef = useRef<HTMLDivElement>(null);

  const shouldShowCallout = isSubmitted && Object.keys(errors).length > 0;

  useEffect(() => {
    if (shouldShowCallout && calloutRef.current) {
      calloutRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [shouldShowCallout, submitCount]);

  if (!shouldShowCallout) {
    return null;
  }

  return (
    <>
      <div ref={calloutRef}>
        <EuiCallOut
          announceOnMount={true}
          title={i18n.translate('xpack.alertingV2.ruleForm.formErrorsTitle', {
            defaultMessage: 'Please address the highlighted errors.',
          })}
          color="danger"
        >
          <ul>
            {extractErrorMessages(errors).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </EuiCallOut>
      </div>
      <EuiSpacer size="m" />
    </>
  );
};
