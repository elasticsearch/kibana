import type { RawRule } from '../../types';
import type { RulesClientContext } from '../types';
export declare const untrackRuleAlerts: (context: RulesClientContext, id: string, attributes: RawRule) => Promise<void>;
