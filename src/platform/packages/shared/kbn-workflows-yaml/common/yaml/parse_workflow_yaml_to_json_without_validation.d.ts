import type { Document } from 'yaml';
type ParseYamlToJSONWithoutValidationResult = {
    success: false;
    error: Error;
    document: Document;
} | {
    success: true;
    json: Record<string, unknown>;
    document: Document;
};
/**
 * Parse a YAML string to a JSON object. This function is dangerous because it does not use schema to validate the resulting JSON object.
 * @param yamlString - The YAML string to parse.
 * @returns The JSON object and the YAML document. The document is always
 *   available regardless of success/failure because `parseDocument` is
 *   error-tolerant.
 */
export declare function parseYamlToJSONWithoutValidation(yamlString: string): ParseYamlToJSONWithoutValidationResult;
export {};
