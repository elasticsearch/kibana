/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ConfigSchema,
  SecretsSchema,
  ParamsSchema,
  portSchema,
  AttachmentSchema,
  emailSchema,
} from './v1';

describe('Email Schema', () => {
  describe('portSchema', () => {
    it('validates valid port number', () => {
      expect(() => portSchema().parse(25)).not.toThrow();
      expect(() => portSchema().parse(587)).not.toThrow();
      expect(() => portSchema().parse(465)).not.toThrow();
    });

    it('coerces string to number', () => {
      const result = portSchema().parse('587');
      expect(result).toBe(587);
    });

    it('throws on port below minimum', () => {
      expect(() => portSchema().parse(0)).toThrow();
    });

    it('throws on port above maximum', () => {
      expect(() => portSchema().parse(65536)).toThrow();
    });

    it('validates maximum port', () => {
      expect(() => portSchema().parse(65535)).not.toThrow();
    });
  });

  describe('ConfigSchema', () => {
    it('validates a valid config with service', () => {
      expect(() =>
        ConfigSchema.parse({
          from: 'test@example.com',
        })
      ).not.toThrow();
    });

    it('applies default values', () => {
      const result = ConfigSchema.parse({
        from: 'test@example.com',
      });
      expect(result.service).toBe('other');
      expect(result.hasAuth).toBe(true);
      expect(result.host).toBeNull();
      expect(result.port).toBeNull();
      expect(result.secure).toBeNull();
      expect(result.allowHtml).toBeUndefined();
    });

    it('validates with custom SMTP settings', () => {
      expect(() =>
        ConfigSchema.parse({
          from: 'test@example.com',
          service: 'other',
          host: 'smtp.example.com',
          port: 587,
          secure: true,
        })
      ).not.toThrow();
    });

    it('validates with OAuth settings', () => {
      expect(() =>
        ConfigSchema.parse({
          from: 'test@example.com',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          oauthTokenUrl: 'https://login.example.com/oauth2/token',
        })
      ).not.toThrow();
    });

    it('throws when from is missing', () => {
      expect(() => ConfigSchema.parse({})).toThrow();
    });

    it('coerces port from string', () => {
      const result = ConfigSchema.parse({
        from: 'test@example.com',
        port: '587',
      });
      expect(result.port).toBe(587);
    });

    it('validates explicit HTML opt-in values', () => {
      expect(
        ConfigSchema.parse({
          from: 'test@example.com',
          allowHtml: true,
        }).allowHtml
      ).toBe(true);

      expect(
        ConfigSchema.parse({
          from: 'test@example.com',
          allowHtml: false,
        }).allowHtml
      ).toBe(false);
    });
  });

  describe('SecretsSchema', () => {
    it('validates with all null values', () => {
      const result = SecretsSchema.parse({});
      expect(result.user).toBeNull();
      expect(result.password).toBeNull();
      expect(result.clientSecret).toBeNull();
    });

    it('validates with basic auth', () => {
      expect(() =>
        SecretsSchema.parse({
          user: 'username',
          password: 'password',
        })
      ).not.toThrow();
    });

    it('validates with OAuth secret', () => {
      expect(() =>
        SecretsSchema.parse({
          clientSecret: 'client-secret',
        })
      ).not.toThrow();
    });

    it('throws on unknown properties', () => {
      expect(() =>
        SecretsSchema.parse({
          user: 'test',
          unknownProp: 'value',
        })
      ).toThrow();
    });
  });

  describe('emailSchema', () => {
    it('validates array of valid emails', () => {
      expect(() => emailSchema.parse(['test@example.com', 'user@domain.org'])).not.toThrow();
    });

    it('throws when email exceeds max length', () => {
      const longEmail = 'a'.repeat(513);
      expect(() => emailSchema.parse([longEmail])).toThrow();
    });

    it('throws when array exceeds max size', () => {
      const emails = Array(101).fill('test@example.com');
      expect(() => emailSchema.parse(emails)).toThrow();
    });

    it('validates array with max allowed emails', () => {
      const emails = Array(100).fill('test@example.com');
      expect(() => emailSchema.parse(emails)).not.toThrow();
    });

    it('validates empty array', () => {
      expect(() => emailSchema.parse([])).not.toThrow();
    });
  });

  describe('AttachmentSchema', () => {
    it('validates valid attachment', () => {
      expect(() =>
        AttachmentSchema.parse({
          content: 'base64content',
          filename: 'document.pdf',
        })
      ).not.toThrow();
    });

    it('validates with all optional fields', () => {
      expect(() =>
        AttachmentSchema.parse({
          content: 'base64content',
          filename: 'document.pdf',
          contentType: 'application/pdf',
          encoding: 'base64',
        })
      ).not.toThrow();
    });

    it('throws when content is missing', () => {
      expect(() =>
        AttachmentSchema.parse({
          filename: 'document.pdf',
        })
      ).toThrow();
    });

    it('throws when filename is missing', () => {
      expect(() =>
        AttachmentSchema.parse({
          content: 'base64content',
        })
      ).toThrow();
    });
  });

  describe('ParamsSchema', () => {
    it('validates with required fields', () => {
      expect(() =>
        ParamsSchema.parse({
          subject: 'Test Subject',
          message: 'Test message body',
        })
      ).not.toThrow();
    });

    it('applies default values', () => {
      const result = ParamsSchema.parse({
        subject: 'Test Subject',
        message: 'Test message body',
      });
      expect(result.to).toEqual([]);
      expect(result.cc).toEqual([]);
      expect(result.bcc).toEqual([]);
      expect(result.messageHTML).toBeNull();
      expect(result.kibanaFooterLink).toBeDefined();
    });

    it('validates with all fields', () => {
      expect(() =>
        ParamsSchema.parse({
          to: ['user@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Test Subject',
          message: 'Test message body',
          messageHTML: '<p>HTML content</p>',
          kibanaFooterLink: {
            path: '/app/kibana',
            text: 'View in Kibana',
          },
          attachments: [
            {
              content: 'base64content',
              filename: 'file.pdf',
            },
          ],
        })
      ).not.toThrow();
    });

    it('throws when subject is missing', () => {
      expect(() =>
        ParamsSchema.parse({
          message: 'Test message',
        })
      ).toThrow();
    });

    it('throws when message is missing', () => {
      expect(() =>
        ParamsSchema.parse({
          subject: 'Test Subject',
        })
      ).toThrow();
    });

    it('throws on unknown properties', () => {
      expect(() =>
        ParamsSchema.parse({
          subject: 'Test',
          message: 'Test',
          unknownProp: 'value',
        })
      ).toThrow();
    });
  });
});
