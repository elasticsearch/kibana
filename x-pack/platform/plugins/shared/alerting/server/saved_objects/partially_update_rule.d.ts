import type { ElasticsearchClient, SavedObjectsClient, SavedObjectsUpdateOptions } from '@kbn/core/server';
import type { RawRule } from '../types';
import type { RuleAttributesNotPartiallyUpdatable } from '.';
export type PartiallyUpdateableRuleAttributes = Partial<Omit<RawRule, RuleAttributesNotPartiallyUpdatable>>;
interface PartiallyUpdateRuleSavedObjectOptions {
    refresh?: SavedObjectsUpdateOptions['refresh'];
    version?: string;
    ignore404?: boolean;
    namespace?: string;
}
type SavedObjectClientForUpdate = Pick<SavedObjectsClient, 'update'>;
export declare function partiallyUpdateRule(savedObjectsClient: SavedObjectClientForUpdate, id: string, attributes: PartiallyUpdateableRuleAttributes, options?: PartiallyUpdateRuleSavedObjectOptions): Promise<void>;
export declare function partiallyUpdateRuleWithEs(esClient: ElasticsearchClient, id: string, attributes: PartiallyUpdateableRuleAttributes, options?: PartiallyUpdateRuleSavedObjectOptions): Promise<void>;
export {};
