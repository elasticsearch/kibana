import type { LogMeta, SavedObjectMigrationContext, SavedObjectUnsanitizedDoc } from '@kbn/core/server';
import type { RawRule } from '../../types';
export interface AlertLogMeta extends LogMeta {
    migrations: {
        alertDocument: SavedObjectUnsanitizedDoc<RawRule>;
    };
}
export type AlertMigration = (doc: SavedObjectUnsanitizedDoc<RawRule>, context: SavedObjectMigrationContext) => SavedObjectUnsanitizedDoc<RawRule>;
