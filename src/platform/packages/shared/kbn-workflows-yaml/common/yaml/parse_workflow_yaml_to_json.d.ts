import type { Document } from 'yaml';
import type { ZodSafeParseResult, ZodType } from '@kbn/zod/v4';
import type { ConnectorParamsSchemaResolver } from '../zod/enrich_error_message';
export type ParseWorkflowYamlToJSONResult<T extends ZodType> = (ZodSafeParseResult<T> | {
    success: false;
    error: Error;
}) & {
    document: Document;
};
export interface ParseWorkflowYamlToJSONOptions {
    /** Optional resolver for connector-specific params schemas, injected from the host plugin */
    connectorParamsSchemaResolver?: ConnectorParamsSchemaResolver;
}
export declare function parseWorkflowYamlToJSON<T extends ZodType>(yamlString: string, schema: T, options?: ParseWorkflowYamlToJSONOptions): ParseWorkflowYamlToJSONResult<T>;
