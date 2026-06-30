/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsType } from '@kbn/core/server';
import type { SavedObjectsFullModelVersion } from '@kbn/core-saved-objects-server';
import { ANALYTICS_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { APP_ICON, MARKDOWN_SAVED_OBJECT_TYPE } from '../../common/constants';
import { markdownByValueStateSchema } from '../embeddable/schemas';

const modelVersion1: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    forwardCompatibility: markdownByValueStateSchema.extends({}, { unknowns: 'ignore' }),
    create: markdownByValueStateSchema,
  },
};

export const markdownSavedObjectType: SavedObjectsType = {
  name: MARKDOWN_SAVED_OBJECT_TYPE,
  indexPattern: ANALYTICS_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'multiple-isolated',
  management: {
    icon: APP_ICON,
    defaultSearchField: 'title',
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.title;
    },
  },
  modelVersions: {
    '1': modelVersion1,
  },
  mappings: {
    dynamic: false,
    properties: {
      title: { type: 'text' },
      description: { type: 'text' },
      content: {
        type: 'text',
        index: false,
      },
    },
  },
  migrations: () => {
    return {};
  },
};
