import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        // Web-dependent tests require jsdom environment — exclude from node runs
        // balanceHarness excluded from default run (use npm run test:balance)
        exclude: [
            'tests/webGameSession.test.ts',
            'tests/webGameController.test.ts',
            'tests/webWorldViewModel.test.ts',
            'tests/curatedPlaytest.test.ts',
            'tests/liveSessionParity.test.ts',
            'tests/balanceHarness.test.ts',
        ],
    },
});
