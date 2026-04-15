export type VisibilityState = 'visible' | 'explored' | 'hidden';

export type HexCoord = {
  q: number;
  r: number;
};

export type HexView = {
  key: string;
  q: number;
  r: number;
  terrain: string;
  visibility: VisibilityState;
  ownerFactionId: string | null;
};

export type FactionView = {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  signatureUnit: string;
  economyAngle: string;
  homeCityId?: string;
  learnedDomains?: string[];
};

export type UnitStatusView = 'ready' | 'fortified' | 'spent' | 'inactive';

export type UnitView = {
  id: string;
  factionId: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  effectiveDefense: number;
  range: number;
  movesRemaining: number;
  movesMax: number;
  acted: boolean;
  canAct: boolean;
  isActiveFaction: boolean;
  status: UnitStatusView;
  prototypeId: string;
  prototypeName: string;
  chassisId: string;
  movementClass?: string;
  role?: string;
  spriteKey: string;
  facing: number;
  visible: boolean;
  veteranLevel?: string;
  xp?: number;
  nativeDomain?: string;
  learnedAbilities?: string[];
  isStealthed?: boolean;
  poisoned?: boolean;
  routed?: boolean;
  preparedAbility?: string;
  isSettler?: boolean;
  canBrace?: boolean;
  canAmbush?: boolean;
  isEmbarked?: boolean;
  transportId?: string | null;
  boardableTransportIds?: string[];
  validDisembarkHexes?: HexCoord[];
};

export type CityView = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  visible: boolean;
  remembered: boolean;
  besieged?: boolean;
  wallHp?: number;
  maxWallHp?: number;
  turnsSinceCapture?: number;
};

export type VillageView = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  visible: boolean;
  remembered: boolean;
};

export type ImprovementView = {
  id: string;
  type: string;
  q: number;
  r: number;
  ownerFactionId: string | null;
  visible: boolean;
};

export type BorderSide = 'north' | 'east' | 'south' | 'west';

export type BorderEdgeView = {
  id: string;
  q: number;
  r: number;
  side: BorderSide;
  factionId: string;
  color: string;
};

export type ReachableHexView = {
  key: string;
  q: number;
  r: number;
  cost: number;
  movesRemainingAfterMove: number;
  path: HexCoord[];
};

export type AttackTargetView = {
  key: string;
  q: number;
  r: number;
  unitId: string;
  distance: number;
};

export type PathPreviewNodeView = {
  key: string;
  q: number;
  r: number;
  step: number;
};

export type WorldViewModel = {
  activeFactionId: string | null;
  map: {
    width: number;
    height: number;
    hexes: HexView[];
  };
  factions: FactionView[];
  units: UnitView[];
  cities: CityView[];
  villages: VillageView[];
  improvements: ImprovementView[];
  overlays: {
    borders: BorderEdgeView[];
    reachableHexes: ReachableHexView[];
    attackHexes: AttackTargetView[];
    pathPreview: PathPreviewNodeView[];
    queuedPath: PathPreviewNodeView[];
    lastMove:
      | {
          unitId: string;
          destination: HexCoord;
        }
      | null;
  };
  visibility: {
    mode: 'full' | 'fogged';
    activeFactionId: string | null;
  };
};
