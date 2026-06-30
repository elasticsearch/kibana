import type { Replacements } from '../../schemas';
import type { AnonymizationFieldResponse } from '../../schemas/anonymization_fields/bulk_crud_anonymization_fields_route.gen';
export declare const getIsDataAnonymizable: (rawData: string | Record<string, string[]>) => boolean;
export declare const isAllowed: ({ anonymizationFields, field, }: {
    anonymizationFields: AnonymizationFieldResponse[];
    field: string;
}) => boolean;
export declare const isDenied: ({ anonymizationFields, field, }: {
    anonymizationFields: AnonymizationFieldResponse[];
    field: string;
}) => boolean;
export declare const isAnonymized: ({ anonymizationFields, field, }: {
    anonymizationFields: AnonymizationFieldResponse[];
    field: string;
}) => boolean;
export declare const replaceAnonymizedValuesWithOriginalValues: ({ messageContent, replacements, }: {
    messageContent: string;
    replacements: Replacements | null | undefined;
}) => string;
export declare const replaceOriginalValuesWithUuidValues: ({ messageContent, replacements, }: {
    messageContent: string;
    replacements: Replacements;
}) => string;
