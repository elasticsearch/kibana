import type { SavedObjectsClient, SavedObjectsUpdateOptions } from '@kbn/core/server';
import type { AdHocRunSO } from '../../data/ad_hoc_run/types';
import type { AdHocRunAttributesNotPartiallyUpdatable } from '../../saved_objects';
export type PartiallyUpdateableAdHocRunAttributes = Partial<Omit<AdHocRunSO, AdHocRunAttributesNotPartiallyUpdatable>>;
interface PartiallyUpdateAdHocRunSavedObjectOptions {
    refresh?: SavedObjectsUpdateOptions['refresh'];
    version?: string;
    ignore404?: boolean;
    namespace?: string;
}
type SavedObjectClientForUpdate = Pick<SavedObjectsClient, 'update'>;
export declare function partiallyUpdateAdHocRun(savedObjectsClient: SavedObjectClientForUpdate, id: string, attributes: PartiallyUpdateableAdHocRunAttributes, options?: PartiallyUpdateAdHocRunSavedObjectOptions): Promise<void>;
export {};
