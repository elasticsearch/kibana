/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sha256, sanitizeFields, REDACTED } from './utils';

describe('#sanitizeFields', () => {
  describe('when fieldsToHash is not provided', () => {
    it('should return snapshot unchanged and empty hashed paths', () => {
      const snapshot = { api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c' } };
      const result = sanitizeFields(snapshot);

      expect(result.fields.hashed).toEqual([]);
      expect(result.snapshot).toEqual(snapshot);
    });
  });

  describe('when fieldsToHash is undefined', () => {
    it('should return snapshot unchanged and empty hashed paths', () => {
      const snapshot = { secret: 'sensitive' };
      const result = sanitizeFields(snapshot, { fieldsToHash: undefined });

      expect(result.fields.hashed).toEqual([]);
      expect(result.snapshot).toEqual(snapshot);
    });
  });

  describe('when fieldsToHash is provided without a salt', () => {
    it('should throw', () => {
      expect(() => sanitizeFields({ apiKey: 'abc' }, { fieldsToHash: { apiKey: true } })).toThrow(
        'sanitizeFields: salt missing when hashing fields, please use the object.id'
      );
    });
  });

  describe('single field hashing', () => {
    it('should hash a top-level string field and list its path', () => {
      const snapshot = { api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c' } };
      const fieldsToHash = { api: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual(['api.key']);
      expect(result.snapshot.api.key).toBe(sha256('obj-id' + 'sk-9f8a7b6c5d4e3f2a1b0c').slice(-12));
      expect(result.snapshot.api.key).not.toBe('sk-9f8a7b6c5d4e3f2a1b0c');
    });

    it('should hash a nested field when only that path is in fieldsToHash', () => {
      const snapshot = {
        api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c', endpoint: 'https://api.example.com' },
      };
      const fieldsToHash = { api: { key: true } };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual(['api.key']);
      expect(result.snapshot.api.key).toBe(sha256('obj-id' + 'sk-9f8a7b6c5d4e3f2a1b0c').slice(-12));
      expect(result.snapshot.api.endpoint).toBe('https://api.example.com');
    });
  });

  describe('multiple fields hashing', () => {
    it('should hash multiple string fields and list all paths', () => {
      const snapshot = {
        api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c', token: 'tok-1a2b3c4d5e6f7a8b' },
        password: 'pw-7g8h9i0j1k2l3m4n',
      };
      const fieldsToHash = { api: true, password: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      // Using `.sort()` below because we're not depending on array order.
      // @see https://stackoverflow.com/questions/40135684
      expect(result.fields.hashed.sort()).toEqual(['api.key', 'api.token', 'password'].sort());
      expect(result.snapshot.api.key).toBe(sha256('obj-id' + 'sk-9f8a7b6c5d4e3f2a1b0c').slice(-12));
      expect(result.snapshot.api.token).toBe(sha256('obj-id' + 'tok-1a2b3c4d5e6f7a8b').slice(-12));
      expect(result.snapshot.password).toBe(sha256('obj-id' + 'pw-7g8h9i0j1k2l3m4n').slice(-12));
    });
  });

  describe('non-string values', () => {
    it('should not hash non-string values even when key is in fieldsToHash', () => {
      const snapshot = { config: { count: 42, enabled: true, nested: { id: 1 } } };
      const fieldsToHash = { config: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual([]);
      expect(result.snapshot).toEqual(snapshot);
    });

    it('should hash only string fields and leave numbers/booleans unchanged', () => {
      const snapshot = {
        api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c', count: 5, active: true },
      };
      const fieldsToHash = { api: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual(['api.key']);
      expect(result.snapshot.api.key).toBe(sha256('obj-id' + 'sk-9f8a7b6c5d4e3f2a1b0c').slice(-12));
      expect(result.snapshot.api.count).toBe(5);
      expect(result.snapshot.api.active).toBe(true);
    });
  });

  describe('unhashed fields', () => {
    it('should leave paths outside fieldsToHash unchanged', () => {
      const snapshot = {
        api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c', endpoint: 'https://api.example.com' },
        title: 'My Dashboard',
      };
      const fieldsToHash = { api: { key: true } };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.snapshot.api.endpoint).toBe('https://api.example.com');
      expect(result.snapshot.title).toBe('My Dashboard');
    });
  });

  describe('SHA-256', () => {
    it('should hash keyed by salt', () => {
      const snapshot = { apiKey: 'sk-3c4d5e6f7a8b9c0d' };
      const fieldsToHash = { apiKey: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'rule-id-xyz' });

      expect(result.snapshot.apiKey).toBe(sha256('rule-id-xyz' + 'sk-3c4d5e6f7a8b9c0d').slice(-12));
    });

    it('should produce deterministic output for the same value and salt', () => {
      const snapshot = { apiKey: 'sk-3c4d5e6f7a8b9c0d' };
      const fieldsToHash = { apiKey: true };
      const result1 = sanitizeFields(snapshot, { fieldsToHash, salt: 'same-id' });
      const result2 = sanitizeFields(snapshot, { fieldsToHash, salt: 'same-id' });

      expect(result1.snapshot.apiKey).toBe(result2.snapshot.apiKey);
    });

    it('should produce different hashes for different salts', () => {
      const snapshot = { apiKey: 'sk-3c4d5e6f7a8b9c0d' };
      const fieldsToHash = { apiKey: true };
      const result1 = sanitizeFields(snapshot, { fieldsToHash, salt: 'rule-id-1' });
      const result2 = sanitizeFields(snapshot, { fieldsToHash, salt: 'rule-id-2' });

      expect(result1.snapshot.apiKey).not.toBe(result2.snapshot.apiKey);
    });
  });

  describe('redaction (low-entropy data)', () => {
    it('should redact a string field with the placeholder and list its path', () => {
      const snapshot = { owner: { email: 'bob@example.com' } };
      const fieldsToRedact = { owner: { email: true } };
      const result = sanitizeFields(snapshot, { fieldsToRedact });

      expect(result.fields.redacted).toEqual(['owner.email']);
      expect(result.snapshot.owner.email).toBe(REDACTED);
    });

    it('should redact multiple low-entropy fields (name, ip, email)', () => {
      const snapshot = {
        user: { name: 'Bob Smith', email: 'bob@example.com' },
        source: { ip: '10.0.0.4' },
      };
      const fieldsToRedact = { user: true, source: { ip: true } };
      const result = sanitizeFields(snapshot, { fieldsToRedact });

      expect(result.fields.redacted.sort()).toEqual(
        ['source.ip', 'user.email', 'user.name'].sort()
      );
      expect(result.snapshot.user.name).toBe(REDACTED);
      expect(result.snapshot.user.email).toBe(REDACTED);
      expect(result.snapshot.source.ip).toBe(REDACTED);
    });

    it('should not require a salt to redact', () => {
      const snapshot = { user: { email: 'bob@example.com' } };
      const fieldsToRedact = { user: { email: true } };

      expect(() => sanitizeFields(snapshot, { fieldsToRedact })).not.toThrow();
    });

    it('should only redact string values', () => {
      const snapshot = { user: { age: 42, active: true, email: 'bob@example.com' } };
      const fieldsToRedact = { user: true };
      const result = sanitizeFields(snapshot, { fieldsToRedact });

      expect(result.fields.redacted).toEqual(['user.email']);
      expect(result.snapshot.user.age).toBe(42);
      expect(result.snapshot.user.active).toBe(true);
      expect(result.snapshot.user.email).toBe(REDACTED);
    });

    it('should leave paths outside fieldsToRedact unchanged', () => {
      const snapshot = { user: { email: 'bob@example.com', name: 'Bob' } };
      const fieldsToRedact = { user: { email: true } };
      const result = sanitizeFields(snapshot, { fieldsToRedact });

      expect(result.snapshot.user.email).toBe(REDACTED);
      expect(result.snapshot.user.name).toBe('Bob');
    });
  });

  describe('hashing and redaction together', () => {
    it('should hash and redact different fields in the same snapshot', () => {
      const snapshot = {
        api: { key: 'sk-9f8a7b6c5d4e3f2a1b0c' },
        owner: { email: 'bob@example.com' },
      };
      const fieldsToHash = { api: { key: true } };
      const fieldsToRedact = { owner: { email: true } };
      const result = sanitizeFields(snapshot, { fieldsToHash, fieldsToRedact, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual(['api.key']);
      expect(result.fields.redacted).toEqual(['owner.email']);
      expect(result.snapshot.api.key).toBe(sha256('obj-id' + 'sk-9f8a7b6c5d4e3f2a1b0c').slice(-12));
      expect(result.snapshot.owner.email).toBe(REDACTED);
    });

    it('should redact rather than hash when a field matches both', () => {
      const snapshot = { token: 'tok-1a2b3c4d5e6f7a8b' };
      const fieldsToHash = { token: true };
      const fieldsToRedact = { token: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, fieldsToRedact, salt: 'obj-id' });

      expect(result.fields.redacted).toEqual(['token']);
      expect(result.fields.hashed).toEqual([]);
      expect(result.snapshot.token).toBe(REDACTED);
    });

    it('should still require a salt when hashing even if redaction is also requested', () => {
      expect(() =>
        sanitizeFields(
          { api: { key: 'sk-x' }, owner: { email: 'bob@example.com' } },
          { fieldsToHash: { api: { key: true } }, fieldsToRedact: { owner: { email: true } } }
        )
      ).toThrow('sanitizeFields: salt missing when hashing fields, please use the object.id');
    });
  });

  describe('edge cases', () => {
    it('should handle empty snapshot', () => {
      const result = sanitizeFields({}, { fieldsToHash: { api: true }, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual([]);
      expect(result.snapshot).toEqual({});
    });

    it('should handle empty string value', () => {
      const snapshot = { secret: '' };
      const fieldsToHash = { secret: true };
      const result = sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(result.fields.hashed).toEqual(['secret']);
      expect(result.snapshot.secret).toBe(sha256('obj-id' + '').slice(-12));
    });

    it('should not mutate the original snapshot', () => {
      const api = { key: 'sk-9f8a7b6c5d4e3f2a1b0c' };
      const snapshot = { api };
      const fieldsToHash = { api: true };
      sanitizeFields(snapshot, { fieldsToHash, salt: 'obj-id' });

      expect(snapshot.api).toBe(api);
    });
  });
});
