import { z } from '@kbn/zod/v4';
import type { InternalConnectorContract } from '../..';
/**
 * Enhanced connector definition that extends auto-generated connectors
 * with better examples, documentation, and user-friendly schemas
 */
export interface EnhancedConnectorDefinition {
    /** The connector type to enhance (must match generated connector) */
    type: string;
    /** Enhanced parameter schema with examples and better descriptions */
    enhancedParamsSchema?: z.ZodType;
    /** Enhanced description with usage examples */
    enhancedDescription?: string;
    /** Example usage snippets for autocomplete */
    examples?: {
        /** Example parameter values for autocomplete */
        params?: Record<string, any>;
        /** Full example workflow step */
        snippet?: string;
    };
    /** Override specific parameters with better schemas/examples */
    parameterEnhancements?: Record<string, {
        schema?: z.ZodType;
        example?: unknown;
        description?: string;
    }>;
}
/**
 * Enhanced Elasticsearch connectors with better examples and documentation
 */
export declare const ENHANCED_ELASTICSEARCH_CONNECTORS: EnhancedConnectorDefinition[];
/**
 * Merge enhanced connector definitions with auto-generated connectors
 */
export declare function mergeEnhancedConnectors(generatedConnectors: InternalConnectorContract[], enhancedConnectors: EnhancedConnectorDefinition[]): InternalConnectorContract[];
