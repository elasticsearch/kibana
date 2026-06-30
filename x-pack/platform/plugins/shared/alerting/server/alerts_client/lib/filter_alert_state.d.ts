import type { AlertInstanceState } from '@kbn/alerting-state-types';
export declare function filterAlertState<State extends AlertInstanceState>(state: State): Partial<State>;
