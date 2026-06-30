interface BaseLineParseResult {
    fullKey: string;
    matchType: string;
    match: RegExpMatchArray | null;
}
export interface VariableLineParseResult extends BaseLineParseResult {
    matchType: 'at' | 'variable-complete' | 'variable-unfinished';
    match: RegExpMatchArray;
    pathSegments: string[] | null;
    lastPathSegment: string | null;
}
export interface ForeachVariableLineParseResult extends BaseLineParseResult {
    matchType: 'foreach-variable';
    match: null;
    pathSegments: string[] | null;
    lastPathSegment: string | null;
}
export interface LiquidLineParseResult extends BaseLineParseResult {
    matchType: 'liquid-filter' | 'liquid-block-filter' | 'liquid-block-keyword';
    match: RegExpMatchArray;
}
export interface LiquidSyntaxLineParseResult extends BaseLineParseResult {
    matchType: 'liquid-syntax';
    match: null;
}
export interface ConnectorIdLineParseResult extends BaseLineParseResult {
    matchType: 'connector-id';
    match: RegExpMatchArray;
    valueStartIndex: number;
}
export interface WorkflowLineParseResult extends BaseLineParseResult {
    matchType: 'workflow-id';
    match: RegExpMatchArray;
    valueStartIndex: number;
}
export interface WorkflowInputsLineParseResult extends BaseLineParseResult {
    matchType: 'workflow-inputs';
    match: RegExpMatchArray | null;
    valueStartIndex?: number;
}
export interface TypeLineParseResult extends BaseLineParseResult {
    matchType: 'type';
    match: RegExpMatchArray;
    valueStartIndex: number;
}
export interface TimezoneLineParseResult extends BaseLineParseResult {
    matchType: 'timezone';
    match: RegExpMatchArray;
    valueStartIndex: number;
}
export type LineParseResult = VariableLineParseResult | ForeachVariableLineParseResult | LiquidLineParseResult | LiquidSyntaxLineParseResult | ConnectorIdLineParseResult | WorkflowLineParseResult | WorkflowInputsLineParseResult | TypeLineParseResult | TimezoneLineParseResult;
export declare function parseLineForCompletion(lineUpToCursor: string): LineParseResult | null;
export declare function isVariableLineParseResult(lineParseResult: LineParseResult): lineParseResult is VariableLineParseResult;
export {};
