import type { Document } from 'yaml';
import { z } from '@kbn/zod/v4';
export type ConnectorParamsSchemaResolver = (stepType: string) => z.ZodType | null;
export interface ErrorContext {
    schema?: z.ZodType;
    yamlDocument?: Document;
    /**
     * Optional resolver that returns the params schema for a given connector/step
     * type. When omitted, connector-specific error enrichment is skipped and
     * enrichment falls back to the workflow schema.
     */
    connectorParamsSchemaResolver?: ConnectorParamsSchemaResolver;
}
export interface EnrichmentResult {
    message: string;
    enriched: boolean;
}
export declare function clearEnrichmentCache(): void;
export declare function enrichErrorMessage(path: PropertyKey[], originalMessage: string, errorCode: string, context: ErrorContext): EnrichmentResult;
