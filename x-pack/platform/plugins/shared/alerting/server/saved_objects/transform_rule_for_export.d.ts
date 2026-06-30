import type { SavedObject } from '@kbn/core/server';
import type { RawRule } from '../types';
export declare function transformRulesForExport(rules: SavedObject[]): Array<SavedObject<RawRule>>;
