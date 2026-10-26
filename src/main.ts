// =============================================================================
// main.ts — Application entry point
// =============================================================================

import { App } from './ui/App.js';

// Wait for DOM before mounting (or mount immediately if already interactive/complete)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}
