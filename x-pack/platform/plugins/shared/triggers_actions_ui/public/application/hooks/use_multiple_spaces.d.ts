interface UseMultipleSpacesProps {
    setShowFromAllSpaces: React.Dispatch<React.SetStateAction<boolean>>;
    showFromAllSpaces: boolean;
    visibleColumns: string[];
    setVisibleColumns: React.Dispatch<React.SetStateAction<string[]>>;
}
export declare const useMultipleSpaces: (props: UseMultipleSpacesProps) => {
    onShowAllSpacesChange: () => void;
    canAccessMultipleSpaces: boolean;
    namespaces: string[] | undefined;
    activeSpace: import("../../../../spaces/public").SpacesDataEntry | undefined;
};
export {};
