---
name: serializationMapFields
description: Map-type fields on GameState (including nested Maps inside Map values) must be explicitly serialized/deserialized; JSON turns Maps into {}
type: project
originSessionId: 63e2f551-bb46-4680-8249-806c2d41d3b1
---
## Map Field Serialization Trap (2026-04-13, updated 2026-04-18)

`GameState` has many `Map<K, V>` fields. These are handled by `playState.ts` `serializeGameState()` / `deserializeGameState()` which converts to/from `Array<[string, V]>`.

**Recurring bug pattern:** Any Map field (or nested Map inside a Map value) that isn't explicitly serialized becomes `{}` after JSON round-trip, causing "object is not iterable" crashes on load.

**Incidents:**
1. **2026-04-13:** `fogState: Map<FactionId, FactionFogState>` was missing from Omit list entirely. Fixed by adding to serialize/deserialize.
2. **2026-04-18:** `FactionFogState` has **nested Maps** (`hexVisibility: Map<string, HexVisibility>`, `lastSeen: Map<string, LastSeenSnapshot>`) that weren't deep-serialized. The outer fogState Map was correctly converted to entries, but the inner Maps became `{}`. Fixed with deep serialization that maps each FactionFogState's inner Maps to arrays.

**Why:** The error only manifests on **save game load**, never on fresh bootstrap (where initialization code builds Maps correctly). This makes it hard to reproduce during normal dev.

**How to apply:** When adding or changing Map fields:
1. Top-level GameState Map fields: add to Omit list, SerializedGameState, serialize, and deserialize in `playState.ts`
2. **Nested Maps inside value types:** also deep-serialize them. The current serialize/deserialize must recurse into any Map values.
3. Add legacy guards (`Array.isArray(x) ? ... : new Map()`) for fields that may exist in old saves as `{}`.
