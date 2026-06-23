/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { registerInstall } from './install';
export { registerStop } from './stop';
export { registerStatus } from './status';
export { registerForceLogExtraction } from './force_log_extraction';
export { registerForceRemoteExtractToUpdates } from './force_remote_extract_to_updates';
export { registerForceHistorySnapshot } from './force_history_snapshot';
export { registerUninstall } from './uninstall';
export { registerCRUDCreate } from './crud/create';
export { registerCRUDUpdate } from './crud/update';
export { registerCRUDBulkUpdate } from './crud/bulk_update';
export { registerCRUDGet } from './crud/get';
export { registerCRUDDelete } from './crud/delete';
export { registerStart } from './start';
export { registerUpdate } from './update';
export { registerResolutionLink } from './resolution/link';
export { registerResolutionUnlink } from './resolution/unlink';
export { registerResolutionGroup } from './resolution/group';
export { registerStartMaintainer } from './entity_maintainers/start';
export { registerStopMaintainer } from './entity_maintainers/stop';
export { registerGetMaintainers } from './entity_maintainers/get_maintainers';
export { registerInitMaintainers } from './entity_maintainers/init';
export { registerRunMaintainer } from './entity_maintainers/run';
export { registerCheckPrivileges } from './check_privileges';
