/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  GetWorkflowInsightsRequestSchema,
  UpdateWorkflowInsightRequestSchema,
  CreateWorkflowInsightRequestSchema,
  GetPendingInsightsRequestSchema,
} from './workflow_insights';

describe('Workflow Insights', () => {
  describe('GetWorkflowInsightsRequestSchema', () => {
    const validateQuery = (query: Record<string, unknown>) => {
      return schema.object(GetWorkflowInsightsRequestSchema).validate(query);
    };

    it('should validate successfully with valid parameters', () => {
      const validQuery = {
        query: {
          size: 10,
          from: 0,
          ids: ['valid-id-1', 'valid-id-2'],
          categories: ['endpoint'],
          types: ['incompatible_antivirus'],
          sourceTypes: ['llm-connector'],
          sourceIds: ['source-1', 'source-2'],
          targetTypes: ['endpoint'],
          targetIds: ['target-1', 'target-2'],
          actionTypes: ['refreshed', 'remediated'],
        },
      };

      expect(() => validateQuery(validQuery)).not.toThrow();
    });

    describe('policy_response_failure type validation', () => {
      it('should validate successfully with policy_response_failure type', () => {
        const validQuery = {
          query: {
            types: ['policy_response_failure'],
          },
        };

        expect(() => validateQuery(validQuery)).not.toThrow();
      });

      it('should validate successfully with mixed types including policy_response_failure', () => {
        const validQuery = {
          query: {
            types: ['incompatible_antivirus', 'policy_response_failure'],
          },
        };

        expect(() => validateQuery(validQuery)).not.toThrow();
      });

      it('should validate successfully with custom type', () => {
        const validQuery = {
          query: {
            types: ['custom'],
          },
        };

        expect(() => validateQuery(validQuery)).not.toThrow();
      });

      it('should validate successfully with all three types', () => {
        const validQuery = {
          query: {
            types: ['incompatible_antivirus', 'policy_response_failure', 'custom'],
          },
        };

        expect(() => validateQuery(validQuery)).not.toThrow();
      });
    });

    it('should throw an error for invalid types', () => {
      const invalidQuery = {
        query: {
          size: 'not-a-number', // Invalid size
          actionTypes: ['invalid-action'], // Invalid action type
        },
      };

      expect(() => validateQuery(invalidQuery)).toThrowErrorMatchingInlineSnapshot(
        '"[query.size]: expected value of type [number] but got [string]"'
      );
    });

    it('should throw an error if ids contain empty strings', () => {
      const invalidQuery = {
        query: {
          ids: ['valid-id', ''],
          actionTypes: ['refreshed'],
        },
      };

      expect(() => validateQuery(invalidQuery)).toThrowErrorMatchingInlineSnapshot(
        '"[query.ids.1]: value has length [0] but it must have a minimum length of [1]."'
      );
    });

    it('should throw an error if sourceIds contain empty strings', () => {
      const invalidQuery = {
        query: {
          sourceIds: ['valid-source', ' '],
          actionTypes: ['refreshed'],
        },
      };

      expect(() => validateQuery(invalidQuery)).toThrowErrorMatchingInlineSnapshot(
        '"[query.sourceIds.1]: sourceId cannot be an empty string"'
      );
    });

    it('should validate successfully when optional fields are omitted', () => {
      const validQuery = {
        query: {},
      };

      expect(() => validateQuery(validQuery)).not.toThrow();
    });

    describe('maxSize bounds', () => {
      it('should not accept more than 50 ids', () => {
        expect(() => validateQuery({ query: { ids: Array(51).fill('valid-id') } })).toThrow();
      });

      it('should not accept more than 50 sourceIds', () => {
        expect(() =>
          validateQuery({ query: { sourceIds: Array(51).fill('source-id') } })
        ).toThrow();
      });

      it('should not accept more than 50 targetIds', () => {
        expect(() =>
          validateQuery({ query: { targetIds: Array(51).fill('target-id') } })
        ).toThrow();
      });

      it('should not accept more than 20 categories', () => {
        expect(() =>
          validateQuery({ query: { categories: Array(21).fill('endpoint') } })
        ).toThrow();
      });

      it('should not accept more than 20 types', () => {
        expect(() =>
          validateQuery({ query: { types: Array(21).fill('incompatible_antivirus') } })
        ).toThrow();
      });

      it('should not accept more than 20 sourceTypes', () => {
        expect(() =>
          validateQuery({ query: { sourceTypes: Array(21).fill('llm-connector') } })
        ).toThrow();
      });

      it('should not accept more than 20 actionTypes', () => {
        expect(() =>
          validateQuery({ query: { actionTypes: Array(21).fill('refreshed') } })
        ).toThrow();
      });
    });

    describe('maxLength bounds', () => {
      it('should not accept an ids element longer than 256 characters', () => {
        expect(() => validateQuery({ query: { ids: ['a'.repeat(257)] } })).toThrow();
      });

      it('should not accept a sourceIds element longer than 256 characters', () => {
        expect(() => validateQuery({ query: { sourceIds: ['a'.repeat(257)] } })).toThrow();
      });

      it('should not accept a targetIds element longer than 256 characters', () => {
        expect(() => validateQuery({ query: { targetIds: ['a'.repeat(257)] } })).toThrow();
      });
    });

    it('should throw an error for unsupported categories or types', () => {
      const invalidQuery = {
        query: {
          categories: ['unsupported-category'],
          types: ['unsupported-type'],
          actionTypes: ['refreshed'],
        },
      };

      expect(() => validateQuery(invalidQuery)).toThrowErrorMatchingInlineSnapshot(
        '"[query.categories.0]: expected value to equal [endpoint]"'
      );
    });
  });

  describe('UpdateWorkflowInsightRequestSchema', () => {
    const validateRequest = (request: Record<string, unknown>) => {
      return schema.object(UpdateWorkflowInsightRequestSchema).validate(request);
    };

    it('should validate successfully with valid parameters', () => {
      const validRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          '@timestamp': '2024-11-29T00:00:00Z',
          message: 'Valid message',
          category: 'endpoint',
          type: 'incompatible_antivirus',
          source: {
            type: 'llm-connector',
            id: 'source-id',
            data_range_start: '2024-11-01T00:00:00Z',
            data_range_end: '2024-11-30T00:00:00Z',
          },
          target: {
            type: 'endpoint',
            ids: ['target-id-1', 'target-id-2'],
          },
          action: {
            type: 'refreshed',
            timestamp: '2024-11-29T00:00:00Z',
          },
          value: 'Valid value',
          remediation: {
            exception_list_items: [
              {
                list_id: 'list-id',
                name: 'Exception 1',
                description: 'Description',
                entries: [{ key: 'value' }],
                tags: ['tag1'],
                os_types: ['windows'],
              },
            ],
          },
          metadata: {
            notes: { note1: 'Value 1' },
            message_variables: ['var1', 'var2'],
          },
        },
      };

      expect(() => validateRequest(validRequest)).not.toThrow();
    });

    it('should throw an error if insightId is missing', () => {
      const invalidRequest = {
        params: {},
        body: {},
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(
        '"[params.insightId]: expected value of type [string] but got [undefined]"'
      );
    });

    it('should throw an error if insightId is an empty string', () => {
      const invalidRequest = {
        params: {
          insightId: '',
        },
        body: {},
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(
        '"[params.insightId]: value has length [0] but it must have a minimum length of [1]."'
      );
    });

    it('should throw an error if category is invalid', () => {
      const invalidRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          category: 'invalid-category', // Invalid category
          type: 'incompatible_antivirus',
          action: { type: 'refreshed' },
        },
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(
        '"[body.category]: expected value to equal [endpoint]"'
      );
    });

    it('should throw an error if type is invalid', () => {
      const invalidRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          type: 'invalid-type', // Invalid type
          action: { type: 'refreshed' },
        },
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(`
    "[body.type]: types that failed validation:
    - [body.type.0]: expected value to equal [incompatible_antivirus]
    - [body.type.1]: expected value to equal [policy_response_failure]
    - [body.type.2]: expected value to equal [custom]"
    `);
    });

    describe('policy_response_failure type validation in PUT requests', () => {
      it('should validate successfully with policy_response_failure type', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            type: 'policy_response_failure',
            action: { type: 'refreshed' },
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });

      it('should validate successfully with policy_response_failure in body fields', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            '@timestamp': '2024-11-29T00:00:00Z',
            message: 'Policy response failure detected',
            category: 'endpoint',
            type: 'policy_response_failure',
            source: {
              type: 'llm-connector',
              id: 'source-id',
              data_range_start: '2024-11-01T00:00:00Z',
              data_range_end: '2024-11-30T00:00:00Z',
            },
            target: {
              type: 'endpoint',
              ids: ['agent-1', 'agent-2'],
            },
            action: {
              type: 'remediated',
              timestamp: '2024-11-29T00:00:00Z',
            },
            value: 'Policy configuration issue',
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });

      it('should validate successfully with policy_response_failure remediation data', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            type: 'policy_response_failure',
            action: {
              type: 'remediated',
              timestamp: '2024-11-29T00:00:00Z',
            },
            remediation: {
              exception_list_items: [
                {
                  list_id: 'policy-exceptions',
                  name: 'Policy Response Exception',
                  description: 'Exception for policy response failures',
                  entries: [{ field: 'policy.response', value: 'failed' }],
                  tags: ['policy', 'response', 'failure'],
                  os_types: ['windows', 'linux'],
                },
              ],
            },
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });

      it('should validate successfully with policy_response_failure metadata', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            type: 'policy_response_failure',
            action: { type: 'refreshed' },
            metadata: {
              notes: {
                policy_id: 'policy-123',
                failure_reason: 'Configuration timeout',
              },
              message_variables: ['policy_id', 'failure_reason', 'agent_version'],
            },
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });
    });

    describe('custom type validation in PUT requests', () => {
      it('should validate successfully with custom type', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            type: 'custom',
            action: { type: 'refreshed' },
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });

      it('should validate successfully with custom type and body fields', () => {
        const validRequest = {
          params: {
            insightId: 'valid-insight-id',
          },
          body: {
            type: 'custom',
            message: 'Custom insight message',
            category: 'endpoint',
            action: { type: 'remediated', timestamp: '2024-11-29T00:00:00Z' },
            value: 'custom-value',
          },
        };

        expect(() => validateRequest(validRequest)).not.toThrow();
      });
    });

    describe('maxSize bounds', () => {
      const baseRequest = {
        params: { insightId: 'valid-insight-id' },
        body: {},
      };

      it('should not accept more than 50 target ids', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { target: { ids: Array(51).fill('target-id') } },
          })
        ).toThrow();
      });

      it('should not accept more than 100 exception_list_items', () => {
        const item = {
          list_id: 'list-id',
          name: 'Exception',
          entries: [],
        };
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { remediation: { exception_list_items: Array(101).fill(item) } },
          })
        ).toThrow();
      });

      it('should not accept more than 250 entries in an exception list item', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: {
              remediation: {
                exception_list_items: [{ list_id: 'list-id', entries: Array(251).fill({}) }],
              },
            },
          })
        ).toThrow();
      });

      it('should not accept more than 50 tags in an exception list item', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: {
              remediation: {
                exception_list_items: [{ list_id: 'list-id', tags: Array(51).fill('tag') }],
              },
            },
          })
        ).toThrow();
      });

      it('should not accept more than 20 os_types in an exception list item', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: {
              remediation: {
                exception_list_items: [{ list_id: 'list-id', os_types: Array(21).fill('windows') }],
              },
            },
          })
        ).toThrow();
      });

      it('should not accept more than 50 message_variables', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { metadata: { message_variables: Array(51).fill('var') } },
          })
        ).toThrow();
      });
    });

    describe('maxLength bounds', () => {
      const baseRequest = {
        params: { insightId: 'valid-insight-id' },
        body: {},
      };

      it('should reject a message that exceeds the max length', () => {
        expect(() =>
          validateRequest({ ...baseRequest, body: { message: 'a'.repeat(10001) } })
        ).toThrow();
      });

      it('should reject an @timestamp that exceeds the max length', () => {
        expect(() =>
          validateRequest({ ...baseRequest, body: { '@timestamp': 'a'.repeat(65) } })
        ).toThrow();
      });

      it('should reject an insightId that exceeds the max length', () => {
        expect(() =>
          validateRequest({ params: { insightId: 'a'.repeat(257) }, body: {} })
        ).toThrow();
      });

      it('should reject a target id element that exceeds the max length', () => {
        expect(() =>
          validateRequest({ ...baseRequest, body: { target: { ids: ['a'.repeat(257)] } } })
        ).toThrow();
      });

      it('should reject a metadata.notes key that exceeds the max length', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { metadata: { notes: { ['a'.repeat(257)]: 'value' } } },
          })
        ).toThrow();
      });

      it('should reject a metadata.notes value that exceeds the max length', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { metadata: { notes: { note: 'a'.repeat(1001) } } },
          })
        ).toThrow();
      });

      it('should reject a remediation.link that exceeds the max length', () => {
        expect(() =>
          validateRequest({
            ...baseRequest,
            body: { remediation: { link: 'a'.repeat(2049) } },
          })
        ).toThrow();
      });

      it('should accept values at the max length', () => {
        expect(() =>
          validateRequest({
            params: { insightId: 'a'.repeat(256) },
            body: {
              message: 'a'.repeat(10000),
              target: { ids: ['a'.repeat(256)] },
              remediation: { link: 'a'.repeat(2048) },
              metadata: { notes: { ['a'.repeat(256)]: 'a'.repeat(1000) } },
            },
          })
        ).not.toThrow();
      });
    });

    it('should throw an error if target ids contain empty strings', () => {
      const invalidRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          target: {
            type: 'endpoint',
            ids: ['valid-id', ''], // Invalid empty string in ids
          },
          action: { type: 'refreshed' },
        },
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(
        '"[body.target.ids.1]: value has length [0] but it must have a minimum length of [1]."'
      );
    });

    it('should validate successfully when optional fields are omitted', () => {
      const validRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          action: { type: 'refreshed' },
        },
      };

      expect(() => validateRequest(validRequest)).not.toThrow();
    });

    it('should throw an error for unsupported action types', () => {
      const invalidRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          action: {
            type: 'unsupported-action', // Invalid action type
          },
        },
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(`
    "[body.action.type]: types that failed validation:
    - [body.action.type.0]: expected value to equal [refreshed]
    - [body.action.type.1]: expected value to equal [remediated]
    - [body.action.type.2]: expected value to equal [suppressed]
    - [body.action.type.3]: expected value to equal [dismissed]"
    `);
    });

    it('should throw an error if remediation list items contain invalid data', () => {
      const invalidRequest = {
        params: {
          insightId: 'valid-insight-id',
        },
        body: {
          remediation: {
            exception_list_items: [
              {
                list_id: 'list-id',
                name: 'Exception 1',
                description: 'Description',
                entries: 'invalid-entries', // Invalid entries
                tags: ['tag1'],
                os_types: ['windows'],
              },
            ],
          },
          action: { type: 'refreshed' },
        },
      };

      expect(() => validateRequest(invalidRequest)).toThrowErrorMatchingInlineSnapshot(
        '"[body.remediation.exception_list_items.0.entries]: could not parse array value from json input"'
      );
    });
  });

  describe('CreateWorkflowInsightRequestSchema', () => {
    const validateBody = (body: Record<string, unknown>) => {
      return schema.object(CreateWorkflowInsightRequestSchema).validate({ body });
    };

    it('should validate successfully with valid insightTypes and endpointIds', () => {
      expect(() =>
        validateBody({
          insightTypes: ['incompatible_antivirus', 'policy_response_failure'],
          endpointIds: ['endpoint-1', 'endpoint-2'],
        })
      ).not.toThrow();
    });

    it('should throw when insightTypes is missing', () => {
      expect(() => validateBody({ endpointIds: ['endpoint-1'] })).toThrow(/insightTypes/);
    });

    it('should throw when endpointIds is missing', () => {
      expect(() => validateBody({ insightTypes: ['incompatible_antivirus'] })).toThrow(
        /endpointIds/
      );
    });

    it('should throw when insightTypes contains an invalid value', () => {
      expect(() =>
        validateBody({ insightTypes: ['invalid_type'], endpointIds: ['endpoint-1'] })
      ).toThrow();
    });

    it('should throw when endpointIds contains an empty string', () => {
      expect(() =>
        validateBody({ insightTypes: ['incompatible_antivirus'], endpointIds: [''] })
      ).toThrow();
    });

    it('should throw when insightTypes exceeds maxSize of 10', () => {
      const tooManyTypes = Array(11).fill('incompatible_antivirus');
      expect(() =>
        validateBody({ insightTypes: tooManyTypes, endpointIds: ['endpoint-1'] })
      ).toThrow();
    });

    it('should throw when endpointIds exceeds maxSize of 50', () => {
      const tooManyIds = Array(51).fill('endpoint-1');
      expect(() =>
        validateBody({ insightTypes: ['incompatible_antivirus'], endpointIds: tooManyIds })
      ).toThrow();
    });

    it('should validate successfully with optional connectorId', () => {
      expect(() =>
        validateBody({
          insightTypes: ['incompatible_antivirus'],
          endpointIds: ['endpoint-1'],
          connectorId: 'connector-123',
        })
      ).not.toThrow();
    });

    it('should throw when connectorId is an empty string', () => {
      expect(() =>
        validateBody({
          insightTypes: ['incompatible_antivirus'],
          endpointIds: ['endpoint-1'],
          connectorId: '',
        })
      ).toThrow();
    });

    it('should throw when an endpointIds element exceeds the max length', () => {
      expect(() =>
        validateBody({
          insightTypes: ['incompatible_antivirus'],
          endpointIds: ['a'.repeat(257)],
        })
      ).toThrow();
    });

    it('should throw when connectorId exceeds the max length', () => {
      expect(() =>
        validateBody({
          insightTypes: ['incompatible_antivirus'],
          endpointIds: ['endpoint-1'],
          connectorId: 'a'.repeat(257),
        })
      ).toThrow();
    });
  });

  describe('GetPendingInsightsRequestSchema', () => {
    const validateQuery = (query: Record<string, unknown>) => {
      return schema.object(GetPendingInsightsRequestSchema).validate({ query });
    };

    it('should validate successfully with no params', () => {
      expect(() => validateQuery({})).not.toThrow();
    });

    it('should validate successfully with insightTypes array', () => {
      expect(() =>
        validateQuery({ insightTypes: ['incompatible_antivirus', 'policy_response_failure'] })
      ).not.toThrow();
    });

    it('should validate successfully with a single insightTypes value', () => {
      expect(() => validateQuery({ insightTypes: ['incompatible_antivirus'] })).not.toThrow();
    });

    it('should validate successfully with endpointIds array', () => {
      expect(() => validateQuery({ endpointIds: ['endpoint-1', 'endpoint-2'] })).not.toThrow();
    });

    it('should throw when insightTypes contains an invalid value', () => {
      expect(() => validateQuery({ insightTypes: ['invalid_type'] })).toThrow();
    });

    it('should throw when insightTypes exceeds maxSize of 10', () => {
      const tooManyTypes = Array(11).fill('incompatible_antivirus');
      expect(() => validateQuery({ insightTypes: tooManyTypes })).toThrow();
    });

    it('should throw when endpointIds contains an empty string', () => {
      expect(() => validateQuery({ endpointIds: ['endpoint-1', ''] })).toThrow();
    });

    it('should throw when endpointIds exceeds maxSize of 50', () => {
      const tooManyIds = Array(51).fill('endpoint-1');
      expect(() => validateQuery({ endpointIds: tooManyIds })).toThrow();
    });

    it('should throw when an endpointIds element exceeds the max length', () => {
      expect(() => validateQuery({ endpointIds: ['a'.repeat(257)] })).toThrow();
    });

    it('should validate successfully with both insightTypes and endpointIds', () => {
      expect(() =>
        validateQuery({
          insightTypes: ['incompatible_antivirus', 'policy_response_failure'],
          endpointIds: ['endpoint-1', 'endpoint-2'],
        })
      ).not.toThrow();
    });

    it('should throw when endpointIds contains a whitespace-only string', () => {
      expect(() => validateQuery({ endpointIds: ['endpoint-1', '   '] })).toThrow();
    });

    it('should validate successfully with single-element arrays for both fields', () => {
      expect(() =>
        validateQuery({
          insightTypes: ['incompatible_antivirus'],
          endpointIds: ['endpoint-1'],
        })
      ).not.toThrow();
    });
  });
});
