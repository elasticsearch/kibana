import type { SavedObjectReference } from '@kbn/core/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { DenormalizedAction, NormalizedAlertActionWithGeneratedValues } from '../types';
export declare function denormalizeActions(actionsClient: ActionsClient, alertActions: NormalizedAlertActionWithGeneratedValues[]): Promise<{
    actions: DenormalizedAction[];
    references: SavedObjectReference[];
}>;
