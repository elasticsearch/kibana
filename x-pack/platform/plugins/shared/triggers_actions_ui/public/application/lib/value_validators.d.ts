import type { UserConfiguredActionConnector, IErrorObject, Rule, RuleUiAction } from '../../types';
export declare const validateActionFilterQuery: (actionItem: RuleUiAction) => string | null;
export declare function throwIfAbsent<T>(message: string): (value: T | undefined) => T;
export declare function throwIfIsntContained<T>(requiredValues: Set<string>, message: string | ((requiredValue: string) => string), valueExtractor: (value: T) => string): (values: T[]) => T[];
export declare const isValidUrl: (urlString: string, protocol?: string) => boolean;
export declare function getConnectorWithInvalidatedFields(connector: UserConfiguredActionConnector<Record<string, unknown>, Record<string, unknown>>, configErrors: IErrorObject, secretsErrors: IErrorObject, baseConnectorErrors: IErrorObject): UserConfiguredActionConnector<Record<string, unknown>, Record<string, unknown>>;
export declare function getRuleWithInvalidatedFields(rule: Rule, paramsErrors: IErrorObject, baseAlertErrors: IErrorObject, actionsErrors: IErrorObject[]): Rule;
