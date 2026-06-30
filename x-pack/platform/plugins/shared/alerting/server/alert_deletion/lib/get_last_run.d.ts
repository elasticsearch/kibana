import type { KibanaRequest } from '@kbn/core/server';
import type { AlertDeletionContext } from '../alert_deletion_client';
export declare const getLastRun: (context: AlertDeletionContext, req: KibanaRequest) => Promise<string | undefined>;
