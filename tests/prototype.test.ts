import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { validatePrototype } from '../src/design/validatePrototype';
import { calculatePrototypeStats } from '../src/design/calculatePrototypeStats';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { createResearchState } from '../src/systems/researchSystem';

const registry = loadRulesRegistry();

describe('validatePrototype', () => {
  it('returns valid=true for infantry_frame + basic_spear + simple_armor', () => {
    const result = validatePrototype('infantry_frame', ['basic_spear', 'simple_armor'], registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=true for ranged_frame + basic_bow + simple_armor', () => {
    const result = validatePrototype('ranged_frame', ['basic_bow', 'simple_armor'], registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false for unknown chassis', () => {
    const result = validatePrototype('unknown_chassis', ['basic_spear'], registry);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Chassis 'unknown_chassis' not found");
  });

  it('returns valid=false for unknown component', () => {
    const result = validatePrototype('infantry_frame', ['unknown_component'], registry);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Component 'unknown_component' not found");
  });

  it('returns valid=false when component incompatible with chassis', () => {
    const result = validatePrototype('ranged_frame', ['basic_spear'], registry);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not compatible with chassis');
  });

  it('returns valid=false for duplicate slot types', () => {
    const result = validatePrototype('infantry_frame', ['basic_spear', 'basic_spear'], registry);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Duplicate slot type');
  });

  // Note: Research gating has been redesigned. Chassis are now gated by domain count (tier),
  // not by individual research nodes. Components don't require research gating.
  // The test below reflects the new design where validation depends on capability levels.
  it('validates chassis and components based on capability levels', () => {
    const research = createResearchState('barbaria' as never);
    const capabilityLevels = {
      horsemanship: 6,
      fortification: 6,
      hill_fighting: 4,
    };

    // cavalry_frame requires horsemanship: 4, basic_spear has no requirements
    // So cavalry_frame + basic_spear should be valid with sufficient horsemanship
    expect(
      validatePrototype('cavalry_frame', ['basic_spear'], registry, capabilityLevels, research).valid
    ).toBe(true);

    // infantry_frame + fortress_training requires fortification capability
    // fortification: 6 is sufficient
    expect(
      validatePrototype('infantry_frame', ['basic_spear', 'fortress_training'], registry, capabilityLevels, research).valid
    ).toBe(true);
  });
});

describe('calculatePrototypeStats', () => {
  it('infantry_frame alone: hp=9, attack=2, defense=2, moves=2, range=1', () => {
    const chassis = registry.getChassis('infantry_frame')!;
    const stats = calculatePrototypeStats(chassis, []);
    expect(stats.hp).toBe(9);
    expect(stats.attack).toBe(2);
    expect(stats.defense).toBe(2);
    expect(stats.moves).toBe(2);
    expect(stats.range).toBe(1);
  });

  it('infantry_frame + basic_spear: attack += 3 = 5', () => {
    const chassis = registry.getChassis('infantry_frame')!;
    const spear = registry.getComponent('basic_spear')!;
    const stats = calculatePrototypeStats(chassis, [spear]);
    expect(stats.attack).toBe(5); // 2 base + 3 bonus
  });

  it('infantry_frame + basic_spear + simple_armor: attack=5, defense=4', () => {
    const chassis = registry.getChassis('infantry_frame')!;
    const spear = registry.getComponent('basic_spear')!;
    const armor = registry.getComponent('simple_armor')!;
    const stats = calculatePrototypeStats(chassis, [spear, armor]);
    expect(stats.attack).toBe(5);
    expect(stats.defense).toBe(4); // 2 base + 2 bonus
  });

  it('ranged_frame alone: range=1 (baseRange)', () => {
    const chassis = registry.getChassis('ranged_frame')!;
    const stats = calculatePrototypeStats(chassis, []);
    expect(stats.range).toBe(1);
  });

  it('ranged_frame + basic_bow: range=2 (1+1), attack=3 (1+2)', () => {
    const chassis = registry.getChassis('ranged_frame')!;
    const bow = registry.getComponent('basic_bow')!;
    const stats = calculatePrototypeStats(chassis, [bow]);
    expect(stats.range).toBe(2); // 1 base + 1 bonus
    expect(stats.attack).toBe(3); // 1 base + 2 bonus
  });
});

describe('assemblePrototype', () => {
  it('creates a Prototype with correct factionId', () => {
    const proto = assemblePrototype('barbaria', 'infantry_frame', [], registry);
    expect(proto.factionId).toBe('barbaria');
  });

  it('creates a Prototype with correct chassisId and componentIds', () => {
    const proto = assemblePrototype('barbaria', 'infantry_frame', ['basic_spear'], registry);
    expect(proto.chassisId).toBe('infantry_frame');
    expect(proto.componentIds).toEqual(['basic_spear']);
  });

  it('creates a Prototype with derivedStats calculated', () => {
    const proto = assemblePrototype('barbaria', 'infantry_frame', ['basic_spear', 'simple_armor'], registry);
    expect(proto.derivedStats.attack).toBe(5);
    expect(proto.derivedStats.defense).toBe(4);
  });

  it('throws error when validation fails', () => {
    expect(() => {
      assemblePrototype('barbaria', 'unknown_chassis', [], registry);
    }).toThrow('Failed to assemble prototype');
  });

  it('generates unique prototype ID', () => {
    const proto1 = assemblePrototype('barbaria', 'infantry_frame', [], registry, []);
    const proto2 = assemblePrototype('barbaria', 'infantry_frame', [], registry, [proto1.id]);
    expect(proto1.id).toBe('prototype_1');
    expect(proto2.id).toBe('prototype_2');
  });

  it('generates descriptive name', () => {
    const proto = assemblePrototype('barbaria', 'infantry_frame', ['basic_spear', 'simple_armor'], registry);
    expect(proto.name).toContain('Infantry Frame');
    expect(proto.name).toContain('Basic Spear');
    expect(proto.name).toContain('Simple Armor');
  });
});
