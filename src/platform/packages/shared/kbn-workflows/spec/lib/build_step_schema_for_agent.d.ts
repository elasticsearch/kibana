import { z } from '@kbn/zod/v4';
import type { ConnectorContractUnion } from '../..';
import type { BaseStepDefinition } from '../step_definition_types';
/**
 * Build a simplified step YAML schema from a ConnectorContractUnion.
 *
 * Produces the complete object shape an AI agent would write in workflow YAML:
 * `name`, `type`, `with` (params), `connector-id`, config fields, and common
 * optional step properties (`if`, `timeout`).
 *
 * This is a simplified, non-recursive variant of `generateStepSchemaForConnector`
 * (which builds the full recursive schema used for validation). It intentionally
 * omits `on-failure` recursion so the result can be safely converted to JSON Schema
 * without infinite references.
 */
export declare function buildConnectorStepSchema(connector: ConnectorContractUnion): z.ZodType;
/**
 * Build a simplified step YAML schema from a BaseStepDefinition (built-in steps).
 *
 * For flow-control steps (if, foreach), the `configSchema` fields (`condition`,
 * `steps`, `else`, `foreach`) become top-level step properties. Common optional
 * properties (`if`, `timeout`) are added for non-flow-control steps only.
 */
export declare function buildBuiltInStepSchema(step: BaseStepDefinition): z.ZodType;
/**
 * Compact representation of a single step parameter for the AI agent.
 */
export interface StepParamSummary {
    name: string;
    type: string;
    required: boolean;
    description?: string;
}
/**
 * Build a compact list of top-level parameters from a Zod object schema.
 * Only walks one level deep -- nested object details are omitted.
 */
export declare function buildStepParamsSummary(schema: z.ZodType): StepParamSummary[];
/**
 * Produce a one-line summary of an output schema, e.g.
 * `"object with: took (number), errors (boolean), items (array)"`.
 */
export declare function buildOutputSummary(schema: z.ZodType): string;
