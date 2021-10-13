// Copyright 2020, University of Colorado Boulder

const execute = require( '../common/execute' );
const gitCheckout = require( '../common/gitCheckout' );
const gitPull = require( '../common/gitPull' );
const constants = require( './constants' );
const fs = require( 'fs' );
const axios = require( 'axios' );
const checkoutMasterAll = require( '../grunt/checkoutMasterAll.js' );

const chipperDir = '../chipper';
const perennialAliasDir = '../perennial-alias';

const processSim = async ( simulation, brands, version ) => {

  const repoDir = `../${simulation}`;

  // Get master
  await execute( 'grunt', [ 'checkout-master-all' ], './' );
  await gitPull( simulation );

  let brandsArray;
  let brandsString;
  if ( brands ) {
    if ( brands.split ) {
      brandsArray = brands.split( ',' );
      brandsString = brands;
    }
    else {
      brandsArray = brands;
      brandsString = brands.join( ',' );
    }
  }
  else {
    brandsString = 'phet';
    brandsArray = [ brandsString ];
  }

  // Build screenshots
  await execute( 'grunt', [ `--brands=${brandsString}`, `--repo=${simulation}`, 'build-images' ], chipperDir );

  // Copy into the document root
  for ( const brand of brandsArray ) {
    if ( brand !== 'phet' ) {
      console.log( `Skipping images for unsupported brand: ${brand}` );
    }
    else {
      const sourceDir = `${repoDir}/build/${brand}/`;
      const targetDir = `${constants.HTML_SIMS_DIRECTORY}${simulation}/${version}/`;
      const files = fs.readdirSync( sourceDir );
      for ( const file of files ) {
        if ( file.endsWith( 'png' ) ) {
          console.log( `copying file ${file}` );
          await execute( 'cp', [ `${sourceDir}${file}`, `${targetDir}${file}` ], '.' );
        }
      }

      console.log( `Done copying files for ${simulation}` );
    }
  }
};
/**
 * This task deploys all image assets from the master branch to the latest version of all published sims.
 *
 * @param options
 */
const deployImages = async options => {
  console.log( `deploying images with branch ${options.branch}, brands ${options.brands}` );
  if ( options.branch ) {
    await gitCheckout( 'chipper', options.branch );
    await gitPull( 'chipper' );
    await execute( 'npm', [ 'prune' ], chipperDir );
    await execute( 'npm', [ 'update' ], chipperDir );

    await gitCheckout( 'perennial-alias', options.branch );
    await gitPull( 'perennial-alias' );
    await execute( 'npm', [ 'prune' ], perennialAliasDir );
    await execute( 'npm', [ 'update' ], perennialAliasDir );
  }

  if ( options.simulation && options.version ) {
    await processSim( options.simulation, options.brands, options.version );
  }
  else {

    // Get all published sims
    let response;
    try {
      response = await axios( 'https://phet.colorado.edu/services/metadata/1.2/simulations?format=json&summary&locale=en&type=html' );
    }
    catch( e ) {
      throw new Error( e );
    }
    if ( response.status < 200 || response.status > 299 ) {
      throw new Error( `Bad Status while fetching metadata: ${response.status}` );
    }
    else {
      let projects;
      try {
        projects = response.data.projects;
      }
      catch( e ) {
        throw new Error( e );
      }

      // Use for index loop to allow async/await
      for ( const project of projects ) {
        for ( const simulation of project.simulations ) {
          await processSim( simulation.name, options.brands, project.version.string );
        }
      }
    }
  }
};

module.exports = deployImages;
