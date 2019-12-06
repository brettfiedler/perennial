// Copyright 2017, University of Colorado Boulder

/**
 * Generates the lists under perennial/data/, and if there were changes, will commit and push.
 *
 * Ideally, run from bayes.colorado.edu under the phet-admin user from /data/share/phet/generate-data/perennial:
 * # pm2 start grunt --name "generate-data" -- generate-data
 *
 * The task will show up in output of `pm2 list` as "generate-data"
 *
 * See https://github.com/phetsims/perennial/issues/66
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

// modules
const assert = require( 'assert' );
const execute = require( '../common/execute' );
const fs = require( 'fs' );
const getActiveRepos = require( '../common/getActiveRepos' );
const getBranch = require( '../common/getBranch' );
const gitAdd = require( '../common/gitAdd' );
const gitCommit = require( '../common/gitCommit' );
const gitIsClean = require( '../common/gitIsClean' );
const gitPull = require( '../common/gitPull' );
const gitPush = require( '../common/gitPush' );
const grunt = require( 'grunt' );
const os = require( 'os' );
const winston = require( 'winston' );

/**
 * Generates the lists under perennial/data/, and if there were changes, will commit and push.
 * @public
 */
module.exports = async function() {
  if ( await getBranch( 'perennial' ) !== 'master' || !await gitIsClean( 'perennial' ) ) {
    grunt.fail.fatal( 'Data will only be generated if perennial is on master with no working-copy changes.' );
  }

  // Make sure we get an up-to-date list of repos
  await gitPull( 'perennial' );

  // Make sure node packages are up to date
  await execute( 'npm', [ 'update' ] );

  // Make sure to clone anything we are missing
  await execute( 'bash', [ 'perennial/bin/clone-missing-repos.sh' ], '..' );

  const activeRepos = getActiveRepos();

  for ( const repo of activeRepos ) {
    await gitPull( repo );
  }

  function writeList( name, packageFilter ) {
    const repos = activeRepos.filter( repo => {
      // Make sure that if someone doesn't have all repositories checked out that this will FAIL. Otherwise bad things.
      assert( grunt.file.exists( `../${repo}` ) );

      let packageObject;
      try {
        packageObject = JSON.parse( fs.readFileSync( `../${repo}/package.json`, 'utf8' ) );
      }
      catch( e ) {
        return false;
      }
      return packageObject.phet && packageFilter( packageObject.phet );
    } );

    grunt.log.writeln( `Writing to data/${name}` );
    fs.writeFileSync( `data/${name}`, repos.join( os.EOL ) + os.EOL );
  }

  writeList( 'accessibility', phet => phet.accessible );
  writeList( 'active-runnables', phet => phet.runnable );
  writeList( 'active-sims', phet => phet.simulation );
  writeList( 'unit-tests', phet => phet.generatedUnitTests );
  writeList( 'color-profiles', phet => phet.colorProfile );
  writeList( 'phet-io', phet => phet.runnable && phet.supportedBrands && phet.supportedBrands.includes( 'phet-io' ) );
  writeList( 'testable-runnables', phet => phet.runnable && phet.automatedTestEnabled !== false );
  writeList( 'testable-phet-io', phet => phet.runnable && phet.supportedBrands && phet.supportedBrands.includes( 'phet-io' ) && phet.automatedTestEnabled !== false );

  await gitAdd( 'perennial', 'data/accessibility' );
  await gitAdd( 'perennial', 'data/active-runnables' );
  await gitAdd( 'perennial', 'data/active-sims' );
  await gitAdd( 'perennial', 'data/unit-tests' );
  await gitAdd( 'perennial', 'data/color-profiles' );
  await gitAdd( 'perennial', 'data/phet-io' );
  await gitAdd( 'perennial', 'data/testable-runnables' );
  await gitAdd( 'perennial', 'data/testable-phet-io' );

  const hasChanges = !await gitIsClean( 'perennial' );
  if ( hasChanges ) {
    winston.info( 'Changes to data files detected, will push' );
    await gitCommit( 'perennial', 'Automated update of perennial data files' );
    await gitPush( 'perennial', 'master' );
  }
  else {
    winston.info( 'No changes detected' );
  }
};
