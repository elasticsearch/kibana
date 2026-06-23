/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash/fp';
import type { Indices } from '@elastic/elasticsearch/lib/api/types';

import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import type { SetAlertTagsRequestBody } from '../../../../../../common/api/detection_engine/alert_tags';

interface UpdateAlertsTagsArgs {
  context: SecuritySolutionRequestHandlerContext;
  index: Indices;
  ids: string[];
  tags: SetAlertTagsRequestBody['tags'];
}

/**
 * Adds/removes workflow tags on the alerts matching the provided `ids` within `index`.
 * Returns the raw `updateByQuery` response; throws on Elasticsearch errors.
 */
export const updateAlertsTags = async ({ context, index, ids, tags }: UpdateAlertsTagsArgs) => {
  const esClient = (await context.core).elasticsearch.client.asCurrentUser;

  return esClient.updateByQuery({
    index,
    refresh: true,
    script: getUpdateAlertTagsScript(tags),
    query: {
      bool: {
        filter: { terms: { _id: ids } },
      },
    },
    ignore_unavailable: true,
  });
};

export const getUpdateAlertTagsScript = (tags: SetAlertTagsRequestBody['tags']) => {
  const tagsToAdd = uniq(tags.tags_to_add);
  const tagsToRemove = uniq(tags.tags_to_remove);

  return {
    params: { tagsToAdd, tagsToRemove },
    source: `List newTagsArray = [];
        if (ctx._source["kibana.alert.workflow_tags"] != null) {
          for (tag in ctx._source["kibana.alert.workflow_tags"]) {
            if (!params.tagsToRemove.contains(tag)) {
              newTagsArray.add(tag);
            }
          }
          for (tag in params.tagsToAdd) {
            if (!newTagsArray.contains(tag)) {
              newTagsArray.add(tag)
            }
          }
          ctx._source["kibana.alert.workflow_tags"] = newTagsArray;
        } else {
          ctx._source["kibana.alert.workflow_tags"] = params.tagsToAdd;
        }
        `,
    lang: 'painless',
  };
};
