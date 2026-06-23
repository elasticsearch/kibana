/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InputTextFieldSchema, RadioGroupFieldSchema, TextareaFieldSchema } from './fields';

const baseField = {
  name: 'env',
  control: 'RADIO_GROUP' as const,
  type: 'keyword' as const,
};

const baseTextareaField = {
  name: 'details',
  control: 'TEXTAREA' as const,
  type: 'keyword' as const,
};

const baseInputTextField = {
  name: 'resolution',
  control: 'INPUT_TEXT' as const,
  type: 'keyword' as const,
};

describe('ValidationSchema — required_on_close', () => {
  it('accepts required_on_close: true', () => {
    const result = InputTextFieldSchema.safeParse({
      ...baseInputTextField,
      validation: { required_on_close: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation?.required_on_close).toBe(true);
    }
  });

  it('accepts required_on_close: false', () => {
    const result = InputTextFieldSchema.safeParse({
      ...baseInputTextField,
      validation: { required_on_close: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation?.required_on_close).toBe(false);
    }
  });

  it('rejects non-boolean required_on_close', () => {
    const result = InputTextFieldSchema.safeParse({
      ...baseInputTextField,
      validation: { required_on_close: 'yes' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts required_on_close alongside other validation flags', () => {
    const result = InputTextFieldSchema.safeParse({
      ...baseInputTextField,
      validation: { required: false, required_on_close: true, min_length: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation?.required).toBe(false);
      expect(result.data.validation?.required_on_close).toBe(true);
      expect(result.data.validation?.min_length).toBe(5);
    }
  });

  it('accepts required_on_close without required (the two are independent)', () => {
    const result = InputTextFieldSchema.safeParse({
      ...baseInputTextField,
      validation: { required_on_close: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation?.required).toBeUndefined();
      expect(result.data.validation?.required_on_close).toBe(true);
    }
  });
});

describe('RadioGroupFieldSchema', () => {
  describe('metadata.options validation', () => {
    it('accepts exactly 2 options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['a', 'b'] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts up to 20 options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: Array.from({ length: 20 }, (_, i) => `opt${i}`) },
      });
      expect(result.success).toBe(true);
    });

    it('rejects fewer than 2 options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['only-one'] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects more than 20 options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: Array.from({ length: 21 }, (_, i) => `opt${i}`) },
      });
      expect(result.success).toBe(false);
    });

    it('rejects duplicate options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['a', 'a', 'b'] },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('metadata.default validation', () => {
    it('accepts a valid default that is one of the options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['staging', 'production'], default: 'staging' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts when default is absent', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['staging', 'production'] },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a default that is not one of the options', () => {
      const result = RadioGroupFieldSchema.safeParse({
        ...baseField,
        metadata: { options: ['staging', 'production'], default: 'development' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'Default value development is not a valid option.'
      );
    });
  });
});

describe('TextareaFieldSchema', () => {
  it('accepts a TEXTAREA without metadata (backward compatibility)', () => {
    const result = TextareaFieldSchema.safeParse(baseTextareaField);
    expect(result.success).toBe(true);
  });

  it('accepts metadata with markdown: true', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { markdown: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata?.markdown).toBe(true);
    }
  });

  it('accepts metadata with markdown: false', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { markdown: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata?.markdown).toBe(false);
    }
  });

  it('accepts metadata with default and markdown together', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { default: '## Instructions', markdown: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata?.default).toBe('## Instructions');
      expect(result.data.metadata?.markdown).toBe(true);
    }
  });

  it('accepts metadata with only default (no markdown)', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { default: 'plain text' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata?.default).toBe('plain text');
      expect(result.data.metadata?.markdown).toBeUndefined();
    }
  });

  it('rejects non-boolean markdown value', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { markdown: 'yes' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string default value', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { default: 123 },
    });
    expect(result.success).toBe(false);
  });

  it('preserves unknown metadata keys via catchall', () => {
    const result = TextareaFieldSchema.safeParse({
      ...baseTextareaField,
      metadata: { markdown: true, custom_key: 'value' },
    });
    expect(result.success).toBe(true);
  });
});
