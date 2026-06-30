import type { Logger } from '@kbn/core/server';
import type { Interval } from '@kbn/task-manager-plugin/server/lib/intervals';
import { type Result } from '../../lib/result_type';
import type { IntervalSchedule } from '../../types';
export declare function getSchedule({ schedule, ruleId, spaceId, retryInterval, logger, }: {
    schedule: Result<IntervalSchedule, Error>;
    ruleId: string;
    spaceId: string;
    retryInterval: Interval;
    logger: Logger;
}): IntervalSchedule | undefined;
