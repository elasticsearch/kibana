/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { RuleTester } from 'eslint';
import { RequireEuiFormCompressed } from './require_eui_form_compressed';

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2018,
    ecmaFeatures: {
      jsx: true,
    },
  },
});

tester.run('@kbn/alerting-v2/require_eui_form_compressed', RequireEuiFormCompressed, {
  valid: [
    {
      code: '<EuiFieldText compressed />',
    },
    {
      code: '<EuiFieldText compressed={true} />',
    },
    {
      code: '<EuiFieldText compressed={layout === "flyout"} />',
    },
    {
      code: '<EuiFieldNumber compressed />',
    },
    {
      code: '<EuiSelect compressed={isCompressed} />',
    },
    {
      code: '<EuiComboBox compressed />',
    },
    {
      code: '<EuiSuperSelect compressed />',
    },
    {
      code: '<EuiTextArea compressed />',
    },
    {
      code: '<EuiSuperDatePicker compressed />',
    },
    {
      code: '<EuiButton />',
      name: 'non-target components are ignored',
    },
    {
      code: '<EuiButtonGroup buttonSize="compressed" />',
      name: 'EuiButtonGroup with buttonSize compressed is valid',
    },
    {
      code: '<EuiButtonGroup buttonSize={layout === "flyout" ? "compressed" : "s"} />',
      name: 'EuiButtonGroup with dynamic buttonSize expression is valid',
    },
    {
      code: '<EuiFieldText compressed {...rest} />',
      name: 'spread props with explicit compressed are fine',
    },
  ],
  invalid: [
    {
      code: '<EuiFieldText />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiFieldNumber value={5} />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiSelect options={opts} />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiComboBox options={[]} />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiSuperSelect options={[]} />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiTextArea />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiSuperDatePicker />',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: '<EuiFieldNumber {...rest} value={localValue} />',
      errors: [{ messageId: 'missing' }],
      name: 'spread without explicit compressed is flagged',
    },
    {
      code: '<EuiButtonGroup options={[]} />',
      errors: [{ messageId: 'missing' }],
      name: 'EuiButtonGroup without buttonSize is flagged',
    },
    {
      code: '<EuiButtonGroup buttonSize="s" />',
      errors: [{ messageId: 'missing' }],
      name: 'EuiButtonGroup with non-compressed buttonSize is flagged',
    },
  ],
});
