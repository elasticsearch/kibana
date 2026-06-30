import type { z } from '@kbn/zod/v4';
export interface MockZodIssue {
    code: 'invalid_literal' | 'unknown';
    message: string;
    path: string[];
    received: string;
}
export interface MockZodError {
    message: string;
    issues: MockZodIssue[];
}
export interface FormattedZodError {
    message: string;
    issues: z.core.$ZodIssue[] | MockZodIssue[];
}
export declare class InvalidYamlSchemaError extends Error {
    formattedZodError?: FormattedZodError;
    constructor(message: string, formattedZodError?: FormattedZodError);
}
