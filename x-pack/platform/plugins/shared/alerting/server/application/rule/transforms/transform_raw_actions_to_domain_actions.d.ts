import type { SavedObjectReference } from '@kbn/core/server';
import type { RawRule } from '../../../types';
import type { RuleDomain } from '../types';
interface Args {
    ruleId: string;
    actions: RawRule['actions'];
    isSystemAction: (connectorId: string) => boolean;
    references?: SavedObjectReference[];
}
export declare const transformRawActionsToDomainActions: ({ actions, ruleId, references, isSystemAction, }: Args) => RuleDomain["actions"];
export declare const transformRawActionsToDomainSystemActions: ({ actions, ruleId, references, isSystemAction, }: Args) => RuleDomain["systemActions"];
export {};
