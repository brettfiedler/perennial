// Copyright 2020, University of Colorado Boulder

/**
 * This prints out (in JSON form) the tests and operations requested for continuous testing for whatever is in master
 * at this point.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const getActiveRepos = require( './common/getActiveRepos' );
const getRepoList = require( './common/getRepoList' );
const fs = require( 'fs' );

const repos = getActiveRepos();
const phetioRepos = getRepoList( 'testable-phet-io' );
const phetioReposValidated = getRepoList( 'testable-phet-io-validated' );
const runnableRepos = getRepoList( 'testable-runnables' );
const interactiveDescriptionRepos = getRepoList( 'interactive-descriptions' );
const phetioNoState = getRepoList( 'phet-io-state-unsupported' );
const unitTestRepos = getRepoList( 'unit-tests' );

/**
 * {Array.<string>} test
 * {string} type
 * {string} [url]
 * {string} [repo]
 * {string} [queryParameters]
 * {string} [testQueryParameters]
 * {boolean} [es5]
 * {string} [brand]
 * {number} [priority]
 * {Array.<string>} buildDependencies
 */
const tests = [];

tests.push( {
  test: [ 'perennial', 'lint-everything' ],
  type: 'lint-everything',
  priority: 100
} );

// phet brand builds
[
  ...runnableRepos,
  'scenery',
  'kite',
  'dot'
].forEach( repo => {
  tests.push( {
    test: [ repo, 'build' ],
    type: 'build',
    brands: phetioRepos.includes( repo ) ? [ 'phet', 'phet-io' ] : [ 'phet' ],
    repo: repo,
    priority: 1
  } );
} );

// lints
repos.forEach( repo => {
  if ( fs.existsSync( `../${repo}/Gruntfile.js` ) ) {
    tests.push( {
      test: [ repo, 'lint' ],
      type: 'lint',
      repo: repo,
      priority: 8
    } );
  }
} );

runnableRepos.forEach( repo => {
  tests.push( {
    test: [ repo, 'fuzz', 'unbuilt' ],
    type: 'sim-test',
    url: `${repo}/${repo}_en.html`,
    queryParameters: 'brand=phet&ea&fuzz&memoryLimit=1000'
  } );

  tests.push( {
    test: [ repo, 'xss-fuzz' ],
    type: 'sim-test',
    url: `${repo}/${repo}_en.html`,
    queryParameters: 'brand=phet&ea&fuzz&stringTest=xss&memoryLimit=1000',
    testQueryParameters: 'duration=40000',
    priority: 0.3
  } );

  tests.push( {
    test: [ repo, 'fuzz', 'built' ],
    type: 'sim-test',
    url: `${repo}/build/phet/${repo}_en_phet.html`,
    queryParameters: 'fuzz&memoryLimit=1000',
    testQueryParameters: 'duration=80000',

    // We want to elevate the priority so that we get a more even balance (we can't test these until they are built,
    // which doesn't happen always)
    priority: 2,

    brand: 'phet',
    buildDependencies: [ repo ],
    es5: true
  } );

  if ( phetioRepos.includes( repo ) ) {
    tests.push( {
      test: [ repo, 'fuzz', 'built-phet-io' ],
      type: 'sim-test',
      url: `${repo}/build/phet-io/${repo}_all_phet-io.html`,
      queryParameters: 'fuzz&memoryLimit=1000&phetioStandalone',
      testQueryParameters: 'duration=80000',

      brand: 'phet-io',
      buildDependencies: [ repo ],
      es5: true
    } );
  }
} );

phetioRepos.forEach( repo => {
  const validated = phetioReposValidated.includes( repo );
  const validatedParam = validated ? '&phetioValidateTandems' : '';

  tests.push( {
    test: [ repo, 'phet-io-fuzz', 'unbuilt' ],
    type: 'sim-test',
    url: `${repo}/${repo}_en.html`,
    queryParameters: 'brand=phet-io&phetioStandalone&ea' + validatedParam + '&fuzz&memoryLimit=1000'
  } );

  // fuzz test important wrappers
  tests.push( {
    test: [ repo, 'phet-io-studio-fuzz', 'unbuilt' ],
    type: 'wrapper-test',
    url: `studio/?sim=${repo}&phetioDebug&fuzz`,
    testQueryParameters: 'duration=60000'
  } );

  // only test state on phet-io sims that support it
  phetioNoState.indexOf( repo ) === -1 && tests.push( {
    test: [ repo, 'phet-io-state-fuzz', 'unbuilt' ],
    type: 'wrapper-test',
    url: `phet-io-wrappers/state/?sim=${repo}&phetioDebug&fuzz`,
    testQueryParameters: 'duration=60000'
  } );

  tests.push( {
    test: [ repo, 'phet-io-mirror-inputs-fuzz', 'unbuilt' ],
    type: 'wrapper-test',
    url: `phet-io-wrappers/mirror-inputs/?sim=${repo}&phetioDebug&fuzz`,
    testQueryParameters: 'duration=60000'
  } );
} );

// accessible tests
interactiveDescriptionRepos.forEach( repo => {
  tests.push( {
    test: [ repo, 'interactive-description-fuzz', 'unbuilt' ],
    type: 'sim-test',
    url: `${repo}/${repo}_en.html`,
    queryParameters: 'brand=phet&ea&fuzz&supportsDescriptions&memoryLimit=1000',
    testQueryParameters: 'duration=40000'
  } );

  tests.push( {
    test: [ repo, 'interactive-description-fuzzBoard', 'unbuilt' ],
    type: 'sim-test',
    url: `${repo}/${repo}_en.html`,
    queryParameters: 'brand=phet&ea&fuzzBoard&supportsDescriptions&memoryLimit=1000',
    testQueryParameters: 'duration=40000'
  } );

  tests.push( {
    test: [ repo, 'interactive-description-fuzz', 'built' ],
    type: 'sim-test',
    url: `${repo}/build/phet/${repo}_en_phet.html`,
    queryParameters: 'fuzz&supportsDescriptions&memoryLimit=1000',
    testQueryParameters: 'duration=40000',

    brand: 'phet',
    buildDependencies: [ repo ],
    es5: true
  } );

  tests.push( {
    test: [ repo, 'interactive-description-fuzzBoard', 'built' ],
    type: 'sim-test',
    url: `${repo}/build/phet/${repo}_en_phet.html`,
    queryParameters: 'fuzzBoard&supportsDescriptions&memoryLimit=1000',
    testQueryParameters: 'duration=40000',

    brand: 'phet',
    buildDependencies: [ repo ],
    es5: true
  } );
} );

// phet-io wrappers tests for each PhET-iO Sim
phetioRepos.forEach( repo => {
  [ false, true ].forEach( useAssert => {
    tests.push( {
      test: [ repo, 'phet-io-wrappers-tests', useAssert ? 'assert' : 'no-assert' ],
      type: 'qunit-test',
      url: 'phet-io-wrappers/phet-io-wrappers-tests.html?sim=' + repo + ( useAssert ? '&phetioDebug' : '' )
    } );
  } );
} );

// repo-specific Unit tests (unbuilt mode) from `grunt generate-test-harness`
unitTestRepos.forEach( repo => {
  // Skip phet-io-wrappers unit tests here, we run it with multiple repos above
  if ( repo === 'phet-io-wrappers' ) {
    return;
  }
  // All tests should work with no query parameters, with assertions enables and also in phet-io brand
  [ '', '?ea', '?brand=phet-io', '?ea&brand=phet-io' ].forEach( queryString => {
    if ( repo === 'phet-io' && !queryString.includes( 'phet-io' ) ) {
      return;
    }
    tests.push( {
      test: [ repo, 'top-level-unit-tests', 'unbuilt' + queryString ],
      type: 'qunit-test',
      url: repo + '/' + repo + '-tests.html' + queryString
    } );
  } );
} );

// Page-load tests (non-built)
[
  {
    repo: 'dot',
    urls: [
      '', // the root URL
      'tests/',
      'tests/playground.html'
    ]
  },
  {
    repo: 'kite',
    urls: [
      '', // the root URL
      'tests/playground.html',
      'tests/visual-shape-test.html'
    ]
  },
  {
    repo: 'scenery',
    urls: [
      '', // the root URL
      'tests/',
      'tests/playground.html',
      'tests/renderer-comparison.html?renderers=canvas,svg,dom',
      'tests/text-quality-test.html'
    ]
  }
].forEach( ( { repo, urls } ) => {
  urls.forEach( pageloadRelativeURL => {
    tests.push( {
      test: [ repo, 'pageload', '/' + pageloadRelativeURL ],
      type: 'pageload-test',
      url: repo + '/' + pageloadRelativeURL,
      priority: 4 // Fast to test, so test them more
    } );
  } );
} );

// Page-load tests (built)
[
  {
    repo: 'dot',
    urls: [
      'doc/',
      'examples/',
      'examples/convex-hull-2.html'
    ]
  },
  {
    repo: 'kite',
    urls: []
  },
  {
    repo: 'scenery',
    urls: [
      'doc/',
      'doc/a-tour-of-scenery.html',
      'doc/accessibility.html',
      'doc/implementation-notes.html',
      'doc/user-input.html',
      'examples/',
      'examples/cursors.html',
      'examples/hello-world.html',
      'examples/input-multiple-displays.html',
      'examples/input.html',
      'examples/mouse-wheel.html',
      'examples/multi-touch.html',
      'examples/nodes.html',
      'examples/shapes.html',
      'examples/sprites.html',
      // 'examples/webglnode.html', // currently disabled, since it fails without webgl
      'tests/text-bounds-comparison.html'
    ]
  }
].forEach( ( { repo, urls } ) => {
  urls.forEach( pageloadRelativeURL => {
    tests.push( {
      test: [ repo, 'pageload', '/' + pageloadRelativeURL ],
      type: 'pageload-test',
      url: repo + '/' + pageloadRelativeURL,
      priority: 5, // When these are built, it should be really quick to test

      brand: 'phet',
      buildDependencies: [ repo ],
      es5: true
    } );
  } );
} );

console.log( JSON.stringify( tests, null, 2 ) );
