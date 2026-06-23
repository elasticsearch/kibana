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
  ConnectorActionInputSchemas,
  ConnectorActionOutputSchemas,
  ConnectorInputSchemas,
  ConnectorOutputSchemas,
  ConnectorSpecsInputSchemas,
  staticConnectors,
} from './connector_action_schema';

const expectedConnectorInputKeys = [...ConnectorInputSchemas.keys()];
const expectedConnectorOutputKeys = [...ConnectorOutputSchemas.keys()];
const expectedConnectorActionInputKeys = [...ConnectorActionInputSchemas.keys()];
const expectedConnectorActionOutputKeys = [...ConnectorActionOutputSchemas.keys()];

describe('ConnectorOutputSchemas', () => {
  it('has the same keys as ConnectorInputSchemas', () => {
    const inputKeys = expectedConnectorInputKeys.toSorted();
    const outputKeys = expectedConnectorOutputKeys.toSorted();
    expect(outputKeys).toEqual(inputKeys);
  });

  it.each(expectedConnectorOutputKeys)('maps %s to a valid Zod schema', (key) => {
    const schema = ConnectorOutputSchemas.get(key);
    expect(schema).toBeInstanceOf(z.ZodType);
  });
});

describe('ConnectorActionInputSchemas', () => {
  it.each(expectedConnectorActionInputKeys)('maps %s to a record of Zod schemas', (key) => {
    const actions = ConnectorActionInputSchemas.get(key);
    expect(actions).toBeDefined();
    for (const schema of Object.values(actions!)) {
      expect(schema).toBeInstanceOf(z.ZodType);
    }
  });

  it('maps XSOAR actions to schemas used by workflow snippets and validation', () => {
    const actions = ConnectorActionInputSchemas.get('.xsoar');

    expect(actions).toBeDefined();
    expect(Object.keys(actions!).toSorted()).toEqual(['getPlaybooks', 'run']);
    expect(actions!.getPlaybooks.parse({})).toEqual({});
    expect(actions!.run).toBeInstanceOf(z.ZodType);
  });
});

describe('ConnectorActionOutputSchemas', () => {
  it('has the same keys as ConnectorActionInputSchemas', () => {
    const inputKeys = expectedConnectorActionInputKeys.toSorted();
    const outputKeys = expectedConnectorActionOutputKeys.toSorted();
    expect(outputKeys).toEqual(inputKeys);
  });

  it.each(expectedConnectorActionOutputKeys)('maps %s to matching action names', (key) => {
    const inputActions = ConnectorActionInputSchemas.get(key);
    const outputActions = ConnectorActionOutputSchemas.get(key);
    expect(outputActions).toBeDefined();
    const inputNames = Object.keys(inputActions!).toSorted();
    const outputNames = Object.keys(outputActions!).toSorted();
    expect(outputNames).toEqual(inputNames);
  });
});

describe('ConnectorSpecsInputSchemas', () => {
  it('is populated from connector specs', () => {
    expect(ConnectorSpecsInputSchemas.size).toBeGreaterThan(0);
  });

  it('maps each connector to a record of Zod schemas', () => {
    for (const [connectorId, actions] of ConnectorSpecsInputSchemas) {
      expect(typeof connectorId).toBe('string');
      for (const schema of Object.values(actions)) {
        expect(schema).toBeInstanceOf(z.ZodType);
      }
    }
  });
});

describe('staticConnectors', () => {
  it('contains console, elasticsearch.request, and kibana.request', () => {
    const types = staticConnectors.map((c) => c.type);
    expect(types).toContain('console');
    expect(types).toContain('elasticsearch.request');
    expect(types).toContain('kibana.request');
  });

  it('each has a paramsSchema and outputSchema', () => {
    for (const connector of staticConnectors) {
      expect(connector.paramsSchema).toBeDefined();
      expect(connector.outputSchema).toBeDefined();
      expect(typeof connector.description).toBe('string');
      expect(typeof connector.summary).toBe('string');
    }
  });

  it('console paramsSchema validates { message: string }', () => {
    const console = staticConnectors.find((c) => c.type === 'console')!;
    const result = console.paramsSchema.safeParse({ message: 'hello' });
    expect(result.success).toBe(true);
  });

  it('console paramsSchema rejects missing message', () => {
    const console = staticConnectors.find((c) => c.type === 'console')!;
    const result = console.paramsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('elasticsearch.request paramsSchema validates correct input', () => {
    const esReq = staticConnectors.find((c) => c.type === 'elasticsearch.request')!;
    const result = esReq.paramsSchema.safeParse({ method: 'GET', path: '/_cat/health' });
    expect(result.success).toBe(true);
  });

  it('kibana.request paramsSchema validates correct input', () => {
    const kibanaReq = staticConnectors.find((c) => c.type === 'kibana.request')!;
    const result = kibanaReq.paramsSchema.safeParse({ method: 'POST', path: '/api/status' });
    expect(result.success).toBe(true);
  });

  it('kibana.request paramsSchema rejects invalid method', () => {
    const kibanaReq = staticConnectors.find((c) => c.type === 'kibana.request')!;
    const result = kibanaReq.paramsSchema.safeParse({ method: 'POSTs', path: '/api/status' });
    expect(result.success).toBe(false);
  });
});
