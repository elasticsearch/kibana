/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, render } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { Form, useForm, FIELD_TYPES } from '../../../../shared_imports';
import { THRESHOLD_ALERT_SUPPRESSION_ENABLED } from './fields';
import { ThresholdAlertSuppressionEdit } from './threshold_alert_suppression_edit';

const FORM_SCHEMA = {
  [THRESHOLD_ALERT_SUPPRESSION_ENABLED]: { type: FIELD_TYPES.CHECKBOX },
  alertSuppressionDurationType: {},
  alertSuppressionDuration: { value: {}, unit: {} },
};

function TestForm({ labelAppend }: { labelAppend?: React.ReactNode }) {
  const { form } = useForm({ schema: FORM_SCHEMA });

  return (
    <I18nProvider>
      <Form form={form}>
        <ThresholdAlertSuppressionEdit
          suppressionFieldNames={undefined}
          labelAppend={labelAppend}
        />
      </Form>
    </I18nProvider>
  );
}

describe('ThresholdAlertSuppressionEdit', () => {
  it('renders labelAppend when provided', () => {
    render(<TestForm labelAppend={<span data-test-subj="optional-label">{'Optional'}</span>} />);
    expect(screen.getByTestId('optional-label')).toBeInTheDocument();
  });

  it('does not render labelAppend when not provided', () => {
    render(<TestForm />);
    expect(screen.queryByTestId('optional-label')).not.toBeInTheDocument();
  });
});
