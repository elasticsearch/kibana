/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { caseFormFieldsSchemaWithOptionalLabel } from './schema';

describe('Template schema', () => {
  describe('caseFormFieldsSchemaWithOptionalLabel', () => {
    it('has label append for each field', () => {
      expect(caseFormFieldsSchemaWithOptionalLabel).toMatchInlineSnapshot(`
        Object {
          "assignees": Object {
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "category": Object {
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "connectorId": Object {
            "defaultValue": "none",
            "label": "External incident management system",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "customFields": Object {},
          "description": Object {
            "label": "Description",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
            "validations": Array [
              Object {
                "validator": [Function],
              },
            ],
          },
          "extended_fields": Object {
            "defaultValue": Object {},
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "extractObservables": Object {
            "defaultValue": true,
            "helpText": "Enabling this option will extract observables from the alert automatically.",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "fields": Object {
            "defaultValue": null,
          },
          "severity": Object {
            "label": "Severity",
          },
          "syncAlerts": Object {
            "defaultValue": true,
            "helpText": "Enabling this option will sync the detection statuses with the case status.",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "tags": Object {
            "helpText": "Separate tags with a line break.",
            "label": "Tags",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
            "validations": Array [
              Object {
                "isBlocking": false,
                "type": "arrayItem",
                "validator": [Function],
              },
              Object {
                "isBlocking": false,
                "type": "arrayItem",
                "validator": [Function],
              },
              Object {
                "validator": [Function],
              },
            ],
          },
          "templateId": Object {
            "defaultValue": "",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "templateVersion": Object {
            "defaultValue": 1,
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
          },
          "title": Object {
            "label": "Name",
            "labelAppend": <EuiText
              color="subdued"
              data-test-subj="form-optional-field-label"
              size="xs"
            >
              Optional
            </EuiText>,
            "validations": Array [
              Object {
                "validator": [Function],
              },
            ],
          },
        }
      `);
    });
  });
});
