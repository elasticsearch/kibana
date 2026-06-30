import type { TypeOf } from '@kbn/config-schema/src/types/object_type';
import type { NormalizedAlertAction, NormalizedSystemAction } from '../../rules_client';
import type { actionsSchema, systemActionsSchema } from './actions_schema';
export declare const rewriteActionsReq: (actions: TypeOf<typeof actionsSchema>) => NormalizedAlertAction[];
export declare const rewriteSystemActionsReq: (actions: TypeOf<typeof systemActionsSchema>) => NormalizedSystemAction[];
