import type { Replacements } from '../../schemas';
import type { AnonymizationFieldResponse } from '../../schemas/anonymization_fields/bulk_crud_anonymization_fields_route.gen';
interface TransformRawDataParams {
    anonymizationFields?: AnonymizationFieldResponse[];
    currentReplacements: Replacements | undefined;
    getAnonymizedValue: ({ currentReplacements, rawValue, }: {
        currentReplacements: Replacements | undefined;
        rawValue: string;
    }) => string;
    onNewReplacements?: (replacements: Replacements) => void;
    rawData: string | Record<string, unknown[]>;
}
export declare const transformRawData: ({ anonymizationFields, currentReplacements, getAnonymizedValue, onNewReplacements, rawData, }: TransformRawDataParams) => string;
export declare const transformRawDataToRecord: ({ anonymizationFields, currentReplacements, getAnonymizedValue, onNewReplacements, rawData, }: Omit<TransformRawDataParams, "rawData"> & {
    rawData: Record<string, unknown[]>;
}) => Record<string, string[]>;
export {};
