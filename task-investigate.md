# Investigate Failing Tests

Project: C:\Users\fosbo\war-civ-v2

**Do NOT make any code changes. Read and report only.**

## Failing Tests
1. tests/territory.test.ts - encirclement broken detection
2. tests/strategicAi.test.ts - siege unit didn't advance  
3. tests/siege.test.ts - city count 15 vs expected ≤9

## Tasks
For each test:
1. Read the test and understand expected behavior
2. Read the source files it tests
3. Find the root cause
4. Report with file:line references

Focus on:
- ENCIRCLEMENT_THRESHOLD in territory system
- Siege assignment and strategic movement
- getSettlementOwnershipSnapshot and syncFactionSettlementIds
