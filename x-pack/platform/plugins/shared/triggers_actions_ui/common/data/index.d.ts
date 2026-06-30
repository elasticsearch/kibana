export * from './lib/date_range_info';
export * from './lib/build_agg';
export * from './lib/parse_aggregation_results';
export interface TimeSeriesResult {
    results: TimeSeriesResultRow[];
    truncated: boolean;
}
export interface TimeSeriesResultRow {
    group: string;
    metrics: MetricResult[];
}
export type MetricResult = [string, number];
