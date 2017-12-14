// Copyright 2017, University of Colorado Boulder

/* eslint-env node */
'use strict';

const fs = require( 'fs.extra' ); // eslint-disable-line
const winston = require( 'winston' );

const addToRosetta = require( './addToRosetta' );
const addTranslator = require( './addTranslator' );
const constants = require( './constants' );
const createTranslationsXML = require( './createTranslationsXML' );
const devDeploy = require( './devDeploy' );
const getLocales = require( './getLocales' );
const mkVersionDir = require( './mkVersionDir' );
const notifyServer = require( './notifyServer' );
const pullMaster = require( './pullMaster' );
const writePhetHtaccess = require( './writePhetHtaccess' );
const writePhetioHtaccess = require( './writePhetioHtaccess' );

const execute = require( '../common/execute' );

/**
 * taskQueue ensures that only one build/deploy process will be happening at the same time.  The main build/deploy logic is here.
 *
 * @param {Object} task
 * @property {JSON} task.repos
 * @property {String} task.locales - comma separated list of locale codes
 * @property {String} task.simName - lower case simulation name used for creating files/directories
 * @property {String} task.version - sim version identifier string
 * @property {String} task.servers - deployment targets, subset of [ 'dev', 'production' ]
 * @property {String} task.brands - deployment brands
 * @property {String} task.email - used for sending notifications about success/failure
 * @property {String} task.translatorId - rosetta user id for adding translators to the website
 * @property {String} task.res - express response object
 * @property {winston} task.winston - logger
 *
 * @param {Function} taskCallback - called when build is finished or aborted
 */
module.exports = async function( task, taskCallback ) {

  //-------------------------------------------------------------------------------------
  // Parse and validate parameters
  //-------------------------------------------------------------------------------------

  const repos = task.repos;
  const locales = task.locales;
  const simName = task.simName;
  let version = task.version;
  const res = task.res;
  const email = task.email;
  const brands = task.brands;
  const servers = task.servers;

  const userId = task.translatorId;
  if ( userId ) {
    winston.log( 'info', 'setting userId = ' + userId );
  }


  //-----------------------------------------------------------------------------------------
  // Define helper functions for use in this function
  //-----------------------------------------------------------------------------------------

  /**
   * Execute a step of the build process. The build aborts if any step fails.
   *
   * @param command the command to be executed
   * @param dir the directory to execute the command from
   */
  const execWithAbort = async function( command, dir ) {
    winston.log( 'info', 'running command: ' + command );
    try {
      await execute( command, [], dir );
    }
    catch( err ) {
      if ( command === 'grunt checkout-master-all' ) {
        taskCallback( 'error running command ' + command + ': ' + err.stdout );
        Promise.reject( 'Build aborted' );
      }
      else {
        return abortBuild( err );
      }
    }
  };

  /**
   * checkout master everywhere and abort build with err
   * @param err
   */
  const abortBuild = async function( err ) {
    winston.log( 'error', 'BUILD ABORTED! ' + err );
    winston.log( 'info', 'build aborted: checking out master for every repo in case build shas are still checked out' );
    await execute( 'grunt checkout-master-all', [], constants.PERENNIAL );
    taskCallback( err );
    return Promise.reject( err );
  };

  const simNameRegex = /^[a-z-]+$/;

  // make sure the repos passed in validates
  for ( let i in repos ) {
    if ( repos.hasOwnProperty( i ) ) {
      winston.log( 'info', 'Validating repo: ' + i + ', key: ' + key );

      // make sure all keys in repos object are valid sim names
      if ( !simNameRegex.test( key ) ) {
        return abortBuild( 'invalid simName in repos: ' + simName );
      }

      const value = repos[ key ];
      if ( key === 'comment' ) {
        if ( typeof value !== 'string' ) {
          return abortBuild( 'invalid comment in repos: should be a string' );
        }
      }
      else if ( value instanceof Object && value.hasOwnProperty( 'sha' ) ) {
        if ( !/^[a-f0-9]{40}$/.test( value.sha ) ) {
          return abortBuild( 'invalid sha in repos. key: ' + key + ' value: ' + value + ' sha: ' + value.sha );
        }
      }
      else {
        return abortBuild( 'invalid item in repos. key: ' + key + ' value: ' + value );
      }
    }
  }

  // validate simName
  if ( !simNameRegex.test( simName ) ) {
    return abortBuild( 'invalid simName ' + simName );
  }

  // Infer brand from version string and keep unstripped version for phet-io
  const originalVersion = version;

  // validate version and strip suffixes since just the numbers are used in the directory name on dev and production servers
  const versionMatch = version.match( /^(\d+\.\d+\.\d+)(?:-.*)?$/ );
  if ( versionMatch && versionMatch.length === 2 ) {

    // TODO: make sure we are handling this correctly for https://github.com/phetsims/chipper/issues/560
    if ( option === 'rc' ) {
      // if deploying an rc version use the -rc.[number] suffix
      version = versionMatch[ 0 ];
    }
    else {
      // otherwise strip any suffix
      version = versionMatch[ 1 ];
    }
    winston.log( 'info', 'detecting version number: ' + version );
  }
  else {
    return abortBuild( 'invalid version number: ' + version );
  }

  // define vars for build dir and sim dir
  const buildDir = './js/build-server/tmp';
  const simDir = '../' + simName;

  winston.log( 'info', 'building sim ' + simName );


  //-------------------------------------------------------------------------------------
  // Define other helper functions used in build process
  //-------------------------------------------------------------------------------------


  /**
   * Clean up after deploy. Checkout master for every repo and remove tmp dir.
   */
  const afterDeploy = async function() {
    await execWithAbort( 'grunt checkout-master-all', constants.PERENNIAL );
    await execWithAbort( 'rm -rf ' + buildDir, '.' );
    taskCallback();
  };

  try {
    fs.mkdirSync( buildDir );
    fs.writeFileSync( buildDir + '/dependencies.json', JSON.stringify( repos ) );
  }
  catch( err ) {
    return abortBuild( err );
  }
  winston.log( 'info', 'wrote file ' + buildDir + '/dependencies.json' );

  await execWithAbort( 'git pull', constants.PERENNIAL );
  await execWithAbort( 'npm prune', constants.PERENNIAL );
  await execWithAbort( 'npm update', constants.PERENNIAL );
  await execWithAbort( './chipper/bin/clone-missing-repos.sh', '..' );
  try {
    await pullMaster( repos );
  }
  catch( e ) {
    return abortBuild( e );
  }
  await execWithAbort( 'grunt checkout-shas --buildServer=true --repo=' + simName, constants.PERENNIAL );
  await execWithAbort( 'git checkout ' + repos[ simName ].sha, simDir );
  await execWithAbort( 'npm prune', '../chipper' );
  await execWithAbort( 'npm update', '../chipper' );
  await execWithAbort( 'npm prune', simDir );
  await execWithAbort( 'npm update', simDir );
  try {
    await getLocales( locales, simName );
  }
  catch( e ) {
    return abortBuild( e );
  }

  const brandLocales = ( brands.indexOf( constants.PHET_BRAND ) >= 0 ) ? locales : 'en';
  winston.log( 'info', 'building for brands: ' + brands + ' version: ' + version );

  await execWithAbort( 'grunt build-for-server --allHTML --brands=' + brands.join( ',' ) + ' --locales=' + brandLocales, simDir );

  if ( servers.indexOf( constants.DEV_SERVER ) >= 0 ) {
    if ( brands.indexOf( constants.PHET_BRAND ) >= 0 ) {
      await devDeploy( simDir, simName, version, brands );
    }
    else if ( brands.indexOf( constants.PHET_IO_BRAND ) >= 0 ) {
      await writePhetioHtaccess( simDir + '/build/.htaccess', '/htdocs/physics/phet-io/config/.htpasswd' );
      await devDeploy( simDir, simName, version, brands );
    }
  }

  if ( servers.indexOf( constants.PRODUCTION_SERVER ) >= 0 ) {
    let targetDir;
    // TODO: loop over brands
    if ( brands.indexOf( constants.PHET_BRAND ) >= 0 ) {
      targetDir = constants.HTML_SIMS_DIRECTORY + simName + '/' + version + '/';
    }
    else if ( brands.indexOf( constants.PHET_IO_BRAND ) >= 0 ) {
      targetDir = constants.PHETIO_SIMS_DIRECTORY + simName + '/' + originalVersion + '/';
    }
    await mkVersionDir( targetDir );
    // TODO: rewrite names if phet brand
    await execWithAbort( 'cp -r build/* ' + targetDir, simDir );
    if ( brands.indexOf( constants.PHET_BRAND ) >= 0 ) {
      await writePhetHtaccess( simName, version );
      let simTitle = await createTranslationsXML( simName, winston );
      await notifyServer( simName, email );
      await addToRosetta( simTitle, simName, email );

      // if this build request comes from rosetta it will have a userId field and only one locale
      const localesArray = locales.split( ',' );
      if ( userId && localesArray.length === 1 && localesArray[ 0 ] !== '*' ) {
        await addTranslator( localesArray[ 0 ], afterDeploy );
      }
    }
    else {
      await writePhetioHtaccess( constants.PHETIO_SIMS_DIRECTORY + simName + '/' + originalVersion + '/wrappers/.htaccess', '/etc/httpd/conf/phet-io_pw' );
    }
  }

  res.send( 'build process initiated, check logs for details' );
  return afterDeploy();
};