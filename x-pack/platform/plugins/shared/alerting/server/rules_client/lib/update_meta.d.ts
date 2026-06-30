import type { RawRule } from '../../types';
import type { RulesClientContext } from '../types';
/**
 * @deprecated Use updateMetaAttributes instead
 */
export declare function updateMeta<T extends Partial<RawRule>>(context: RulesClientContext, alertAttributes: T): T;
