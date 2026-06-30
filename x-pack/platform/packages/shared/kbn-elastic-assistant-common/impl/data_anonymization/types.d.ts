import type { Replacements } from '../schemas';
import type { AnonymizationFieldResponse } from '../schemas/anonymization_fields/bulk_crud_anonymization_fields_route.gen';
export interface AnonymizedValues {
    /** The original values were transformed to these anonymized values */
    anonymizedValues: string[];
    /** A map from replacement value to original value */
    replacements: Replacements;
}
export interface AnonymizedData {
    /** The original data was transformed to this anonymized data */
    anonymizedData: Record<string, string[]>;
    /** A map from replacement value to original value */
    replacements: Replacements;
}
export type GetAnonymizedValues = ({ anonymizationFields, currentReplacements, field, getAnonymizedValue, rawData, }: {
    anonymizationFields?: AnonymizationFieldResponse[];
    currentReplacements: Replacements | undefined;
    field: string;
    getAnonymizedValue: ({ currentReplacements, rawValue, }: {
        currentReplacements: Replacements | undefined;
        rawValue: string;
    }) => string;
    rawData: Record<string, unknown[]>;
}) => AnonymizedValues;
