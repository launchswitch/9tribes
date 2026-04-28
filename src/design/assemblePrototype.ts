// Assemble a complete prototype from chassis and components

import type { PrototypeId, FactionId, ChassisId, ComponentId } from '../types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { ResearchState } from '../features/research/types.js';
import type { Faction } from '../features/factions/types.js';
import { validatePrototype, type PrototypeValidationOptions } from './validatePrototype.js';
import { calculatePrototypeStats } from './calculatePrototypeStats.js';

export interface AssemblePrototypeOptions {
  capabilityLevels?: Record<string, number>;
  researchState?: ResearchState;
  faction?: Pick<Faction, 'nativeDomain' | 'learnedDomains'>;
  validation?: PrototypeValidationOptions;
  id?: PrototypeId;
  name?: string;
  tags?: string[];
  sourceRecipeId?: string;
  productionCost?: number;
  rangeBonus?: number;
  movesBonus?: number;
}

/**
 * Assemble a complete prototype entity from chassis and components
 * Throws an error if validation fails
 */
export function assemblePrototype(
  factionId: FactionId,
  chassisId: ChassisId,
  componentIds: ComponentId[],
  registry: RulesRegistry,
  existingPrototypeIds: PrototypeId[] = [],
  options: AssemblePrototypeOptions = {}
): Prototype {
  // Validate first
  const validation = validatePrototype(
    chassisId,
    componentIds,
    registry,
    options.capabilityLevels,
    options.researchState,
    options.faction,
    options.validation
  );
  if (!validation.valid) {
    throw new Error(
      `Failed to assemble prototype: ${validation.errors.join('; ')}`
    );
  }

  // Get chassis and components for stat calculation
  const chassis = registry.getChassis(chassisId)!;
  const components = componentIds
    .map((id) => registry.getComponent(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Calculate derived stats
  const derivedStats = calculatePrototypeStats(chassis, components);

  // Generate unique prototype ID
  const nextIndex = existingPrototypeIds.length + 1;
  const prototypeId = options.id ?? (`prototype_${nextIndex}` as PrototypeId);

  // Generate descriptive name
  const weaponComponent = components.find((c) => c.slotType === 'weapon');
  const armorComponent = components.find((c) => c.slotType === 'armor');
  const generatedName = [
    chassis.name,
    weaponComponent ? `[${weaponComponent.name}]` : '',
    armorComponent ? `[${armorComponent.name}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const name = options.name ?? generatedName;
  const tags = Array.from(
    new Set([
      ...(chassis.tags ?? []),
      ...components.flatMap((component) => component.tags ?? []),
      ...(options.tags ?? []),
    ])
  );

  return {
    id: prototypeId,
    factionId,
    chassisId,
    componentIds,
    version: 1,
    name,
    derivedStats,
    tags,
    sourceRecipeId: options.sourceRecipeId,
    productionCost: options.productionCost,
    rangeBonus: (options.rangeBonus ?? 0),
    movesBonus: (options.movesBonus ?? 0),
  };
}
