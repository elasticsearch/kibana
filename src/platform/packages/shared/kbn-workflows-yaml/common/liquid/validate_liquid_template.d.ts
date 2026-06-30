import { type Document } from 'yaml';
export interface LiquidValidationError {
    message: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
export declare function validateLiquidTemplate(yamlString: string, yamlDocument: Document): LiquidValidationError[];
