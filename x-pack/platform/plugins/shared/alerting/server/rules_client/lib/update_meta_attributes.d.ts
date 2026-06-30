import type { RawRule } from '../../types';
import type { RulesClientContext } from '../types';
export declare function updateMetaAttributes<T extends Partial<RawRule>>(context: RulesClientContext, alertAttributes: T): T;
