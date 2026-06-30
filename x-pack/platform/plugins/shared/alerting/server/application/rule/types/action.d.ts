import type { TypeOf } from '@kbn/config-schema';
import type { actionSchema, actionRequestSchema, systemActionSchema, systemActionRequestSchema } from '../schemas';
export type ActionRequest = TypeOf<typeof actionRequestSchema>;
export type SystemActionRequest = TypeOf<typeof systemActionRequestSchema>;
export type Action = TypeOf<typeof actionSchema>;
export type SystemAction = TypeOf<typeof systemActionSchema>;
