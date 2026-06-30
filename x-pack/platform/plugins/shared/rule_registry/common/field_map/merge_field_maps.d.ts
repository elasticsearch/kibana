import type { FieldMap } from '@kbn/alerts-as-data-utils';
export declare function mergeFieldMaps<T1 extends FieldMap, T2 extends FieldMap>(first: T1, second: T2): T1 & T2;
