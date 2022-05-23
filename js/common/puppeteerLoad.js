// Copyright 2017, University of Colorado Boulder

/**
 * Uses puppeteer to see whether a page loads without an error
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const sleep = require( './sleep' );
const _ = require( 'lodash' ); // eslint-disable-line
const puppeteer = require( 'puppeteer' );
const winston = require( 'winston' );

/**
 * Uses puppeteer to see whether a page loads without an error
 * @public
 *
 * @param {string} url
 * @param {Object} [options]
 * @returns {Promise.<Error|null|*>} - Resolves with an error if available, or the eval result/null if successful
 */
module.exports = async function( url, options ) {

  options = _.extend( { // eslint-disable-line

    browser: null, // {puppeteer.Browser|null} - If provided, we'll use a persistent browser

    evaluate: null, // {function|null}

    waitAfterLoad: 5000, // milliseconds
    allowedTimeToLoad: 40000, // milliseconds
    puppeteerTimeout: 30000, // milliseconds

    // you really don't want to set this to false, this is for testing in https://github.com/phetsims/aqua/issues/144
    sandbox: true
  }, options );

  const launchOptions = options.sandbox ? {} : {
    args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
  };
  const hasBrowser = !!options.browser;
  const browser = hasBrowser ? options.browser : await puppeteer.launch( launchOptions );

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout( options.puppeteerTimeout );

  let resolve;
  let loaded = false;
  const promise = new Promise( ( res, rej ) => {
    resolve = res;
  } );

  page.on( 'load', async () => {
    loaded = true;
    await sleep( options.waitAfterLoad );
    resolve( options.evaluate && !page.isClosed() ? await page.evaluate( options.evaluate ) : null );
  } );
  page.on( 'error', msg => {
    winston.info( `puppeteer error: ${msg}` );
    resolve( new Error( msg ) );
  } );
  page.on( 'pageerror', msg => {
    winston.info( `puppeteer pageerror: ${msg}` );
    resolve( new Error( msg ) );
  } );
  ( async () => {
    await sleep( options.allowedTimeToLoad );
    if ( !loaded ) {
      winston.info( 'puppeteer not loaded' );
      resolve( new Error( `Did not load in ${options.allowedTimeToLoad}` ) );
    }
  } )();

  await page.goto( url, {
    timeout: options.puppeteerTimeout
  } );
  const result = await promise;
  await page.close();

  if ( hasBrowser ) {
    await browser.close();
  }

  return result;
};
