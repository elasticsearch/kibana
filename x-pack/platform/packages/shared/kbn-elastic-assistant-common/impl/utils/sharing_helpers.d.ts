import type { ConversationResponse, User } from '../schemas';
export declare enum ConversationSharedState {
    SHARED = "shared",
    RESTRICTED = "restricted",
    PRIVATE = "private"
}
/**
 * Determines the shared state of a conversation based on the number of users.
 * - If there are no users, the conversation is considered "Shared".
 * - If there is one user, the conversation is "Private".
 * - If there are multiple users, the conversation is "Restricted".
 * @param conversation
 */
export declare const getConversationSharedState: (conversation?: Pick<ConversationResponse, "id" | "users">) => ConversationSharedState;
export declare const getCurrentConversationOwner: (conversation?: Pick<ConversationResponse, "createdBy" | "users">) => {
    id?: string | undefined;
    name?: string | undefined;
};
/**
 * Checks if the current user is the owner of the conversation.
 * The owner is defined as the user who created the conversation or, in legacy conversations,
 * the only user in the conversation.
 * @param conversation
 * @param user
 */
export declare const getIsConversationOwner: (conversation: Pick<ConversationResponse, "createdBy" | "users" | "id"> | undefined, user?: User) => boolean;
