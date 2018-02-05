# build-server.js

PhET build and deploy server. The server is designed to run on the same host as the production site (phet-server.int.colorado.edu).

##Starting and Stopping the Server

To start, stop, or restart the build server on phet-server.int.colorado.edu (production) or phet-server.int.colorado.edu (test), run this command:
`sudo systemctl [start|stop|restart] build-server`

To view the logs, run the following command.  A `-f` flag will tail the log.  Pressing Shift+F will scroll to the end (navigation is less-like).
`sudo journalctl -u build-server`

To edit startup options, please see `/usr/lib/systemd/system/build-server.service`

!!!DEPRECATED!!! - figaro has been decommisioned and simian is nearing end of life.
To start, stop, or restart the build server on figaro or simian, run this command:
`sudo /etc/init.d/build-server {{start|stop|restart}}`

##Build Server Configuration


All of the phet repos live on the production and dev servers under /data/share/phet/phet-repos. The build server
lives in perennial: `/data/share/phet/phet-repos/perennial/js/build-server`.

The build-server is run as user "phet-admin". It requires the certain fields filled out in phet-admin's `HOME/.phet/build-local.json`
(see assertions in getBuildServerConfig.js). These fields are already filled out, but they may need to modified or updated.

The build server is configured to send an email on build failure. The configuration for sending emails is also in
phet-admin's `HOME/.phet/build-local.json` (these fields are described in getBuildServerConfig.js). To add other email
recipients, you can add email addresses to the emailTo field in this file.

Additionally, phet-admin needs an ssh key set up to copy files from the production server to spot. This should already be set up,
but should you to do to set it up somewhere else, you'll need to have an rsa key in ~/.ssh on the production server and authorized
(run "ssh-keygen -t rsa" to generate a key if you don't already have one).
Also, you will need to add an entry for spot in `~/.ssh/config` like so:

```
Host spot
    HostName spot.colorado.edu
    User [identikey]
    Port 22
    IdentityFile ~/.ssh/id_rsa
```
On spot, you'll need to add the public key from phet-server to a file ~/.ssh/authorized_keys

build-server log files can be tailed by running /usr/lib/systemd/system/build-server.service

build-server needs to be able to make commits to github to notify rosetta that a new sim is translatable. To do this,
There must be valid git credentials in the .netrc file phet-admin's home directory.


##Using the Build Server for Production Deploys

The build server starts a build process upon receiving an https POST request to /deploy-html-simulation.
It takes as input a JSON object with the following properties:

- `repos` - a json object with dependency repos and shas, in the form of dependencies.json files
- `locales` - a comma-separated list of locales to build (optional, defaults to all locales in babel)
- `simName` - the standardized name of the sim, lowercase with hyphens instead of spaces (i.e. area-builder)
- `version` - the version to be built. Production deploys will automatically strip everything after the major.minor.maintenance
- `authorizationCode` - a password to authorize legitimate requests
- `option` - optional parameter, can be set to "rc" to do an rc deploy instead of production
- `email` - optional parameter, used to send success/failure notifications
- `translatorId` - optional parameter for production/rc deploys, required for translation deploys from rosetta to add the user's credit to the website.

Note: You will NOT want to assemble these request URLs manually, instead use "grunt deploy-production" for production deploys and
`grunt deploy-rc` for rc deploys.


##What the Build Server Does

The build server does the following steps when a deploy request is received:

- checks the authorization code, unauthorized codes will not trigger a build
- puts the build task on a queue so multiple builds don't occur simultaneously
- pull perennial and npm update
- clone missing repos
- pull master for the sim and all dependencies
- grunt checkout-shas
- checkout sha for the current sim
- npm update in chipper and the sim directory
- grunt build-for-server --brand=phet for selected locales (see chipper's Gruntfile for details)
- for rc deploys:
    - deploy to spot, checkout master for all repositories, and finish
- for production deploys:
    - mkdir for the new sim version
    - copy the build files to the correct location in the server doc root
    - write the .htaccess file for indicating the latest directory and downloading the html files
    - write the XML file that tells the website which translations exist
    - notify the website that a new simulation/translation is published and should appear
    - add the sim to rosetta's simInfoArray and commit and push (if the sim isn't already there)
    - checkout master for all repositories

If any of these steps fails, the build aborts and grunt checkout-master-all is run so all repos are back on master