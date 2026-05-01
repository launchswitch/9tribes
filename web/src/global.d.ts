declare global {
  interface Window {
    testClick?: () => void;
    openFactionPopup?: () => void;
    openHoverSelect?: (x: number, y: number, unit: { id: string; name: string } | null, city: { id: string; name: string } | null) => void;
    selectUnitFromHover?: (unitId: string) => void;
    selectCityFromHover?: (cityId: string) => void;
    selectUnitDirect?: (unitId: string) => void;
    selectCityDirect?: (cityId: string) => void;
  }
}

export {};