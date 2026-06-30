import { WorkflowSchemaForAutocomplete } from '@kbn/workflows';
import type { z } from '@kbn/zod/v4';
export declare function parseWorkflowYamlForAutocomplete(yamlString: string): z.ZodSafeParseResult<z.input<typeof WorkflowSchemaForAutocomplete>> | {
    success: false;
    error: Error;
};
