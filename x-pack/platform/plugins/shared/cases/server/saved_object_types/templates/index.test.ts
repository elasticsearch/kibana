/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { caseTemplateSavedObjectType } from '.';

describe('caseTemplateSavedObjectType', () => {
  it('has the correct configuration', () => {
    expect(caseTemplateSavedObjectType.name).toBe('cases-templates');
    expect(caseTemplateSavedObjectType.hidden).toBe(true);
    expect(caseTemplateSavedObjectType.namespaceType).toBe('multiple-isolated');
    expect(caseTemplateSavedObjectType.convertToMultiNamespaceTypeVersion).toBe('8.0.0');
  });

  it('has the correct mappings', () => {
    expect(caseTemplateSavedObjectType.mappings).toMatchInlineSnapshot(`
      Object {
        "dynamic": false,
        "properties": Object {
          "author": Object {
            "ignore_above": 1024,
            "type": "keyword",
          },
          "definition": Object {
            "type": "text",
          },
          "deletedAt": Object {
            "type": "date",
          },
          "description": Object {
            "type": "text",
          },
          "fieldCount": Object {
            "type": "integer",
          },
          "fieldNames": Object {
            "properties": Object {
              "control": Object {
                "ignore_above": 1024,
                "type": "keyword",
              },
              "label": Object {
                "type": "text",
              },
              "name": Object {
                "ignore_above": 1024,
                "type": "keyword",
              },
              "type": Object {
                "ignore_above": 1024,
                "type": "keyword",
              },
            },
            "type": "nested",
          },
          "isDefault": Object {
            "type": "boolean",
          },
          "isEnabled": Object {
            "type": "boolean",
          },
          "isLatest": Object {
            "type": "boolean",
          },
          "lastUsedAt": Object {
            "type": "date",
          },
          "name": Object {
            "ignore_above": 1024,
            "type": "keyword",
          },
          "owner": Object {
            "ignore_above": 1024,
            "type": "keyword",
          },
          "tags": Object {
            "ignore_above": 1024,
            "type": "keyword",
          },
          "templateId": Object {
            "ignore_above": 1024,
            "type": "keyword",
          },
          "templateVersion": Object {
            "type": "integer",
          },
          "usageCount": Object {
            "type": "integer",
          },
        },
      }
    `);
  });
});
