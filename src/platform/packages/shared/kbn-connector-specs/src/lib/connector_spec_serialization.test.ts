/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { fromJSONSchema } from '@kbn/zod/v4/from_json_schema';
import * as connectorsSpecs from '../all_specs';
import { serializeConnectorSpec } from './serialize_connector_spec';
import { getMeta } from '../connector_spec_ui';

describe('connector spec serialization integration tests', () => {
  describe('round-trip serialization', () => {
    it('round-trips AlienVault OTX connector with single-option discriminated union', () => {
      const spec = connectorsSpecs.AlienVaultOTXConnector;
      const serialized = serializeConnectorSpec(spec);

      expect(serialized.schema).toBeDefined();

      const rootSchema = fromJSONSchema(serialized.schema, { preserveMeta: true }) as unknown as {
        shape?: Record<string, z.ZodType>;
        parse: (data: unknown) => unknown;
      };
      expect(rootSchema).toBeDefined();
      expect(rootSchema.shape).toBeDefined();

      const validData = {
        config: {},
        secrets: { authType: 'api_key_header', 'X-OTX-API-KEY': 'test-key' },
      };
      expect(() => rootSchema?.parse(validData)).not.toThrow();

      const secretsSchema = rootSchema.shape?.secrets;
      expect(secretsSchema).toBeDefined();
      expect(secretsSchema).toBeInstanceOf(z.ZodDiscriminatedUnion);
      const secretsUnion = secretsSchema as z.ZodDiscriminatedUnion;

      // the schema looks like:
      // {
      //   secrets: z.discriminatedUnion('authType', [
      //     z.object({
      //       X-OTX-API-KEY: z.string().min(1).meta({ label: 'API key', sensitive: true }),
      //       authType: z.literal('api_key_header'),
      //     }).meta({ label: 'API key header authentication' }),
      //   ]).meta({ label: 'Authentication' }),
      // }

      // root level meta
      const metadata = getMeta(secretsUnion);
      expect(metadata.label).toBe('Authentication');

      // option level meta
      expect(secretsUnion.options.length).toBe(1);
      const authOption = secretsUnion.options[0] as z.ZodObject;
      expect(authOption).toBeInstanceOf(z.ZodObject);
      const optionMeta = getMeta(authOption);
      expect(optionMeta.label).toBe('API key header authentication');

      // field level meta within the option
      const optionShape = (authOption as z.ZodObject).shape as Record<string, z.ZodType>;

      const apiKeyField = optionShape['X-OTX-API-KEY'];
      expect(apiKeyField).toBeDefined();
      const apiKeyMeta = getMeta(apiKeyField);
      expect(apiKeyMeta.label).toBe('API key');
      expect(apiKeyMeta.sensitive).toBe(true);

      const discriminatorField = optionShape.authType;
      expect((discriminatorField as z.ZodLiteral).value).toBe('api_key_header');
    });

    it('round-trips all available connector specs without throwing', () => {
      const specNames = Object.keys(connectorsSpecs);
      expect(specNames.length).toBeGreaterThan(0);

      for (const specName of specNames) {
        const spec = connectorsSpecs[specName as keyof typeof connectorsSpecs];
        const serialized = serializeConnectorSpec(spec);

        expect(serialized.schema).toBeDefined();

        const combinedZod = fromJSONSchema(serialized.schema);
        expect(combinedZod).toBeDefined();
      }
    });

    it('preserves validation behavior after round-trip', () => {
      const spec = connectorsSpecs.VirusTotalConnector;
      const serialized = serializeConnectorSpec(spec);

      const combinedZod = fromJSONSchema(serialized.schema) as z.ZodObject<{
        config: z._ZodType;
        secrets: z._ZodType;
      }>;
      expect(combinedZod).toBeDefined();

      const validData = {
        config: {},
        secrets: { authType: 'api_key_header', 'x-apikey': 'apikey' },
      };

      const parseResult = combinedZod.safeParse(validData);
      expect(parseResult.success).toBe(true);

      const invalidData = {
        config: {},
        secrets: { authType: 'api_key_header' },
      };
      const invalidResult = combinedZod.safeParse(invalidData);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('meta information preservation', () => {
    it('serializeConnectorSpec → JSON → fromJSONSchema → getMeta', () => {
      const spec = connectorsSpecs.AlienVaultOTXConnector;
      const serialized = serializeConnectorSpec(spec);

      const jsonString = JSON.stringify(serialized);
      const apiResponse = JSON.parse(jsonString);

      const zodSchema = fromJSONSchema(apiResponse.schema, { preserveMeta: true }) as z.ZodObject<{
        config: z._ZodType;
        secrets: z._ZodType;
      }>;
      expect(zodSchema).toBeDefined();

      const secrets = zodSchema?.shape?.secrets;
      expect(secrets).toBeInstanceOf(z.ZodDiscriminatedUnion);

      const secretsMeta = getMeta(secrets);
      expect(secretsMeta.label).toBe('Authentication');

      const option = (secrets as z.ZodDiscriminatedUnion).options[0] as z.ZodObject;
      const optionMeta = getMeta(option);
      expect(optionMeta.label).toBe('API key header authentication');
    });

    it('preserves sensitive meta flag through round-trip', () => {
      const spec = connectorsSpecs.VirusTotalConnector;
      const serialized = serializeConnectorSpec(spec);

      const zodSchema = fromJSONSchema(serialized.schema, { preserveMeta: true }) as z.ZodObject<{
        config: z.ZodType;
        secrets: z.ZodDiscriminatedUnion;
      }>;

      const secrets = zodSchema.shape.secrets;
      const option = secrets.options[0] as z.ZodObject<{
        'x-apikey': z.ZodType;
        authType: z.ZodType;
      }>;
      const apiKeyField = option.shape['x-apikey'];

      const meta = getMeta(apiKeyField);
      expect(meta.sensitive).toBe(true);
    });

    it('preserves all meta attributes through network round-trip', () => {
      const spec = connectorsSpecs.AlienVaultOTXConnector;
      const serialized = serializeConnectorSpec(spec);

      const jsonString = JSON.stringify(serialized);
      const parsed = JSON.parse(jsonString);

      const zodSchema = fromJSONSchema(parsed.schema, { preserveMeta: true }) as z.ZodObject<{
        config: z.ZodType;
        secrets: z.ZodDiscriminatedUnion;
      }>;

      const secrets = zodSchema.shape.secrets;
      const option = secrets.options[0] as z.ZodObject;
      const optionShape = option.shape as Record<string, z.ZodType>;
      const apiKeyField = optionShape['X-OTX-API-KEY'];

      const fieldMeta = getMeta(apiKeyField);
      expect(fieldMeta.label).toBe('API key');
      expect(fieldMeta.sensitive).toBe(true);
    });
  });
});
