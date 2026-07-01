/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { z } from '@kbn/zod/v4';
import { getRegisteredTriggerConditionDefinition } from './get_registered_trigger_condition_definition';
import { isCursorInKqlTriggerConditionField } from './is_cursor_in_kql_trigger_condition_field';
import { triggerSchemas } from '../../../../trigger_schemas';

const CONDITION_PATH = ['triggers', 0, 'on', 'condition'] as const;

describe('getRegisteredTriggerConditionDefinition', () => {
  const mockDefinition: PublicTriggerDefinition = {
    id: 'example.custom_trigger',
    stability: 'tech_preview',
    title: 'Example',
    description: 'Example trigger',
    eventSchema: z.object({ severity: z.string() }),
  };

  beforeEach(() => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(mockDefinition);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the registered definition when path is triggers[i].on.condition and type is registered', () => {
    const doc = parseDocument(`triggers:
  - type: example.custom_trigger
    on:
      condition: "event.severity: *"
`);
    expect(getRegisteredTriggerConditionDefinition(doc, [...CONDITION_PATH])).toEqual(
      mockDefinition
    );
    expect(triggerSchemas.getTriggerDefinition).toHaveBeenCalledWith('example.custom_trigger');
  });

  it('returns undefined when not on the condition path', () => {
    const doc = parseDocument(`triggers:
  - type: example.custom_trigger
    on:
      condition: "x"
`);
    expect(getRegisteredTriggerConditionDefinition(doc, ['triggers', 0, 'on'])).toBeUndefined();
  });

  it('returns undefined when trigger type is not registered', () => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(undefined);
    const doc = parseDocument(`triggers:
  - type: manual
    on:
      condition: "x"
`);
    expect(getRegisteredTriggerConditionDefinition(doc, [...CONDITION_PATH])).toBeUndefined();
  });
});

describe('isCursorInKqlTriggerConditionField', () => {
  const mockDefinition: PublicTriggerDefinition = {
    id: 'example.custom_trigger',
    stability: 'tech_preview',
    title: 'Example',
    description: 'Example trigger',
    eventSchema: z.object({ severity: z.string() }),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is true when offset is inside condition value for a registered trigger', () => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(mockDefinition);
    const marker = '|<-';
    const withMarker = `version: "1"
triggers:
  - type: example.custom_trigger
    on:
      condition: "event.severity: hi and ${marker}foo"
`;
    const offset = withMarker.indexOf(marker);
    const cleaned = withMarker.replace(marker, '');
    const doc = parseDocument(cleaned);
    expect(isCursorInKqlTriggerConditionField(doc, offset)).toBe(true);
  });

  it('is false when yamlDocument is null', () => {
    expect(isCursorInKqlTriggerConditionField(null, 0)).toBe(false);
  });

  it('is false for built-in trigger type in condition (unregistered)', () => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(undefined);
    const marker = '|<-';
    const withMarker = `version: "1"
triggers:
  - type: manual
    on:
      condition: "event.severity: *${marker}"
`;
    const offset = withMarker.indexOf(marker);
    const cleaned = withMarker.replace(marker, '');
    const doc = parseDocument(cleaned);
    expect(isCursorInKqlTriggerConditionField(doc, offset)).toBe(false);
  });

  it('is false when cursor is outside the condition scalar', () => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(mockDefinition);
    const yaml = `version: "1"
name: test
`;
    const doc = parseDocument(yaml);
    const offset = yaml.indexOf('test');
    expect(isCursorInKqlTriggerConditionField(doc, offset)).toBe(false);
  });
});
