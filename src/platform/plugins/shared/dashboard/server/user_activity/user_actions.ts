/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UserActivityObject } from '@kbn/core-user-activity-server';
import type { KibanaRequest } from '@kbn/core/server';
import type { Tag } from '@kbn/saved-objects-tagging-oss-plugin/common';

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { coreServices, taggingService } from '../kibana_services';
import type { DashboardCreateResponseBody } from '../api/create';
import type { DashboardDeleteResponseBody } from '../api/delete';
import type { DashboardUpdateResponseBody } from '../api/update';

export async function trackCreateDashboardAction(
  result: DashboardCreateResponseBody,
  request: KibanaRequest
): Promise<void> {
  coreServices.userActivity.trackUserAction({
    message: `User created dashboard "${result.data.title}" (id: ${result.id}).`,
    event: {
      action: 'dashboard_create',
      type: 'creation',
    },
    object: await getUserActivityObject(result, request),
  });
}

export async function trackUpdateDashboardAction(
  result: DashboardUpdateResponseBody,
  request: KibanaRequest
) {
  coreServices.userActivity.trackUserAction({
    message: `User made edits to dashboard "${result.data.title}" (id: ${result.id}) and successfully saved it.`,
    event: {
      action: 'dashboard_update',
      type: 'change',
    },
    object: await getUserActivityObject(result, request),
  });
}

export async function trackDeleteDashboardAction(
  result: DashboardDeleteResponseBody,
  request: KibanaRequest
) {
  coreServices.userActivity.trackUserAction({
    message: `User deleted dashboard "${result.data.title}" (id: ${result.id}).`,
    event: {
      action: 'dashboard_delete',
      type: 'deletion',
    },
    object: await getUserActivityObject(result, request),
  });
}

export async function getUserActivityObject(
  result: { id: string; data: Pick<DashboardState, 'title' | 'tags'> },
  request: KibanaRequest
): Promise<UserActivityObject> {
  let tagTitles: string[] = [];
  if (result.data.tags?.length) {
    const soClient = coreServices.savedObjects.getScopedClient(request);
    const tagClient = taggingService?.createTagClient({ client: soClient });
    const tagPromises: Array<Promise<Tag>> = [];
    if (tagClient) {
      result.data.tags.forEach((tag) => {
        tagPromises.push(tagClient.get(tag));
      });
    }
    tagTitles = (await Promise.all(tagPromises)).map((tag) => tag.name);
  }
  return {
    id: result.id,
    name: result.data.title,
    type: 'dashboard',
    tags: tagTitles,
  };
}
