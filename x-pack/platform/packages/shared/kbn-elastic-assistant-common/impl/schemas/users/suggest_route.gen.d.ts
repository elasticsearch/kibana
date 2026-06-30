import { z } from '@kbn/zod/v4';
export declare const SuggestUsersRequestBody: z.ZodObject<{
    searchTerm: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type SuggestUsersRequestBody = z.infer<typeof SuggestUsersRequestBody>;
export type SuggestUsersRequestBodyInput = z.input<typeof SuggestUsersRequestBody>;
/**
 * Array of user profiles
 */
export declare const SuggestUsersResponse: z.ZodArray<z.ZodObject<{
    uid: z.ZodString;
    enabled: z.ZodBoolean;
    data: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    user: z.ZodObject<{
        username: z.ZodString;
        full_name: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>>;
export type SuggestUsersResponse = z.infer<typeof SuggestUsersResponse>;
