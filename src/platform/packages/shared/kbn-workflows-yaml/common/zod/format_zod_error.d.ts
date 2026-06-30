import type { Document } from 'yaml';
import type { z } from '@kbn/zod/v4';
import type { ConnectorParamsSchemaResolver } from './enrich_error_message';
import type { FormattedZodError, MockZodError } from '../errors/invalid_yaml_schema';
interface FormatZodErrorResult {
    message: string;
    formattedError: FormattedZodError;
}
export interface FormatZodErrorOptions {
    /** Optional workflow schema for enhanced error messages */
    schema?: z.ZodType;
    /** Optional parsed YAML document for step type lookups */
    yamlDocument?: Document;
    /** Optional resolver for connector-specific params schemas (injected from the host plugin) */
    connectorParamsSchemaResolver?: ConnectorParamsSchemaResolver;
}
/**
 * Formats Zod validation errors into user-friendly messages.
 * Uses schema-aware enrichment to provide helpful hints about expected values.
 */
export declare function formatZodError(error: z.ZodError | MockZodError, options?: FormatZodErrorOptions): FormatZodErrorResult;
export {};
