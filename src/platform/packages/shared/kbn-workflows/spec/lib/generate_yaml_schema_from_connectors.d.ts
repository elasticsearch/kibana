import { z } from '@kbn/zod/v4';
import { type ConnectorContractUnion } from '../..';
export declare function getStepId(stepName: string): string;
export declare function generateYamlSchemaFromConnectors(connectors: ConnectorContractUnion[], 
/** Registered custom trigger type ids for YAML schema validation (e.g. example.custom_trigger) */
triggers?: string[], 
/**
 * @deprecated use WorkflowSchemaForAutocomplete instead
 */
loose?: boolean): z.ZodType;
/**
 * Generates a schema for trusted workflow definitions that need the shared workflow envelope
 * validation without materializing the connector-expanded step union.
 */
export declare function generateLightweightYamlSchema(triggers?: string[]): z.ZodType;
