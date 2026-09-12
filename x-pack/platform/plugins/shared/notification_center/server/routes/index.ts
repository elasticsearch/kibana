/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NotificationRouteDeps } from './route_deps';
import { registerGetNotificationsRoute } from './get_notifications';
import { registerGetUnreadStatusRoute } from './get_unread_status';
import { registerMarkReadRoute } from './mark_read';
import { registerMarkAllReadRoute } from './mark_all_read';

export type { NotificationCenterCoreSetup, NotificationRouteDeps } from './route_deps';

export const registerNotificationRoutes = (deps: NotificationRouteDeps): void => {
  registerGetNotificationsRoute(deps);
  registerGetUnreadStatusRoute(deps);
  registerMarkReadRoute(deps);
  registerMarkAllReadRoute(deps);
};
