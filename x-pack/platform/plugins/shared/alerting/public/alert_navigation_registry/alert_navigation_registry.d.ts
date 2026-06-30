import type { RuleType } from '../../common';
import type { AlertNavigationHandler } from './types';
export declare class AlertNavigationRegistry {
    private readonly alertNavigations;
    has(consumer: string, alertType: RuleType): boolean;
    hasTypedHandler(consumer: string, ruleTypeId: string): boolean;
    hasDefaultHandler(consumer: string): boolean;
    private createConsumerNavigation;
    registerDefault(consumer: string, handler: AlertNavigationHandler): void;
    register(consumer: string, ruleTypeId: string, handler: AlertNavigationHandler): void;
    get(consumer: string, alertType: RuleType): AlertNavigationHandler;
}
