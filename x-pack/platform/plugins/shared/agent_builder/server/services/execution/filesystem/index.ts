/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { FilesystemService, type FilesystemServiceDeps } from './filesystem_service';
export { VolumeBackedReadOnlyFs } from './volume_backed_read_only_fs';
export {
  WorkspaceVolume,
  type WorkspaceVolumeDeps,
  DEFAULT_WORKSPACE_CAPACITY_BYTES,
} from './workspace_volume';
export { PassthroughFs } from './passthrough_fs';
export { CapacityLimitedFs } from './capacity_limited_fs';
export { DirtyTrackingFs } from './dirty_tracking_fs';
