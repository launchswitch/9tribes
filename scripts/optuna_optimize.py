from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TrialConfig:
    label: str
    kind: str
    path: tuple[str, ...]
    low: float
    high: float


KNOBS = [
    # =========================================================================
    # TERRAIN YIELDS
    # =========================================================================
    # Savannah capped low — optimizer kept pushing it to 0.78+ causing snowball.
    # Max 0.55 keeps it in line with forest/river tier.
    TrialConfig(
        "desert_yield",
        "float",
        ("terrainYields", "desert", "productionYield"),
        0.2,
        0.7,
    ),
    TrialConfig(
        "tundra_yield",
        "float",
        ("terrainYields", "tundra", "productionYield"),
        0.2,
        0.7,
    ),
    TrialConfig(
        "jungle_yield",
        "float",
        ("terrainYields", "jungle", "productionYield"),
        0.2,
        0.6,
    ),
    TrialConfig(
        "forest_yield",
        "float",
        ("terrainYields", "forest", "productionYield"),
        0.2,
        0.55,
    ),
    TrialConfig(
        "savannah_yield",
        "float",
        ("terrainYields", "savannah", "productionYield"),
        0.25,
        0.55,
    ),
    TrialConfig(
        "coast_yield", "float", ("terrainYields", "coast", "productionYield"), 0.2, 0.6
    ),
    TrialConfig(
        "river_yield", "float", ("terrainYields", "river", "productionYield"), 0.4, 0.85
    ),
    # =========================================================================
    # CHASSIS STATS
    # =========================================================================
    # --- Naval frame (coral dominance vector) ---
    TrialConfig("naval_hp", "int", ("chassis", "naval_frame", "baseHp"), 5, 10),
    TrialConfig("naval_attack", "int", ("chassis", "naval_frame", "baseAttack"), 1, 3),
    TrialConfig(
        "naval_defense", "int", ("chassis", "naval_frame", "baseDefense"), 1, 3
    ),
    TrialConfig("naval_moves", "int", ("chassis", "naval_frame", "baseMoves"), 2, 4),
    # --- Cavalry/camel/elephant/ranged ---
    TrialConfig("cavalry_hp", "int", ("chassis", "cavalry_frame", "baseHp"), 10, 15),
    TrialConfig("camel_hp", "int", ("chassis", "camel_frame", "baseHp"), 5, 10),
    TrialConfig("camel_attack", "int", ("chassis", "camel_frame", "baseAttack"), 2, 4),
    TrialConfig(
        "camel_defense", "int", ("chassis", "camel_frame", "baseDefense"), 1, 3
    ),
    TrialConfig("elephant_hp", "int", ("chassis", "elephant_frame", "baseHp"), 12, 16),
    TrialConfig(
        "elephant_attack", "int", ("chassis", "elephant_frame", "baseAttack"), 2, 4
    ),
    TrialConfig(
        "elephant_defense", "int", ("chassis", "elephant_frame", "baseDefense"), 1, 3
    ),
    TrialConfig("ranged_hp", "int", ("chassis", "ranged_frame", "baseHp"), 6, 10),
    # --- Infantry (baseline frame, small range) ---
    TrialConfig("infantry_hp", "int", ("chassis", "infantry_frame", "baseHp"), 7, 11),
    # --- Catapult frame (Hill Clan signature siege unit) ---
    TrialConfig("catapult_hp", "int", ("chassis", "catapult_frame", "baseHp"), 4, 8),
    TrialConfig(
        "catapult_attack", "int", ("chassis", "catapult_frame", "baseAttack"), 2, 6
    ),
    TrialConfig(
        "catapult_defense", "int", ("chassis", "catapult_frame", "baseDefense"), 0, 2
    ),
    # =========================================================================
    # COMPONENT STATS (faction signature equipment)
    # =========================================================================
    TrialConfig(
        "tidal_drill_attack", "int", ("components", "tidal_drill", "attackBonus"), 0, 3
    ),
    TrialConfig(
        "tidal_drill_moves", "int", ("components", "tidal_drill", "movesBonus"), 0, 2
    ),
    TrialConfig(
        "shock_drill_attack", "int", ("components", "shock_drill", "attackBonus"), 0, 4
    ),
    TrialConfig(
        "elephant_harness_attack",
        "int",
        ("components", "elephant_harness", "attackBonus"),
        0,
        3,
    ),
    TrialConfig(
        "elephant_harness_hp",
        "int",
        ("components", "elephant_harness", "hpBonus"),
        0,
        3,
    ),
    TrialConfig(
        "fortress_training_defense",
        "int",
        ("components", "fortress_training", "defenseBonus"),
        0,
        4,
    ),
    TrialConfig(
        "fortress_training_hp",
        "int",
        ("components", "fortress_training", "hpBonus"),
        0,
        4,
    ),
    TrialConfig(
        "poison_arrows_attack",
        "int",
        ("components", "poison_arrows", "attackBonus"),
        0,
        4,
    ),
    TrialConfig(
        "skirmish_drill_attack",
        "int",
        ("components", "skirmish_drill", "attackBonus"),
        0,
        3,
    ),
    TrialConfig(
        "skirmish_drill_moves",
        "int",
        ("components", "skirmish_drill", "movesBonus"),
        0,
        2,
    ),
    TrialConfig(
        "cold_provisions_hp", "int", ("components", "cold_provisions", "hpBonus"), 0, 3
    ),
    TrialConfig(
        "cold_provisions_defense",
        "int",
        ("components", "cold_provisions", "defenseBonus"),
        0,
        3,
    ),
    TrialConfig(
        "druidic_rites_hp", "int", ("components", "druidic_rites", "hpBonus"), 0, 4
    ),
    TrialConfig(
        "druidic_rites_defense",
        "int",
        ("components", "druidic_rites", "defenseBonus"),
        0,
        4,
    ),
    TrialConfig(
        "rivercraft_attack",
        "int",
        ("components", "rivercraft_training", "attackBonus"),
        0,
        3,
    ),
    TrialConfig(
        "rivercraft_moves",
        "int",
        ("components", "rivercraft_training", "movesBonus"),
        0,
        2,
    ),
    # =========================================================================
    # FACTION CAPABILITY SEEDS
    # =========================================================================
    # --- Jungle clan (woodcraft=4, poisoncraft=3, stealth=3, endurance=2) ---
    TrialConfig(
        "jungle_woodcraft",
        "float",
        ("factions", "jungle_clan", "capabilitySeeds", "woodcraft"),
        4,
        6,
    ),
    TrialConfig(
        "jungle_poisoncraft",
        "float",
        ("factions", "jungle_clan", "capabilitySeeds", "poisoncraft"),
        3,
        6,
    ),
    TrialConfig(
        "jungle_stealth",
        "float",
        ("factions", "jungle_clan", "capabilitySeeds", "stealth"),
        2,
        5,
    ),
    TrialConfig(
        "jungle_endurance",
        "float",
        ("factions", "jungle_clan", "capabilitySeeds", "endurance"),
        2,
        5,
    ),
    # --- Druid circle (woodcraft=4, endurance=3, stealth=2, fortification=1) ---
    TrialConfig(
        "druid_woodcraft",
        "float",
        ("factions", "druid_circle", "capabilitySeeds", "woodcraft"),
        4,
        6,
    ),
    TrialConfig(
        "druid_endurance",
        "float",
        ("factions", "druid_circle", "capabilitySeeds", "endurance"),
        3,
        6,
    ),
    TrialConfig(
        "druid_stealth",
        "float",
        ("factions", "druid_circle", "capabilitySeeds", "stealth"),
        2,
        5,
    ),
    TrialConfig(
        "druid_fortification",
        "float",
        ("factions", "druid_circle", "capabilitySeeds", "fortification"),
        1,
        4,
    ),
    # --- Steppe clan (horsemanship=4, mobility=4, woodcraft=2, stealth=2) ---
    TrialConfig(
        "steppe_horsemanship",
        "float",
        ("factions", "steppe_clan", "capabilitySeeds", "horsemanship"),
        4,
        6,
    ),
    TrialConfig(
        "steppe_mobility",
        "float",
        ("factions", "steppe_clan", "capabilitySeeds", "mobility"),
        4,
        6,
    ),
    TrialConfig(
        "steppe_stealth",
        "float",
        ("factions", "steppe_clan", "capabilitySeeds", "stealth"),
        2,
        5,
    ),
    # --- Hill clan (hill_fighting=4, fortification=4, formation_warfare=2) ---
    TrialConfig(
        "hill_fortification",
        "float",
        ("factions", "hill_clan", "capabilitySeeds", "fortification"),
        4,
        6,
    ),
    TrialConfig(
        "hill_fighting",
        "float",
        ("factions", "hill_clan", "capabilitySeeds", "hill_fighting"),
        4,
        6,
    ),
    TrialConfig(
        "hill_formation",
        "float",
        ("factions", "hill_clan", "capabilitySeeds", "formation_warfare"),
        2,
        5,
    ),
    # --- Coral people (seafaring=4, navigation=4, mobility=2) ---
    TrialConfig(
        "coral_seafaring",
        "float",
        ("factions", "coral_people", "capabilitySeeds", "seafaring"),
        4,
        6,
    ),
    TrialConfig(
        "coral_navigation",
        "float",
        ("factions", "coral_people", "capabilitySeeds", "navigation"),
        4,
        6,
    ),
    TrialConfig(
        "coral_mobility",
        "float",
        ("factions", "coral_people", "capabilitySeeds", "mobility"),
        2,
        5,
    ),
    # --- Desert nomads (horsemanship=3, desert_survival=3, mobility=3) ---
    TrialConfig(
        "desert_horsemanship",
        "float",
        ("factions", "desert_nomads", "capabilitySeeds", "horsemanship"),
        3,
        6,
    ),
    TrialConfig(
        "desert_survival",
        "float",
        ("factions", "desert_nomads", "capabilitySeeds", "desert_survival"),
        3,
        6,
    ),
    TrialConfig(
        "desert_mobility",
        "float",
        ("factions", "desert_nomads", "capabilitySeeds", "mobility"),
        3,
        5,
    ),
    # --- Savannah lions (formation_warfare=4, mobility=3, shock_resistance=3) ---
    TrialConfig(
        "savannah_formation",
        "float",
        ("factions", "savannah_lions", "capabilitySeeds", "formation_warfare"),
        4,
        6,
    ),
    TrialConfig(
        "savannah_mobility",
        "float",
        ("factions", "savannah_lions", "capabilitySeeds", "mobility"),
        2,
        4,
    ),
    TrialConfig(
        "savannah_shock",
        "float",
        ("factions", "savannah_lions", "capabilitySeeds", "shock_resistance"),
        3,
        4,
    ),
    # --- River People (navigation=4, seafaring=4, mobility=3, woodcraft=2) ---
    TrialConfig(
        "plains_navigation",
        "float",
        ("factions", "river_people", "capabilitySeeds", "navigation"),
        4,
        6,
    ),
    TrialConfig(
        "plains_seafaring",
        "float",
        ("factions", "river_people", "capabilitySeeds", "seafaring"),
        4,
        6,
    ),
    TrialConfig(
        "plains_mobility",
        "float",
        ("factions", "river_people", "capabilitySeeds", "mobility"),
        3,
        5,
    ),
    TrialConfig(
        "plains_woodcraft",
        "float",
        ("factions", "river_people", "capabilitySeeds", "woodcraft"),
        2,
        5,
    ),
    # --- Frost wardens (fortification=3, hill_fighting=2, endurance=4) ---
    TrialConfig(
        "frost_endurance",
        "float",
        ("factions", "frost_wardens", "capabilitySeeds", "endurance"),
        4,
        6,
    ),
    TrialConfig(
        "frost_fortification",
        "float",
        ("factions", "frost_wardens", "capabilitySeeds", "fortification"),
        3,
        6,
    ),
    TrialConfig(
        "frost_hill_fighting",
        "float",
        ("factions", "frost_wardens", "capabilitySeeds", "hill_fighting"),
        2,
        5,
    ),
    # =========================================================================
    # SIGNATURE ABILITY PARAMETERS
    # =========================================================================
    # Boolean toggles (endlessStride, hitAndRun) are NOT knobs — they are
    # identity-defining and always on.  Only numeric parameters are tuned.
    #
    # --- Savannah Lions: Stampede (elephant charge multiplier) ---
    TrialConfig(
        "stampede_bonus",
        "float",
        ("signatureAbilities", "savannah_lions", "stampedeBonus"),
        0.15,
        0.5,
    ),
    # --- Jungle Clan: Lethal Venom (poison damage per turn) ---
    TrialConfig(
        "venom_damage",
        "float",
        ("signatureAbilities", "jungle_clan", "venomDamagePerTurn"),
        1,
        6,
    ),
    # --- River People: Sneak Attack (river/swamp terrain attack bonus) ---
    TrialConfig(
        "sneak_attack",
        "float",
        ("signatureAbilities", "river_people", "sneakAttackBonus"),
        0.3,
        0.7,
    ),
    # --- Frost Wardens: Polar Call (summon bear stats + lifecycle) ---
    TrialConfig(
        "polar_bear_hp",
        "int",
        ("signatureAbilities", "frost_wardens", "summon", "hp"),
        12,
        30,
    ),
    TrialConfig(
        "polar_bear_attack",
        "int",
        ("signatureAbilities", "frost_wardens", "summon", "attack"),
        3,
        8,
    ),
    TrialConfig(
        "polar_bear_defense",
        "int",
        ("signatureAbilities", "frost_wardens", "summon", "defense"),
        1,
        5,
    ),
    TrialConfig(
        "summon_duration",
        "int",
        ("signatureAbilities", "frost_wardens", "summonDuration"),
        3,
        8,
    ),
    TrialConfig(
        "cooldown_duration",
        "int",
        ("signatureAbilities", "frost_wardens", "cooldownDuration"),
        3,
        8,
    ),
    # --- Desert Nomads: Desert Swarm (group combat bonus) ---
    TrialConfig(
        "desert_swarm_threshold",
        "int",
        ("signatureAbilities", "desert_nomads", "desertSwarmThreshold"),
        2,
        5,
    ),
    TrialConfig(
        "desert_swarm_attack",
        "int",
        ("signatureAbilities", "desert_nomads", "desertSwarmAttackBonus"),
        0,
        3,
    ),
    TrialConfig(
        "desert_swarm_defense",
        "float",
        ("signatureAbilities", "desert_nomads", "desertSwarmDefenseMultiplier"),
        1.0,
        1.3,
    ),
    # --- Coral People: Wall defense multiplier (Pirate coastal fortress) ---
    TrialConfig(
        "pirate_wall_multiplier",
        "float",
        ("signatureAbilities", "coral_people", "wallDefenseMultiplier"),
        1.0,
        3.0,
    ),
]


def set_nested(target: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    current = target
    for key in path[:-1]:
        current = current.setdefault(key, {})
    current[path[-1]] = value


def build_overrides(trial: Any) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    for knob in KNOBS:
        if knob.kind == "int":
            value = trial.suggest_int(knob.label, int(knob.low), int(knob.high))
        else:
            value = trial.suggest_float(knob.label, knob.low, knob.high)
        set_nested(overrides, knob.path, value)
    return overrides


def run_trial(
    evaluate_script: Path,
    overrides: dict[str, Any],
    turns: int,
    stratified: bool,
    random_map: bool,
) -> dict[str, Any]:
    payload = {
        "overrides": overrides,
        "maxTurns": turns,
        "stratified": stratified,
        "mapMode": "randomClimateBands" if random_map else "fixed",
    }
    repo_root = evaluate_script.resolve().parents[1]
    tsx_cli = repo_root / "node_modules" / "tsx" / "dist" / "cli.mjs"
    command = ["node", str(tsx_cli), str(evaluate_script)]
    result = subprocess.run(
        command,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.strip() or result.stdout.strip() or "evaluateBalance failed"
        )
    return json.loads(result.stdout)


def ensure_output_dir(base_dir: Path | None) -> Path:
    if base_dir is not None:
        base_dir.mkdir(parents=True, exist_ok=True)
        return base_dir

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = Path("artifacts") / "balance-optimization" / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Optuna balance search against the war-civ evaluation harness."
    )
    parser.add_argument(
        "--trials", type=int, default=25, help="Number of optimization trials to run."
    )
    parser.add_argument(
        "--turns",
        type=int,
        default=50,
        help="Turn cap passed to the evaluation harness.",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=None, help="Directory for trial artifacts."
    )
    parser.add_argument(
        "--study-name", type=str, default="war-civ-balance", help="Optuna study name."
    )
    parser.add_argument(
        "--random", action="store_true", help="Use random climate-band maps."
    )
    parser.add_argument(
        "--stratified",
        action="store_true",
        help="Use the built-in stratified seed set.",
    )
    args = parser.parse_args()

    import optuna  # Imported lazily so --help works without the dependency.

    repo_root = Path(__file__).resolve().parents[1]
    evaluate_script = repo_root / "scripts" / "evaluateBalance.ts"
    output_dir = ensure_output_dir(args.output_dir)
    trials_path = output_dir / "trials.jsonl"
    candidates_path = output_dir / "best_candidates.json"

    def objective(trial: Any) -> float:
        overrides = build_overrides(trial)
        try:
            evaluation = run_trial(
                evaluate_script, overrides, args.turns, args.stratified, args.random
            )
        except RuntimeError as e:
            print(f"[W] Trial {trial.number} failed: {e}", file=sys.stderr)
            return 999.0
        score = float(evaluation["objective"]["score"])
        trial.set_user_attr("evaluation", evaluation)
        with trials_path.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "trial": trial.number,
                        "score": score,
                        "params": trial.params,
                        "evaluation": evaluation,
                    }
                )
            )
            handle.write("\n")
        return score

    study = optuna.create_study(direction="minimize", study_name=args.study_name)
    study.optimize(objective, n_trials=args.trials)

    best_trials = [
        {
            "trial": trial.number,
            "score": trial.value,
            "params": trial.params,
            "evaluation": trial.user_attrs.get("evaluation"),
        }
        for trial in sorted(
            study.trials,
            key=lambda item: float(
                item.value if item.value is not None else sys.float_info.max
            ),
        )[:5]
    ]
    candidates_path.write_text(
        json.dumps(
            {
                "studyName": args.study_name,
                "bestValue": study.best_value,
                "bestParams": study.best_params,
                "bestTrials": best_trials,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "outputDir": str(output_dir),
                "bestValue": study.best_value,
                "bestParams": study.best_params,
                "bestCandidatesFile": str(candidates_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
