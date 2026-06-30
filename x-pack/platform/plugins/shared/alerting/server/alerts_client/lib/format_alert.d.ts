import type { Alert } from '@kbn/alerts-as-data-utils';
import type { RuleAlertData } from '../../types';
export declare const expandFlattenedAlert: (alert: object) => {};
type Obj = Record<string, unknown>;
export declare const compactObject: (obj: Obj) => Obj;
/**
 * If we're replacing field values in an unflattened alert
 * with the flattened version, we want to remove the unflattened version
 * to avoid duplicate data in the doc
 */
export declare const removeUnflattenedFieldsFromAlert: (alert: Record<string, unknown>, flattenedData: object) => Obj;
export declare const replaceRefreshableAlertFields: <AlertData extends RuleAlertData>(alert: Alert & AlertData) => Record<string, string | string[]>;
export declare const replaceEmptyAlertFields: (alert: Record<string, unknown>, payload?: RuleAlertData) => RuleAlertData;
export {};
