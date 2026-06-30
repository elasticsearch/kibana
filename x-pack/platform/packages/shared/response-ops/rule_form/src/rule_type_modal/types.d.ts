export type { RuleTypeWithDescription, RuleTypeIndexWithDescriptions } from '../common/types';
export interface RuleTypeCountsByProducer {
    total: number;
    [x: string]: number;
}
