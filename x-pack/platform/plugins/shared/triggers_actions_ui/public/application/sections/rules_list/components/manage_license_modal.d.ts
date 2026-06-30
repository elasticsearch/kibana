import React from 'react';
interface Props {
    licenseType: string;
    ruleTypeId: string;
    onConfirm: () => void;
    onCancel: () => void;
}
export declare const ManageLicenseModal: React.FC<Props>;
export {};
