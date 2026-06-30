import type { Replacements } from '../../schemas';
import type { AnonymizationFieldResponse } from '../../schemas/anonymization_fields/bulk_crud_anonymization_fields_route.gen';
import type { AnonymizedData, GetAnonymizedValues } from '../types';
export declare const getAnonymizedData: ({ anonymizationFields, currentReplacements, getAnonymizedValue, getAnonymizedValues, rawData, }: {
    anonymizationFields?: AnonymizationFieldResponse[];
    currentReplacements: Replacements | undefined;
    getAnonymizedValue: ({ currentReplacements, rawValue, }: {
        currentReplacements: Replacements | undefined;
        rawValue: string;
    }) => string;
    getAnonymizedValues: GetAnonymizedValues;
    rawData: Record<string, unknown[]>;
}) => AnonymizedData;
