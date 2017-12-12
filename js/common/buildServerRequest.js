// Copyright 2017, University of Colorado Boulder

/**
 * Sends a request to the build server.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
/* eslint-env node */
'use strict';

// modules
const assert = require( 'assert' );
const buildLocal = require( '../common/buildLocal' );
const request = require( 'request' );
const winston = require( 'winston' );

/**
 * Sends a request to the build server.
 * @public
 *
 * @param {string} repo
 * @param {SimVersion} version
 * @param {Object} dependencies - Dependencies object, use getDependencies?
 * @param {Object} [options]
 * @returns {Promise}
 */
module.exports = async function( repo, version, dependencies, options ) {
  return new Promise( ( resolve, reject ) => {

    const {
      locales = '*',
      brands = [ 'phet', 'phet-io' ],
      servers = [ 'dev' ] // {Array.<string>}, currently 'dev' and 'production' are supported
    } = options || {};

    winston.info( `sending build request for ${repo} ${version.toString()} with dependencies: ${JSON.stringify( dependencies )}` );

    servers.forEach( server => assert( [ 'dev', 'production' ].includes( server ), `Unknown server: ${server}` ) );

    const requestObject = {
      api: '2.0',
      dependencies: JSON.stringify( dependencies ),
      simName: repo,
      version: version.toString(),
      locales,
      servers,
      brands,
      authorizationCode: buildLocal.buildServerAuthorizationCode
    };
    if ( buildLocal.buildServerNotifyEmail ) {
      requestObject.email = buildLocal.buildServerNotifyEmail;
    }

    const url = `${buildLocal.productionServerURL}/deploy-html-simulation`;

    request.post( { url: url, json: requestObject }, function( error, response, body ) {
      if ( error ) {
        reject( `Build request failed with error ${error}.` );
      }
      else if ( response.statusCode !== 200 ) {
        reject( `Build request failed with status code ${response.statusCode}.` );
      }
      else {
        winston.info( 'Build request sent successfully' );
        resolve();
      }
    } );

    winston.info( `request sent: ${url}` );
  } );
};