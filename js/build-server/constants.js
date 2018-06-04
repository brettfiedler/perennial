// Copyright 2017, University of Colorado Boulder

/**
 * Constants required for the build-server
 *
 * @author Matt Pennington
 */

/* eslint-env node */
'use strict';

const fs = require( 'graceful-fs' ); //eslint-disable-line
const getBuildServerConfig = require( './getBuildServerConfig' );

const BUILD_SERVER_CONFIG = getBuildServerConfig( fs );

module.exports = {
  BUILD_SERVER_CONFIG,
  LISTEN_PORT: 16371,
  HTML_SIMS_DIRECTORY: BUILD_SERVER_CONFIG.htmlSimsDirectory,
  PHETIO_SIMS_DIRECTORY: BUILD_SERVER_CONFIG.phetioSimsDirectory,
  PHETIO_AUTH_FILEPATH: BUILD_SERVER_CONFIG.phetioAuthFilepath || '/data/web/htdocs/dev/.htaccess',
  REPOS_KEY: 'repos',
  DEPENDENCIES_KEY: 'dependencies',
  LOCALES_KEY: 'locales',
  API_KEY: 'api',
  SIM_NAME_KEY: 'simName',
  VERSION_KEY: 'version',
  OPTION_KEY: 'option',
  EMAIL_KEY: 'email',
  USER_ID_KEY: 'userId',
  TRANSLATOR_ID_KEY: 'translatorId',
  AUTHORIZATION_KEY: 'authorizationCode',
  SERVERS_KEY: 'servers',
  BRANDS_KEY: 'brands',
  PRODUCTION_SERVER: 'production',
  DEV_SERVER: 'dev',
  PHET_BRAND: 'phet',
  PHET_IO_BRAND: 'phet-io',
  ENGLISH_LOCALE: 'en',
  PERENNIAL: '.'
};