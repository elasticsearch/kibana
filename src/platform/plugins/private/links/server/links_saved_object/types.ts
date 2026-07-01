/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardLink, ExternalLink, LinksByValueState } from '../types';

export type StoredLink = StoredDashboardLink | StoredExternalLink;
export type StoredLinksState = Omit<LinksByValueState, 'links'> & {
  links?: StoredLink[];
  title: string; // all saved objects have a title
};
export type StoredDashboardLink = Omit<DashboardLink, 'destination'> &
  DeprecatedLinkProperties & {
    destinationRefName: string;
  };
type StoredExternalLink = ExternalLink & DeprecatedLinkProperties;

// For BWC, optionally include deprecated props in StoredLink states so they can be transformed away
interface DeprecatedLinkProperties {
  order?: number;
  id?: string;
}
