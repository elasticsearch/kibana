import type { SavedObjectsServiceSetup } from '@kbn/core/server';
import type { SavedObjectsType } from '@kbn/core-saved-objects-server';
export declare const registerSavedObject: (savedObjects: SavedObjectsServiceSetup) => void;
export declare const maintenanceWindowSavedObjectType: SavedObjectsType;
