// Copyright 2017, University of Colorado Boulder

/**
 * Clones the given repo name into the working copy
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const execute = require( '../dual/execute' );
const winston = require( 'winston' );

/**
 * Clones the given repo name into the working copy
 * @public
 *
 * @param {string} repo - The repository name
 * @returns {Promise}
 */
module.exports = function( repo ) {
  winston.info( `cloning ${repo}` );

  if ( repo === 'annual' ) {
    return execute( 'git', [ 'clone', 'https://github.com/phetsims/perennial.git', 'annual' ], '../' );
  }
  else {
    return execute( 'git', [ 'clone', `https://github.com/phetsims/${repo}.git` ], '../' );
  }
};
