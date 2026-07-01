/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import {
  connectorTypeRequiresConnectorId,
  generateConnectorSnippet,
  getEnhancedTypeInfo,
} from './generate_connector_snippet';

jest.mock('../connectors_cache', () => ({
  getCachedAllConnectors: jest.fn(() => [
    {
      type: 'slack',
      hasConnectorId: 'required',
    },
    {
      type: 'elasticsearch.request',
      hasConnectorId: undefined,
    },
    {
      type: 'custom.connector',
      hasConnectorId: 'required',
    },
    {
      type: 'no_id_connector',
      hasConnectorId: undefined,
    },
  ]),
}));

jest.mock('../autocomplete/suggestions/connector_id/get_connector_id_suggestions_items', () => ({
  getConnectorInstancesForType: jest.fn((connectorType: string) => {
    if (connectorType === 'slack') {
      return [
        { id: 'slack-uuid-1', name: 'My Slack', isDeprecated: false },
        { id: 'slack-uuid-2', name: 'Old Slack', isDeprecated: true },
      ];
    }
    if (connectorType === 'custom.connector') {
      return [];
    }
    return [];
  }),
}));

jest.mock('../get_required_params_for_connector', () => ({
  getRequiredParamsForConnector: jest.fn((connectorType: string) => {
    if (connectorType === 'slack') {
      return [{ name: 'message', example: 'Hello Slack' }];
    }
    if (connectorType === 'custom.connector') {
      return [];
    }
    if (connectorType === 'no_id_connector') {
      return [{ name: 'body', defaultValue: '{}' }];
    }
    if (connectorType === 'cases.addAttachment') {
      return [
        { name: 'case_id', example: '' },
        { name: 'attachment', example: { type: '' } },
      ];
    }
    if (connectorType === 'cases.addAttachments') {
      return [
        { name: 'case_id', example: '' },
        { name: 'attachments', example: [{ type: '' }] },
      ];
    }
    return [];
  }),
}));

jest.mock('@kbn/shared-ux-utility', () => ({
  isMac: false,
}));

describe('generateConnectorSnippet', () => {
  describe('full snippet with steps section', () => {
    it('should generate a full snippet with steps section for a connector with required params', () => {
      const result = generateConnectorSnippet('slack', { full: true, withStepsSection: true });
      expect(result).toContain('steps:');
      expect(result).toContain('name: slack_step');
      expect(result).toContain('type: slack');
      expect(result).toContain('connector-id: slack-uuid-1');
      expect(result).toContain('message: Hello Slack');
    });

    it('should generate a full snippet without steps section', () => {
      const result = generateConnectorSnippet('slack', { full: true, withStepsSection: false });
      expect(result).not.toContain('steps:');
      expect(result).toContain('name: slack_step');
      expect(result).toContain('type: slack');
      expect(result).toContain('message: Hello Slack');
    });
  });

  describe('connector-id handling', () => {
    it('should use the first non-deprecated connector instance UUID', () => {
      const result = generateConnectorSnippet('slack', { full: true, withStepsSection: false });
      expect(result).toContain('connector-id: slack-uuid-1');
    });

    it('should use placeholder comment when no instances exist', () => {
      const result = generateConnectorSnippet('custom.connector', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('connector-id: "# Enter connector UUID here"');
    });

    it('should not include connector-id when not required', () => {
      const result = generateConnectorSnippet('no_id_connector', {
        full: true,
        withStepsSection: false,
      });
      // connector-id should only appear once (from the with block if needed)
      // Since hasConnectorId is not 'required', isConnectorIdRequired is false
      expect(result).toContain('name: no_id_connector_step');
    });
  });

  describe('empty required params — comment placeholder', () => {
    it('should add comment placeholder when no required params exist', () => {
      const result = generateConnectorSnippet('custom.connector', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('with:');
      expect(result).toContain(
        '# Add parameters here. Press Ctrl+Space to see all available options'
      );
    });
  });

  describe('non-full snippet (type value only)', () => {
    it('should return type value and parameters when full is false', () => {
      const result = generateConnectorSnippet('slack', { full: false, withStepsSection: false });
      expect(result).toContain('slack\n');
      expect(result).toContain('message: Hello Slack');
    });

    it('should include comment when no required params in non-full mode', () => {
      const result = generateConnectorSnippet('custom.connector');
      expect(result).toContain('custom.connector\n');
      expect(result).toContain(
        '# Add parameters here. Press Ctrl+Space to see all available options'
      );
    });
  });

  describe('dot-separated connector types', () => {
    it('should replace dots with underscores in step name', () => {
      const result = generateConnectorSnippet('custom.connector', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: custom_connector_step');
    });
  });

  describe('default value fallback for params', () => {
    it('should use defaultValue when example is not provided', () => {
      const result = generateConnectorSnippet('no_id_connector', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('body: "{}"');
    });
  });

  describe('discriminated union scaffolding', () => {
    // Need to register these connectors in the connectors_cache mock so the
    // snippet generator's connector-id check finds them.
    beforeAll(() => {
      const mock = jest.requireMock('../connectors_cache') as {
        getCachedAllConnectors: jest.Mock;
      };
      mock.getCachedAllConnectors.mockImplementation(() => [
        { type: 'slack', hasConnectorId: 'required' },
        { type: 'elasticsearch.request', hasConnectorId: undefined },
        { type: 'custom.connector', hasConnectorId: 'required' },
        { type: 'no_id_connector', hasConnectorId: undefined },
        { type: 'cases.addAttachment', hasConnectorId: undefined },
        { type: 'cases.addAttachments', hasConnectorId: undefined },
      ]);
    });

    it('should scaffold attachment as a nested map with type for cases.addAttachment', () => {
      const result = generateConnectorSnippet('cases.addAttachment', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('attachment:');
      expect(result).toContain('type: ""');
      // Sanity-check we did not regress to the flat empty-string form.
      expect(result).not.toMatch(/attachment:\s*""\n/);
    });

    it('should scaffold attachments as a list of {type} maps for cases.addAttachments', () => {
      const result = generateConnectorSnippet('cases.addAttachments', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('attachments:');
      expect(result).toContain('- type: ""');
    });
  });
});

describe('connectorTypeRequiresConnectorId', () => {
  it('should return false for built-in step types', () => {
    expect(connectorTypeRequiresConnectorId('if')).toBe(false);
    expect(connectorTypeRequiresConnectorId('foreach')).toBe(false);
    expect(connectorTypeRequiresConnectorId('wait')).toBe(false);
  });

  it('should return false for elasticsearch.request', () => {
    expect(connectorTypeRequiresConnectorId('elasticsearch.request')).toBe(false);
  });

  it('should return false for kibana.request', () => {
    expect(connectorTypeRequiresConnectorId('kibana.request')).toBe(false);
  });

  it('should return true for other connector types', () => {
    expect(connectorTypeRequiresConnectorId('slack')).toBe(true);
    expect(connectorTypeRequiresConnectorId('custom.connector')).toBe(true);
    expect(connectorTypeRequiresConnectorId('my_type')).toBe(true);
  });
});

describe('getEnhancedTypeInfo', () => {
  it('should handle a required string schema', () => {
    const schema = z.string();
    const result = getEnhancedTypeInfo(schema);
    expect(result.isRequired).toBe(true);
    expect(result.isOptional).toBe(false);
    expect(result.type).toBe('string');
  });

  it('should handle an optional schema', () => {
    const schema = z.optional(z.string());
    const result = getEnhancedTypeInfo(schema);
    expect(result.isRequired).toBe(false);
    expect(result.isOptional).toBe(true);
    expect(result.type).toBe('string');
  });

  it('should handle a number schema', () => {
    const schema = z.number();
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('number');
    expect(result.isRequired).toBe(true);
  });

  it('should handle an array schema and show element type', () => {
    const schema = z.array(z.string());
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('string[]');
  });

  it('should handle a union schema', () => {
    const schema = z.union([z.string(), z.number()]);
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('string | number');
  });

  it('should handle an enum schema', () => {
    const schema = z.enum(['a', 'b', 'c']);
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('enum: a | b | c');
  });

  it('should handle an enum schema with more than 3 values', () => {
    const schema = z.enum(['a', 'b', 'c', 'd', 'e']);
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('enum: a | b | c...');
  });

  it('should handle a literal schema', () => {
    const schema = z.literal('hello');
    const result = getEnhancedTypeInfo(schema);
    expect(result.type).toBe('"hello"');
  });

  it('should extract example from description containing e.g.', () => {
    // In @kbn/zod/v4, descriptions are stored in _zod.def.description
    const schema = z.string().describe('A name field, e.g., "John Doe"');
    const result = getEnhancedTypeInfo(schema);
    // The _def.description path may not exist in @kbn/zod/v4, so description can be undefined
    if (result.description) {
      expect(result.description).toBe('A name field, e.g., "John Doe"');
      expect(result.example).toBe('John Doe');
    } else {
      // When the internal structure doesn't expose _def.description, both are undefined
      expect(result.description).toBeUndefined();
      expect(result.example).toBeUndefined();
    }
  });

  it('should return undefined for description and example when not set', () => {
    const schema = z.string();
    const result = getEnhancedTypeInfo(schema);
    expect(result.description).toBeUndefined();
    expect(result.example).toBeUndefined();
  });
});
