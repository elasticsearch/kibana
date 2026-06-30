export declare const validateRequiredGroupInDefaultActions: ({ actions, isSystemAction, }: {
    actions: Array<{
        id: string;
        group?: string;
    }>;
    isSystemAction: (id: string) => boolean;
}) => void;
