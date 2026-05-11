/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * A relevant subset of the `AppLinkData` type.
 *
 * @see src/platform/plugins/shared/home/server/services/sample_data/lib/sample_dataset_registry_types
 */
export interface AppLink {
  icon: string;
  label: string;
  order?: number;
  path: string;
  'data-test-subj'?: string;
}

/**
 * @see src/platform/plugins/shared/home/server/services/sample_data/lib/sample_dataset_registry_types
 */
export type InstalledStatus = 'installed' | 'not_installed' | 'installing' | 'unknown';

/**
 * A subset of properties from a Sample Data Set that are relevant to these components.
 * Included here as the type is not in a package for consumption by a package.
 *
 * @see src/platform/plugins/shared/home/server/services/sample_data/lib/sample_dataset_schema
 * @see src/platform/plugins/shared/home/server/services/sample_data/lib/sample_dataset_registry_types
 */
export interface SampleDataSet {
  appLinks: AppLink[];
  defaultIndex: string;
  description: string;
  id: string;
  name: string;
  overviewDashboard: string;
  previewImagePath: string;
  darkPreviewImagePath?: string;
  iconPath?: string;
  status?: InstalledStatus;
  statusMsg?: string;
  /**
   * Optional custom install handler. If provided, this will be called instead of
   * the default sample data API. Useful for datasets that use a different installation mechanism.
   */
  customInstall?: () => Promise<void>;
  /**
   * Optional custom remove handler. If provided, this will be called instead of
   * the default sample data API. Useful for datasets that use a different removal mechanism.
   */
  customRemove?: () => Promise<void>;
  /**
   * Optional custom status check handler. If provided, this will be called to poll for
   * installation/removal status instead of using the standard sample data API.
   */
  customStatusCheck?: () => Promise<InstalledStatus>;
}
