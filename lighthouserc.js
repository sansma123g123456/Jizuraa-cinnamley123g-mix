/**
 * Lighthouse CI configuration for JIZURA CIN MIX.
 *
 * The app is a single-page, fully client-side studio: the "page" is one huge
 * HTML file with the whole engine inline. Lighthouse therefore measures
 * document load + first paint, which is exactly what matters for the live
 * demo on GitHub Pages.
 *
 * The thresholds are deliberately modest: this is a creative tool, not a
 * landing page. The point of the check is to catch a REGRESSION (a bundle that
 * suddenly doubles in size, a render-blocking request that appears), not to
 * chase a perfect score.
 */
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        skipAudits: [
          // The app is a canvas tool: there is no meaningful "image elements
          // have alt text" or "document has a title" signal for a studio UI.
          'screenshot-thumbnails',
          'uses-http2',
          'canonical',
        ],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['warn', { minScore: 0.7 }],
        'categories:best-practices': ['warn', { minScore: 0.7 }],
        // Regressions we actually care about:
        'first-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 6000 }],
        'total-byte-weight': ['warn', { maxNumericValue: 6000000 }],
      ],
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
