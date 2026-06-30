export interface SecurityHealth {
    isSufficientlySecure: boolean;
    hasPermanentEncryptionKey: boolean;
}
export declare const getSecurityHealth: (isEsSecurityEnabled: () => Promise<boolean | null>, isAbleToEncrypt: () => Promise<boolean>, areApiKeysEnabled: () => Promise<boolean>) => Promise<SecurityHealth>;
