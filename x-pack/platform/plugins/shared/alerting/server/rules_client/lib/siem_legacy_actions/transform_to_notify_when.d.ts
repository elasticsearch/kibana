import type { RuleNotifyWhenType } from '../../../../common';
/**
 * Given a throttle from a "security_solution" rule this will transform it into an "alerting" notifyWhen
 * on their saved object.
 * @params throttle The throttle from a "security_solution" rule
 * @returns The correct "NotifyWhen" for a Kibana alerting.
 */
export declare const transformToNotifyWhen: (throttle: string | null | undefined) => RuleNotifyWhenType | null;
