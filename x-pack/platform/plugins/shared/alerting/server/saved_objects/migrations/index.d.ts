import type { SavedObjectMigrationMap } from '@kbn/core/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { MigrateFunctionsObject } from '@kbn/kibana-utils-plugin/common';
export { FILEBEAT_7X_INDICATOR_PATH } from './constants';
export declare function getMigrations(encryptedSavedObjects: EncryptedSavedObjectsPluginSetup, searchSourceMigrations: MigrateFunctionsObject, isPreconfigured: (connectorId: string) => boolean): SavedObjectMigrationMap;
