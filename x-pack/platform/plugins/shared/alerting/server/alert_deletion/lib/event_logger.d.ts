import type { AlertDeletionContext } from '../alert_deletion_client';
export declare const logSuccessfulDeletion: (context: AlertDeletionContext, runDate: Date, numDeleted: number, spaceIds: string[]) => void;
export declare const logFailedDeletion: (context: AlertDeletionContext, runDate: Date, numDeleted: number, spaceIds: string[], errMessage: string) => void;
