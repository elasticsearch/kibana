import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
interface UseLicenseReturnValue {
    isAtLeastPlatinum: () => boolean;
}
interface UseLicenseProps {
    licensing: LicensingPluginStart;
}
export declare const useLicense: ({ licensing }: UseLicenseProps) => UseLicenseReturnValue;
export {};
