declare global {
  interface Window {
    testClick?: () => void;
    openFactionPopup?: () => void;
  }
}

export {};