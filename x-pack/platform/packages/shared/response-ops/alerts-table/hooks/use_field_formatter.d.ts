import type { FieldFormatParams } from '@kbn/field-formats-plugin/common';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
/**
 * Extracts field formatters from the field formats service
 */
export declare const useFieldFormatter: (fieldFormats: FieldFormatsStart) => (fieldType: string, params?: FieldFormatParams) => (v: unknown) => string;
