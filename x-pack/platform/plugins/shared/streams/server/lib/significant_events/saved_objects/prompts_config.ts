/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SavedObjectsType } from '@kbn/core/server';
import { schema, type TypeOf } from '@kbn/config-schema';

export const streamsPromptsSOType = 'stream-prompts';

export const streamsPromptsSOAttributesV1 = schema.object({
  featurePromptOverride: schema.maybe(schema.string()),
  significantEventsPromptOverride: schema.maybe(schema.string()),
});

export const streamsPromptsSOAttributesV2 = streamsPromptsSOAttributesV1.extends({
  descriptionPromptOverride: schema.maybe(schema.string()),
});

export const streamsPromptsSOAttributesV3 = streamsPromptsSOAttributesV2.extends({
  systemsPromptOverride: schema.maybe(schema.string()),
});

export type PromptsConfigAttributes = TypeOf<typeof streamsPromptsSOAttributesV3>;

export const getStreamsPromptsSavedObject = (): SavedObjectsType => {
  return {
    name: streamsPromptsSOType,
    hidden: false,
    namespaceType: 'multiple',
    mappings: {
      dynamic: false,
      properties: {},
    },
    management: {
      importableAndExportable: false,
    },
    modelVersions: {
      '1': {
        changes: [],
        schemas: {
          forwardCompatibility: streamsPromptsSOAttributesV1.extends({}, { unknowns: 'ignore' }),
          create: streamsPromptsSOAttributesV1,
        },
      },
      '2': {
        changes: [],
        schemas: {
          forwardCompatibility: streamsPromptsSOAttributesV2.extends({}, { unknowns: 'ignore' }),
          create: streamsPromptsSOAttributesV2,
        },
      },
      '3': {
        changes: [],
        schemas: {
          forwardCompatibility: streamsPromptsSOAttributesV3.extends({}, { unknowns: 'ignore' }),
          create: streamsPromptsSOAttributesV3,
        },
      },
    },
  };
};
