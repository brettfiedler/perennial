// Copyright 2018, University of Colorado Boulder

/**
 * The main persistent state-bearing object for maintenance releases. Can be loaded from or saved to a dedicated file.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

/* eslint-env browser, node */
'use strict';

const assert = require( 'assert' );
const build = require( './build' );
const checkoutMaster = require( './checkoutMaster' );
const checkoutTarget = require( './checkoutTarget' );
const execute = require( './execute' );
const fs = require( 'fs' );
const getBranches = require( './getBranches' );
const getDependencies = require( './getDependencies' );
const gitCheckout = require( './gitCheckout' );
const gitCherryPick = require( './gitCherryPick' );
const gitCreateBranch = require( './gitCreateBranch' );
const gitPull = require( './gitPull' );
const gitPush = require( './gitPush' );
const gitRevParse = require( './gitRevParse' );
const ModifiedBranch = require( './ModifiedBranch' );
const npmUpdate = require( './npmUpdate' );
const Patch = require( './Patch' );
const production = require( '../grunt/production' );
const rc = require( '../grunt/rc' );
const ReleaseBranch = require( './ReleaseBranch' );
const updateDependenciesJSON = require( './updateDependenciesJSON' );
// const winston = require( 'winston' );

const MAINTENANCE_FILE = '.maintenance.json';

module.exports = ( function() {

  class Maintenance {
    /**
     * @public
     * @constructor
     *
     * @param {Array.<Patch>} [patches]
     * @param {Array.<ModifiedBranch>} [modifiedBranches]
     */
    constructor( patches = [], modifiedBranches = [] ) {
      assert( Array.isArray( patches ) );
      patches.forEach( patch => assert( patch instanceof Patch ) );
      assert( Array.isArray( modifiedBranches ) );
      modifiedBranches.forEach( branch => assert( branch instanceof ModifiedBranch ) );

      // @public {Array.<Patch>}
      this.patches = patches;

      // @public {Array.<ModifiedBranch>}
      this.modifiedBranches = modifiedBranches;
    }

    /**
     * Convert into a plain JS object meant for JSON serialization.
     * @public
     *
     * @returns {Object}
     */
    serialize() {
      return {
        patches: this.patches.map( patch => patch.serialize() ),
        modifiedBranches: this.modifiedBranches.map( modifiedBranch => modifiedBranch.serialize() )
      };
    }

    /**
     * Takes a serialized form of the Maintenance and returns an actual instance.
     * @public
     *
     * @param {Object}
     * @returns {Maintenance}
     */
    static deserialize( { patches, modifiedBranches } ) {
      // Pass in patch references to branch deserialization
      const deserializedPatches = patches.map( Patch.deserialize );
      return new Maintenance( deserializedPatches, modifiedBranches.map( modifiedBranch => ModifiedBranch.deserialize( modifiedBranch, deserializedPatches ) ) );
    }

    /**
     * Saves the state of this object into the maintenance file.
     * @public
     */
    save() {
      return fs.writeFileSync( MAINTENANCE_FILE, JSON.stringify( this.serialize(), null, 2 ) );
    }

    /**
     * Loads a new Maintenance object (if possible) from the maintenance file.
     * @public
     *
     * @returns {Maintenance}
     */
    static load() {
      if ( fs.existsSync( MAINTENANCE_FILE ) ) {
        return Maintenance.deserialize( JSON.parse( fs.readFileSync( MAINTENANCE_FILE, 'utf8' ) ) );
      }
      else {
        return new Maintenance();
      }
    }

    /**
     * Resets all state.
     * @public
     */
    static reset() {
      new Maintenance().save();
    }



    /**
     * Looks up a patch by its repository.
     * @public
     *
     * @param {string} repo
     * @returns {Patch}
     */
    findPatch( repo ) {
      const patch = this.patches.find( p => p.repo === repo );
      assert( patch, `Patch not found for ${repo}` );

      return patch;
    }

    /**
     * Looks up (or adds) a ModifiedBranch by its identifying information.
     * @public
     *
     * @param {string} repo
     * @param {string} branch
     * @param {boolean} [errorIfMissing]
     * @returns {Promise.<ModifiedBranch>}
     */
    async ensureModifiedBranch( repo, branch, errorIfMissing = false ) {
      let modifiedBranch = this.modifiedBranches.find( modifiedBranch => modifiedBranch.repo === repo && modifiedBranch.branch === branch );

      if ( !modifiedBranch ) {
        if ( errorIfMissing ) {
          throw new Error( `Could not find a tracked modified branch for ${repo} ${branch}` );
        }
        const releaseBranches = await ReleaseBranch.getMaintenanceBranches();
        const releaseBranch = releaseBranches.find( release => release.repo === repo && release.branch === branch );
        assert( releaseBranch, `Could not find a release branch for repo=${repo} branch=${branch}` );

        modifiedBranch = new ModifiedBranch( releaseBranch );

        // If we are creating it, add it to our list.
        this.modifiedBranches.push( modifiedBranch );
      }

      return modifiedBranch;
    }

    /**
     * Attempts to remove a modified branch (if it doesn't need to be kept around).
     * @public
     *
     * @param {ModifiedBranch} modifiedBranch
     */
    tryRemovingModifiedBranch( modifiedBranch ) {
      if ( modifiedBranch.isUnused ) {
        const index = this.branches.indexOf( modifiedBranch );
        assert( index >= 0 );

        this.branches.splice( index, 1 );
      }
    }




    /**
     * Runs a number of checks through every release branch.
     * @public
     *
     * @returns {Promise}
     */
    static async checkBranchStatus() {
      const releaseBranches = await ReleaseBranch.getMaintenanceBranches();

      for ( let releaseBranch of releaseBranches ) {
        console.log( `Checking ${releaseBranch.repo} ${releaseBranch.branch}` );
        ( await releaseBranch.getStatus() ).forEach( console.log );
      }
    }

    /**
     * Displays a listing of the current maintenance status.
     * @public
     *
     * @returns {Promise}
     */
    static async list() {
      console.log( 'Maintenance Status' );

      const maintenance = Maintenance.load();

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        console.log( `${modifiedBranch.repo} ${modifiedBranch.branch} ${modifiedBranch.brands.join( ',' )}` );
        if ( modifiedBranch.deployedVersion ) {
          console.log( `  deployed: ${modifiedBranch.deployedVersion.toString()}` );
        }
        if ( modifiedBranch.neededPatches.length ) {
          console.log( `  needs: ${modifiedBranch.neededPatches.map( patch => patch.repo ).join( ',' )}` );
        }
        if ( modifiedBranch.messages.length ) {
          console.log( `  messages: ${modifiedBranch.messages.join( ' and ' )}` );
        }
        if ( Object.keys( modifiedBranch.changedDependencies ).length > 0 ) {
          console.log( '  deps:' );
          for ( let key of Object.keys( modifiedBranch.changedDependencies ) ) {
            console.log( `    ${key}: ${modifiedBranch.changedDependencies[ key ]}` );
          }
        }
      }

      for ( let patch of maintenance.patches ) {
        console.log( `[${patch.repo}] ${patch.message}` );
        for ( let sha of patch.shas ) {
          console.log( `  ${sha}` );
        }
        for ( let modifiedBranch of maintenance.modifiedBranches ) {
          if ( modifiedBranch.neededPatches.includes( patch ) ) {
            console.log( `    ${modifiedBranch.repo} ${modifiedBranch.branch} ${modifiedBranch.brands.join( ',' )}` );
          }
        }
      }
    }

    static async linkList() {
      const maintenance = Maintenance.load();

      const deployedBranches = maintenance.modifiedBranches.filter( modifiedBranch => !!modifiedBranch.deployedVersion );
      const productionBranches = deployedBranches.filter( modifiedBranch => modifiedBranch.deployedVersion.testType === null );
      const releaseCandidateBranches = deployedBranches.filter( modifiedBranch => modifiedBranch.deployedVersion.testType === 'rc' );

      if ( productionBranches.length ) {
        console.log( '\nProduction links\n' );

        for ( let modifiedBranch of productionBranches ) {
          const links = await modifiedBranch.getDeployedLinkLines();
          links.forEach( console.log );
        }
      }

      if ( releaseCandidateBranches.length ) {
        console.log( '\nRelease Candidate links\n' );

        for ( let modifiedBranch of releaseCandidateBranches ) {
          const links = await modifiedBranch.getDeployedLinkLines();
          for ( let link of links ) {
            console.log( link );
          }
        }
      }
    }

    /**
     * Creates a patch
     * @public
     *
     * @param {string} repo
     * @param {string} message
     * @returns {Promise}
     */
    static async createPatch( repo, message ) {
      const maintenance = Maintenance.load();

      for ( let patch of maintenance.patches ) {
        if ( patch.repo === repo ) {
          throw new Error( 'Multiple patches with the same repo are not concurrently supported' );
        }
      }

      maintenance.patches.push( new Patch( repo, message ) );

      maintenance.save();

      console.log( `Created patch for ${repo} with message: ${message}` );
    }

    /**
     * Removes a patch
     * @public
     *
     * @param {string} repo
     * @returns {Promise}
     */
    static async removePatch( repo ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( repo );

      for ( let branch of maintenance.modifiedBranches ) {
        if ( branch.neededPatches.includes( patch ) ) {
          throw new Error( 'Patch is marked as needed by at least one branch' );
        }
      }

      maintenance.patches.splice( maintenance.patches.indexOf( patch ), 1 );

      maintenance.save();

      console.log( `Removed patch for ${repo}` );
    }

    /**
     * Adds a particular SHA (to cherry-pick) to a patch.
     * @public
     *
     * @param {string} repo
     * @param {string} sha
     * @returns {Promise}
     */
    static async addPatchSHA( repo, sha ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( repo );

      patch.shas.push( sha );

      maintenance.save();

      console.log( `Added SHA ${sha} to patch ${repo}` );
    }

    /**
     * Removes a particular SHA (to cherry-pick) from a patch.
     * @public
     *
     * @param {string} repo
     * @param {string} sha
     * @returns {Promise}
     */
    static async removePatchSHA( repo, sha ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( repo );

      const index = patch.shas.indexOf( sha );
      assert( index >= 0, 'SHA not found' );

      patch.shas.splice( index, 1 );

      maintenance.save();

      console.log( `Removed SHA ${sha} from patch ${repo}` );
    }

    /**
     * Adds a needed patch to a given modified branch.
     * @public
     *
     * @param {string} repo
     * @param {string} branch
     * @param {string} patchRepo
     */
    static async addNeededPatch( repo, branch, patchRepo ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( patchRepo );

      const modifiedBranch = await maintenance.ensureModifiedBranch( repo, branch );
      modifiedBranch.neededPatches.push( patch );

      maintenance.save();

      console.log( `Added patch ${patchRepo} as needed for ${repo} ${branch}` );
    }

    /**
     * Adds a needed patch to whatever subset of release branches match the filter.
     * @public
     *
     * @param {string} patchRepo
     * @param {function} filter - function( ReleaseBranch ): Promise.<boolean>
     */
    static async addNeededPatches( patchRepo, filter ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( patchRepo );
      const releaseBranches = await ReleaseBranch.getMaintenanceBranches();

      for ( let releaseBranch of releaseBranches ) {
        const needsPatch = await filter( releaseBranch );

        if ( !needsPatch ) {
          console.log( `  skipping ${releaseBranch.repo} ${releaseBranch.branch}` );
          continue;
        }

        const modifiedBranch = await maintenance.ensureModifiedBranch( releaseBranch.repo, releaseBranch.branch );
        if ( !modifiedBranch.neededPatches.includes( patch ) ) {
          modifiedBranch.neededPatches.push( patch );
          console.log( `Added needed patch ${patchRepo} to ${releaseBranch.repo} ${releaseBranch.branch}` );
        }
        else {
          console.log( `Patch ${patchRepo} already included in ${releaseBranch.repo} ${releaseBranch.branch}` );
        }
      }

      maintenance.save();
    }

    /**
     * Adds a needed patch to all release branches.
     * @public
     *
     * @param {string} patchRepo
     */
    static async addAllNeededPatches( patchRepo ) {
      Maintenance.addNeededPatches( patchRepo, async () => true );
    }

    /**
     * Adds a needed patch to all release branches that do NOT include the given commit on the repo
     * @public
     *
     * @param {string} patchRepo
     * @param {string} sha
     */
    static async addNeededPatchesBefore( patchRepo, sha ) {
      Maintenance.addNeededPatches( patchRepo, async ( releaseBranch ) => {
        return await releaseBranch.missingSHA( patchRepo, sha );
      } );
    }

    /**
     * Adds a needed patch to all release branches that DO include the given commit on the repo
     * @public
     *
     * @param {string} patchRepo
     * @param {string} sha
     */
    static async addNeededPatchesAfter( patchRepo, sha ) {
      Maintenance.addNeededPatches( patchRepo, async ( releaseBranch ) => {
        return await releaseBranch.includesSHA( patchRepo, sha );
      } );
    }

    /**
     * Removes a needed patch from a given modified branch.
     * @public
     *
     * @param {string} repo
     * @param {string} branch
     * @param {string} patchRepo
     */
    static async removeNeededPatch( repo, branch, patchRepo ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( patchRepo );

      const modifiedBranch = await maintenance.ensureModifiedBranch( repo, branch );
      const index = modifiedBranch.neededPatches.indexOf( patch );
      assert( index >= 0, 'Could not find needed patch on the modified branch' );

      modifiedBranch.neededPatches.splice( index, 1 );
      maintenance.tryRemovingModifiedBranch( modifiedBranch );

      maintenance.save();

      console.log( `Removed patch ${patchRepo} from ${repo} ${branch}` );
    }

    /**
     * Removes a needed patch from whatever subset of (current) release branches match the filter.
     * @public
     *
     * @param {string} patchRepo
     * @param {function} filter - function( ReleaseBranch ): Promise.<boolean>
     */
    static async removeNeededPatches( patchRepo, filter ) {
      const maintenance = Maintenance.load();

      const patch = maintenance.findPatch( patchRepo );

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        const needsRemoval = filter( modifiedBranch.releaseBranch );

        if ( !needsRemoval ) {
          console.log( `  skipping ${modifiedBranch.repo} ${modifiedBranch.branch}` );
          continue;
        }

        const index = modifiedBranch.neededPatches.indexOf( patch );
        assert( index >= 0, 'Could not find needed patch on the modified branch' );

        modifiedBranch.neededPatches.splice( index, 1 );
        maintenance.tryRemovingModifiedBranch( modifiedBranch );

        console.log( `Removed needed patch ${patchRepo} from ${modifiedBranch.repo} ${modifiedBranch.branch}` );
      }

      maintenance.save();
    }

    /**
     * Removes a needed patch from all release branches that do NOT include the given commit on the repo
     * @public
     *
     * @param {string} patchRepo
     * @param {string} sha
     */
    static async removeNeededPatchesBefore( patchRepo, sha ) {
      Maintenance.removeNeededPatches( patchRepo, async ( releaseBranch ) => {
        return await releaseBranch.missingSHA( patchRepo, sha );
      } );
    }

    /**
     * Removes a needed patch from all release branches that DO include the given commit on the repo
     * @public
     *
     * @param {string} patchRepo
     * @param {string} sha
     */
    static async removeNeededPatchesAfter( patchRepo, sha ) {
      Maintenance.removeNeededPatches( patchRepo, async ( releaseBranch ) => {
        return await releaseBranch.includesSHA( patchRepo, sha );
      } );
    }

    static async checkoutBranch( repo, branch ) {
      const maintenance = Maintenance.load();

      const modifiedBranch = await maintenance.ensureModifiedBranch( repo, branch, true );
      await modifiedBranch.checkout();

      // No need to save, shouldn't be changing things
      console.log( `Checked out ${repo} ${branch}` );
    }

    static async applyPatches() {
      const maintenance = Maintenance.load();
      let numApplied = 0;

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        if ( modifiedBranch.neededPatches.length === 0 ) {
          continue;
        }

        const repo = modifiedBranch.repo;
        const branch = modifiedBranch.branch;

        // Defensive copy, since we modify it during iteration
        for ( let patch of modifiedBranch.neededPatches.slice() ) {
          if ( patch.shas.length === 0 ) {
            continue;
          }

          const patchRepo = patch.repo;

          try {
            // Checkout whatever the latest patched SHA is (if we've patched it)
            if ( modifiedBranch.changedDependencies[ patchRepo ] ) {
              await gitCheckout( patchRepo, modifiedBranch.changedDependencies[ patchRepo ] );
            }
            else {
              // Look up the SHA to check out
              await gitCheckout( repo, branch );
              const dependencies = await getDependencies( repo );
              const sha = dependencies[ patchRepo ].sha;
              await gitCheckout( repo, 'master' );

              // Then check it out
              await gitCheckout( patchRepo, sha );
            }

            console.log( `Checked out ${patchRepo} SHA for ${repo} ${branch}` );

            for ( let sha of patch.shas ) {
              const cherryPickSuccess = await gitCherryPick( patchRepo, sha );

              if ( cherryPickSuccess ) {
                const currentSHA = await gitRevParse( patchRepo, 'HEAD' );
                console.log( `Cherry-pick success for ${sha}, result is ${currentSHA}` );

                modifiedBranch.changedDependencies[ patchRepo ] = currentSHA;
                modifiedBranch.neededPatches.splice( modifiedBranch.neededPatches.indexOf( patch ), 1 );
                numApplied++;

                // Don't include duplicate messages, since multiple patches might be for a single issue
                if ( !modifiedBranch.messages.includes( patch.message ) ) {
                  modifiedBranch.messages.push( patch.message );
                }

                break;
              }
              else {
                console.log( `Could not cherry-pick ${sha}` );
              }
            }
          } catch ( e ) {
            maintenance.save();

            throw new Error( `Failure applying patch ${patchRepo} to ${repo} ${branch}: ${JSON.stringify( e, null, 2 )}` );
          }
        }

        await gitCheckout( modifiedBranch.repo, 'master' );
      }

      maintenance.save();

      console.log( `${numApplied} patches applied` );
    }

    // TODO: add try/catch in appropriate places?  Can we partially update maintenance.json instead of NO updates? yikes

    static async updateDependencies() {
      const maintenance = Maintenance.load();

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        const changedRepos = Object.keys( modifiedBranch.changedDependencies );
        if ( changedRepos.length === 0 ) {
          continue;
        }

        try {
          await checkoutTarget( modifiedBranch.repo, modifiedBranch.branch, true ); // npm update, since we'll build.
          console.log( `Checked out ${modifiedBranch.repo} ${modifiedBranch.branch}` );

          for ( let dependency of changedRepos ) {
            const dependencyBranch = modifiedBranch.dependencyBranch;
            const branches = await getBranches( dependency );
            const sha = modifiedBranch.changedDependencies[ dependency ];

            if ( branches.includes( dependencyBranch ) ) {
              console.log( `Branch ${dependencyBranch} already exists in ${dependency}` );
              await gitCheckout( dependency, dependencyBranch );
              await gitPull( dependency );
              const currentSHA = await gitRevParse( dependency, 'HEAD' );

              if ( sha !== currentSHA ) {
                console.log( `Attempting to (hopefully fast-forward) merge ${sha}` );
                await execute( 'git', [ 'merge', sha ], `../${dependency}` );
                await gitPush( dependency, dependencyBranch );
              }
            }
            else {
              console.log( `Branch ${dependencyBranch} does not exist in ${dependency}, creating.` );
              await gitCheckout( dependency, sha );
              await gitCreateBranch( dependency, dependencyBranch );
              await gitPush( dependency, dependencyBranch );
            }

            delete modifiedBranch.changedDependencies[ dependency ];
            modifiedBranch.deployedVersion = null;
          }

          if ( changedRepos.includes( 'chipper' ) ) {
            await npmUpdate( 'chipper' );
          }

          console.log( await build( modifiedBranch.repo, {
            brands: modifiedBranch.brands
          } ) );

          const message = modifiedBranch.messages.join( ' and ' );
          await updateDependenciesJSON( modifiedBranch.repo, modifiedBranch.brands, message, modifiedBranch.branch );

          await checkoutMaster( modifiedBranch.repo, true ); // npm update back, so we don't leave the sim in a weird state
        } catch ( e ) {
          maintenance.save();

          throw new Error( `Failure updating dependencoes for ${modifiedBranch.repo} to ${modifiedBranch.branch}: ${JSON.stringify( e, null, 2 )}` );
        }
      }

      maintenance.save();

      console.log( 'Dependencies updated' );
    }

    static async deployReleaseCandidates() {
      const maintenance = Maintenance.load();

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        if ( !modifiedBranch.isReadyForReleaseCandidate ) {
          continue;
        }

        try {
          console.log( `Running RC deploy for ${modifiedBranch.repo} ${modifiedBranch.branch}` );

          const version = await rc( modifiedBranch.repo, modifiedBranch.branch, modifiedBranch.brands, true, modifiedBranch.messages.join( ', ' ) );
          modifiedBranch.deployedVersion = version;
        } catch ( e ) {
          maintenance.save();

          throw new Error( `Failure with RC deploy for ${modifiedBranch.repo} to ${modifiedBranch.branch}: ${JSON.stringify( e, null, 2 )}` );
        }
      }

      maintenance.save();

      console.log( 'RC versions deployed' );
    }

    static async deployProduction() {
      const maintenance = Maintenance.load();

      for ( let modifiedBranch of maintenance.modifiedBranches ) {
        if ( !modifiedBranch.isReadyForProduction ) {
          continue;
        }

        try {
          console.log( `Running production deploy for ${modifiedBranch.repo} ${modifiedBranch.branch}` );

          const version = await production( modifiedBranch.repo, modifiedBranch.branch, modifiedBranch.brands, true, modifiedBranch.messages.join( ', ' ) );
          modifiedBranch.deployedVersion = version;
          modifiedBranch.messages = [];
        } catch ( e ) {
          maintenance.save();

          throw new Error( `Failure with production deploy for ${modifiedBranch.repo} to ${modifiedBranch.branch}: ${JSON.stringify( e, null, 2 )}` );
        }
      }

      maintenance.save();

      console.log( 'production versions deployed' );
    }
  }

  return Maintenance;
} )();