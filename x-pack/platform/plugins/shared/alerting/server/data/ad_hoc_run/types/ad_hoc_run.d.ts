import type { RawRule } from '../../../types';
import type { RuleDomain } from '../../../application/rule/types';
import type { AdHocRunStatus, BackfillInitiator } from '../../../../common/constants';
export interface AdHocRunSchedule extends Record<string, unknown> {
    interval: string;
    status: AdHocRunStatus;
    runAt: string;
}
type AdHocRunSORule = Pick<RawRule, 'name' | 'tags' | 'alertTypeId' | 'actions' | 'params' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'consumer' | 'enabled' | 'schedule' | 'createdBy' | 'updatedBy' | 'revision'> & {
    createdAt: string;
    updatedAt: string;
};
type AdHocRunRule = Omit<AdHocRunSORule, 'actions'> & Pick<RuleDomain, 'id' | 'actions'>;
export interface AdHocRunSO extends Record<string, unknown> {
    apiKeyId: string;
    apiKeyToUse: string;
    createdAt: string;
    duration: string;
    enabled: boolean;
    end?: string;
    initiator: BackfillInitiator;
    initiatorId?: string;
    rule: AdHocRunSORule;
    spaceId: string;
    start: string;
    status: AdHocRunStatus;
    schedule: AdHocRunSchedule[];
}
export interface AdHocRun {
    apiKeyId: string;
    apiKeyToUse: string;
    createdAt: string;
    duration: string;
    enabled: boolean;
    end?: string;
    id: string;
    initiator: BackfillInitiator;
    initiatorId?: string;
    rule: AdHocRunRule;
    spaceId: string;
    start: string;
    status: AdHocRunStatus;
    schedule: AdHocRunSchedule[];
}
export {};
