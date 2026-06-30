import type { Rule } from '../types';
import type { RuleRunMetrics } from './rule_run_metrics_store';
export type RuleInfo = Pick<Rule, 'name' | 'alertTypeId' | 'id'> & {
    spaceId: string;
};
export interface LogSearchMetricsOpts {
    esSearchDuration: number;
    totalSearchDuration: number;
}
export type SearchMetrics = Pick<RuleRunMetrics, 'numSearches' | 'totalSearchDurationMs' | 'esSearchDurationMs'>;
