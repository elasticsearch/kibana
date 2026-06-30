/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { CASE_ATTACHMENT_SAVED_OBJECT } from '../../../common/constants';
import { modelVersion1 } from './model_versions/model_version_1';

/**
 * Saved object type for unified attachments
 * This is the v2 version of the comments saved object type (CASE_COMMENT_SAVED_OBJECT).
 *
 * The comments in the mapping indicate the additional properties that are stored in Elasticsearch but are not indexed.
 * Remove these comments when https://github.com/elastic/kibana/issues/152756 is resolved.
 */

export const createCaseAttachmentSavedObjectType = (): SavedObjectsType => ({
  name: CASE_ATTACHMENT_SAVED_OBJECT,
  indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
  hidden: true,
  namespaceType: 'multiple-isolated',
  mappings: {
    dynamic: false,
    properties: {
      type: {
        type: 'keyword',
        ignore_above: 1024,
      },
      attachmentId: {
        type: 'keyword',
        ignore_above: 1024,
      },
      owner: {
        type: 'keyword',
        ignore_above: 1024,
      },
      data: {
        properties: {
          content: {
            type: 'text',
          },
          /*
          state: {
            dynamic: false,
            properties: {},
          },
           */
        },
      },
      created_at: {
        type: 'date',
      },
      created_by: {
        properties: {
          /*
          full_name: {
            type: 'keyword',
          },
          email: {
            type: 'keyword',
          },
          profile_uid: {
            type: 'keyword',
          },
           */
          username: {
            type: 'keyword',
            ignore_above: 1024,
          },
        },
      },
      pushed_at: {
        type: 'date',
      },
      /*
      pushed_by: {
        properties: {
          username: {
            type: 'keyword',
          },
          full_name: {
            type: 'keyword',
          },
          email: {
            type: 'keyword',
          },
          profile_uid: {
            type: 'keyword',
          },
        },
      },
       */
      updated_at: {
        type: 'date',
      },
      /*
      updated_by: {
        properties: {
          username: {
            type: 'keyword',
          },
          full_name: {
            type: 'keyword',
          },
          email: {
            type: 'keyword',
          },
          profile_uid: {
            type: 'keyword',
          },
        },
      },
       */
    },
  },
  migrations: () => ({}),
  modelVersions: {
    1: modelVersion1,
  },
  management: {
    importableAndExportable: true,
    visibleInManagement: false,
  },
});
