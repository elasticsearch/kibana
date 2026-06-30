/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { componentTemplateSchema } from './schema_validation';

describe('componentTemplateSchema', () => {
  it('SHOULD accept minimal valid payload', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {},
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });

  it('SHOULD allow data_stream_options unknown fields', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {
        data_stream_options: { some_new_option: { enabled: true } },
      },
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });

  it('SHOULD reject name that exceeds max length', () => {
    expect(() =>
      componentTemplateSchema.validate({
        name: 'x'.repeat(1001),
        template: {},
        _kbnMeta: { usedBy: [], isManaged: false },
      })
    ).toThrow();
  });

  it('SHOULD require _kbnMeta fields', () => {
    expect(() =>
      componentTemplateSchema.validate({
        name: 'n',
        template: {},
        _kbnMeta: { usedBy: 'not-an-array', isManaged: false } as unknown,
      })
    ).toThrow();

    expect(() =>
      componentTemplateSchema.validate({
        name: 'n',
        template: {},
        _kbnMeta: { usedBy: [], isManaged: 'nope' } as unknown,
      })
    ).toThrow();
  });

  it('SHOULD accept lifecycle object shape', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {
        lifecycle: {
          enabled: true,
          data_retention: '7d',
        },
      },
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });

  it('SHOULD accept lifecycle with frozen_after', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {
        lifecycle: {
          enabled: true,
          data_retention: '90d',
          frozen_after: '30d',
        },
      },
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });

  it('SHOULD reject invalid lifecycle types', () => {
    expect(() =>
      componentTemplateSchema.validate({
        name: 'n',
        template: {
          lifecycle: {
            enabled: 'yes',
          },
        },
        _kbnMeta: { usedBy: [], isManaged: false },
      })
    ).toThrow();
  });

  it('SHOULD accept optional version and deprecated flags', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {},
      version: 1,
      deprecated: true,
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });

  it('SHOULD accept arbitrary _meta object', () => {
    const value = componentTemplateSchema.validate({
      name: 'n',
      template: {},
      _meta: { managed: true, other: { nested: 1 } },
      _kbnMeta: { usedBy: [], isManaged: false },
    });
    expect(value).toBeTruthy();
  });
});
