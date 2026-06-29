/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { getWidgetComponent } from './registry';
import { WidgetType } from './types';
import { getMeta, addMeta } from '../schema_connector_metadata';
import { TextWidget } from './components/text_widget';
import { PasswordWidget } from './components/password_widget';
import { HiddenWidget } from './components/hidden_widget';

describe('Widget Registry', () => {
  describe('getDefaultWidgetForSchema - string schemas', () => {
    it('should return TextWidget for z.string()', () => {
      const schema = z.string();
      const component = getWidgetComponent(schema);

      expect(component).toBe(TextWidget);
    });

    it('should return PasswordWidget for z.string() with sensitive: true', () => {
      const schema = z.string();
      addMeta(schema, { sensitive: true });
      const component = getWidgetComponent(schema);

      expect(component).toBe(PasswordWidget);
    });

    it('should return TextWidget for z.url()', () => {
      const schema = z.url();
      const component = getWidgetComponent(schema);

      expect(component).toBe(TextWidget);
    });
  });

  describe('getDefaultWidgetForSchema - literal schemas', () => {
    it('should return TextWidget for z.literal() with string', () => {
      const schema = z.literal('constant-value');
      const component = getWidgetComponent(schema);

      expect(component).toBe(TextWidget);
    });

    it('should return TextWidget for z.literal() with number', () => {
      const schema = z.literal(42);
      const component = getWidgetComponent(schema);

      expect(component).toBe(TextWidget);
    });

    it('should add disabled metadata to z.literal() schemas', () => {
      const schema = z.literal('constant-value');
      getWidgetComponent(schema);
      const meta = getMeta(schema);

      expect(meta.disabled).toBe(true);
    });
  });

  describe('getDefaultWidgetForSchema - hidden schemas', () => {
    it('should return HiddenWidget for schema with hidden: true', () => {
      const schema = z.string();
      addMeta(schema, { hidden: true });
      const component = getWidgetComponent(schema);

      expect(component).toBe(HiddenWidget);
    });

    it('should prioritize hidden: true over sensitive: true', () => {
      const schema = z.string();
      addMeta(schema, { sensitive: true, hidden: true });
      const component = getWidgetComponent(schema);

      expect(component).toBe(HiddenWidget);
    });

    it('should prioritize hidden: true over an explicit widget value', () => {
      const schema = z.url();
      addMeta(schema, { widget: WidgetType.Text, hidden: true });
      const component = getWidgetComponent(schema);

      expect(component).toBe(HiddenWidget);
    });
  });

  describe('getDefaultWidgetForSchema - unknown schema types', () => {
    it('should throw error for unknown schema type without explicit widget', () => {
      const schema = z.number();

      expect(() => getWidgetComponent(schema)).toThrow(
        /No widget found for schema type: ZodNumber/
      );
    });

    it('should throw error for z.boolean() without explicit widget', () => {
      const schema = z.boolean();

      expect(() => getWidgetComponent(schema)).toThrow(
        /No widget found for schema type: ZodBoolean/
      );
    });

    it('should throw error for z.array() without explicit widget', () => {
      const schema = z.array(z.string());

      expect(() => getWidgetComponent(schema)).toThrow(/No widget found for schema type: ZodArray/);
    });
  });

  describe('getWidgetComponent - error handling', () => {
    it('should throw error when no widget found for schema', () => {
      const schema = z.date();

      expect(() => getWidgetComponent(schema)).toThrow(
        'No widget found for schema type: ZodDate. Please specify a widget in the schema metadata.'
      );
    });

    it('should throw error when widget not in registry', () => {
      const schema = z.string();
      addMeta(schema, { widget: 'nonexistent-widget' as any });

      expect(() => getWidgetComponent(schema)).toThrow(
        'Widget "nonexistent-widget" specified in ZodString metadata is not registered in the widget registry.'
      );
    });

    it('should throw error when custom widget specified but not registered', () => {
      const schema = z.number();
      addMeta(schema, { widget: 'custom-number-widget' as any });

      expect(() => getWidgetComponent(schema)).toThrow(
        'Widget "custom-number-widget" specified in ZodNumber metadata is not registered in the widget registry.'
      );
    });
  });

  describe('explicit widget metadata overrides', () => {
    it('should use explicit widget metadata over default for string', () => {
      const schema = z.string();
      addMeta(schema, { widget: WidgetType.Password });
      const component = getWidgetComponent(schema);

      expect(component).toBe(PasswordWidget);
    });

    it('should use explicit widget metadata over default for enum', () => {
      const schema = z.enum(['a', 'b']);
      addMeta(schema, { widget: WidgetType.Text });
      const component = getWidgetComponent(schema);

      expect(component).toBe(TextWidget);
    });

    it('should use explicit widget: hidden over default widget type', () => {
      const schema = z.enum(['a', 'b']);
      addMeta(schema, { widget: WidgetType.Hidden });
      const component = getWidgetComponent(schema);

      expect(component).toBe(HiddenWidget);
    });
  });

  describe('literal schemas disabled metadata', () => {
    it('should add disabled: true metadata to string literal', () => {
      const schema = z.literal('fixed-string');
      const component = getWidgetComponent(schema);
      const meta = getMeta(schema);

      expect(component).toBe(TextWidget);
      expect(meta.disabled).toBe(true);
    });

    it('should add disabled: true metadata to number literal', () => {
      const schema = z.literal(123);
      const component = getWidgetComponent(schema);
      const meta = getMeta(schema);

      expect(component).toBe(TextWidget);
      expect(meta.disabled).toBe(true);
    });

    it('should add disabled: true metadata to boolean literal', () => {
      const schema = z.literal(true);
      const component = getWidgetComponent(schema);
      const meta = getMeta(schema);

      expect(component).toBe(TextWidget);
      expect(meta.disabled).toBe(true);
    });

    it('should preserve existing disabled metadata on literal schemas', () => {
      const schema = z.literal('value');
      addMeta(schema, { disabled: true });
      getWidgetComponent(schema);
      const meta = getMeta(schema);

      expect(meta.disabled).toBe(true);
    });
  });
});
