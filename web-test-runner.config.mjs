const filteredLogs = [
  'Running in dev mode',
  'Lit is in dev mode',
  'mwc-list-item scheduled an update',
];

export default /** @type {import("@web/test-runner").TestRunnerConfig} */ ({
  files: ['dist/**/*.spec.js'],

  /** Resolve bare module imports */
  nodeResolve: {
    exportConditions: ['browser', 'development'],
  },

  /** Filter out lit dev mode logs */
  filterBrowserLogs(log) {
    for (const arg of log.args) {
      if (typeof arg === 'string' && filteredLogs.some(l => arg.includes(l))) {
        return false;
      }
    }
    return true;
  },

  /** Compile JS for older browsers. Requires @web/dev-server-esbuild plugin */
  // esbuildTarget: 'auto',

  /** Amount of browsers to run concurrently */
  concurrentBrowsers: 3,

  /** Amount of test files per browser to test concurrently */
  concurrency: 2,

  /** Browsers to run tests on */
  // browsers,

  // See documentation for all available options
});
