// Copyright 2021, University of Colorado Boulder

const axios = require( 'axios' );
const perf_hooks = require( 'perf_hooks' );
const puppeteer = require( 'puppeteer' );


// TODO: reach out to jon RE: directional characters in strings

const parseScreenNamesFromSimulation = async ( project, page ) => {
  const t0 = perf_hooks.performance.now();
  const simulation = project.simulations[ 0 ];
  const simName = simulation.name;
  console.log( simName );
  const locales = Object.keys( simulation.localizedSimulations );
  for ( let localeIndex = 0; localeIndex < locales.length; localeIndex++ ) {
    const locale = locales[ localeIndex ];

    const s = `https://phet.colorado.edu/sims/html/${simName}/latest/${simName}_all.html?locale=${locale}`;
    await page.goto( s );
    await page.waitForFunction( 'phet' );
    await page.waitForFunction( 'phet.joist' );
    await page.waitForFunction( 'phet.joist.sim' );
    await page.waitForFunction( 'phet.joist.sim.screens' );
    const screenNames = await page.evaluate( () => {
      return phet.joist.sim.screens
        .map( screen => screen.name || ( screen.nameProperty && screen.nameProperty.value ) )
        .filter( ( screenName, screenIndex ) => !( screenIndex === 0 && screenName === '\u202aHome\u202c' ) );
    } );
    console.log( locale, screenNames );
  }
  const t1 = perf_hooks.performance.now();

  console.log( ( t1 - t0 ) / 1000 );
};

( async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const projects = ( await axios.get( 'https://phet.colorado.edu/services/metadata/1.3/simulations?format=json&type=html&summary&simulation=build-a-molecule' ) ).data.projects;

  for ( let projectIndex = 0; projectIndex < projects.length; projectIndex++ ) {
    await parseScreenNamesFromSimulation( projects[ projectIndex ], page );
  }
  await browser.close();
} )();