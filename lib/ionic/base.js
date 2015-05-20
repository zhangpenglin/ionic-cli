//Steps
//Download facebook plugin /base/phonegap-facebook-plugin-master
//Prompt for user input FB App ID, Name
//ionic plugin add ./base/phonegap-facebook-plugin-master --variable APP_ID="id" --variable APP_NAME=""

var fs = require('fs'),
  path = require('path'),
  argv = require('optimist').argv,
  Q = require('q'),
  shelljs = require('shelljs'),
  Task = require('./task').Task,
  IonicStats = require('./stats').IonicStats,
  _ = require('underscore'),
  IonicProject = require('./project'),
  IonicAppLib = require('ionic-app-lib'),
  IonicInfo = IonicAppLib.info,
  utils = IonicAppLib.utils;

var Base = module.exports;
var facebookPluginDir = 'phonegap-facebook-plugin-master';


shelljs.config.silent = false;

var IonicTask = function() {};

IonicTask.prototype = new Task();

//Before any of this happens, check cordova CLI version. If they are prior to 4.3.0, they need
//to install platforms first. Alert user of this.
Base.checkPreReqs = function checkPreReqs() {
  var infoTask = require('./info').IonicTask;
  var semver = require('semver');

  var envInfo = IonicInfo.gatherInfo();
  var platformsExist = false,
      platformStats,
      hasPreReqs = true;

  try {
    platformStats = fs.statSync(path.resolve('platforms'));
    platformsIosStats = fs.statSync(path.resolve('platforms', 'ios'));
    platformsAndroidStats = fs.statSync(path.resolve('platforms', 'android'));
    platformsExist = platformsIosStats.isDirectory() || platformsAndroidStats.isDirectory();
  } catch (ex) { } //default to false. It wont reach last line if ENOENT for ios/android

  try {

    if (!platformsExist && semver.satisfies(envInfo.cordova, '<=4.3.0')) {
      console.log('You are using a version of Cordova less than 4.3.0. There is a known issue if you add plugins before platforms are added.');
      console.log('We highly suggest you add your platforms before running this command.');
      hasPreReqs = false;
    }
  } catch (ex) {
    console.log('Error checking your Cordova CLI version.', ex);
  }

  console.log('hasPreReqs', hasPreReqs)

  return hasPreReqs;
}

Base.setupFacebook = function setupFacebook() {
  var downloadUrl = 'https://github.com/Wizcorp/phonegap-facebook-plugin/archive/master.zip';
  var zipOutPath = path.join(process.cwd(), 'base');
  var facebookAppInfo = {};

  var promise;

  if (!Base.checkPreReqs()) {
    console.log('prereq check fail')
    promise = Base.promptForPlatformInstall();
  } else {
    promise = Q();
  }

  return promise
  .then(Base.promptForFacebookInfo)
  .then(function(facebookInfo) {
    console.log('facebookInfo', facebookInfo)
    facebookAppInfo = facebookInfo;
    return Base.downloadZipToDir(downloadUrl, zipOutPath, path.join(zipOutPath, 'phonegap-facebook-plugin-master'));
  })
  .then(function() {
    console.log('Downloaded Facebook Plugin');
    console.log('Installing Facebook Plugin');
    return Base.installFacebookPlugin(facebookAppInfo);
  })
  .then(function() {
    Base.showMarkup();
  })
  .catch(function(ex) {
    console.log('Error occurred', ex);
  })
}

Base.installFacebookPlugin = function installFacebookPlugin(facebookInfo) {
  // var q = Q.defer();
  var basePath = path.resolve('base', 'phonegap-facebook-plugin-master');
  var command = ['ionic plugin add ', basePath, ' --variable APP_ID="', facebookInfo.app_id, '" --variable APP_NAME="', facebookInfo.app_name, '"'].join('');
  var result = shelljs.exec(command);
  console.log('Command:', command);

  if (result.code != 0) {
    var errorMessage = ['There was an error adding the Cordova Facebook Plugin', result.output].join('\n');
    utils.fail(errorMessage);
    throw new Error(errorMessage);
  } else {
    console.log('\nAdded Cordova Facebook Plugin')
  }
  // return q.promise;
}

Base.showMarkup = function showMarkup() {
  var facebookSnippetPath = path.join(__dirname, 'assets', 'facebookSnippets.js');
  var facebookSnippet = fs.readFileSync(facebookSnippetPath, 'utf8');
  console.log('Put this JS in your Controller to use the Facebook plugin:'.green);
  console.log(facebookSnippet.blue);
  console.log('Use this HTML to trigger the above login method'.green);
  console.log('<button ng-click="login()">Login to Facebook!</button>'.blue)
}

Base.promptForPlatformInstall = function promptForPlatformInstall() {
  var schema = [{
    name: 'platform',
    // pattern: /^[A-z0-9!#$%&'*+\/=?\^_{|}~\-]+(?:\.[A-z0-9!#$%&'*+\/=?\^_{|}~\-]+)*@(?:[A-z0-9](?:[A-z0-9\-]*[A-z0-9])?\.)+[A-z0-9](?:[A-z0-9\-]*[A-z0-9])?$/,
    description: 'Install platforms? (ios|android|both): '.yellow.bold,
    required: true
  }];

  return Base.promptUserPromise(schema)
  .then(function(result) {
    var platform = result.platform.toLowerCase().trim();
    switch (platform) {
      case 'ios':
        shelljs.exec('ionic platform add ios');
        break;
      case 'android':
        shelljs.exec('ionic platform add android');
        break;
      case 'both':
        shelljs.exec('ionic platform add ios');
        shelljs.exec('ionic platform add android');
        break;
    }
  });
}

Base.promptForFacebookInfo = function promptForFacebookInfo() {
  var schema = [{
    name: 'app_id',
    // pattern: /^[A-z0-9!#$%&'*+\/=?\^_{|}~\-]+(?:\.[A-z0-9!#$%&'*+\/=?\^_{|}~\-]+)*@(?:[A-z0-9](?:[A-z0-9\-]*[A-z0-9])?\.)+[A-z0-9](?:[A-z0-9\-]*[A-z0-9])?$/,
    description: 'Facebook App ID:'.yellow.bold,
    required: true
  }, {
    name: 'app_name',
    description: 'App Name:'.yellow.bold,
    required: true
  }];

  return Base.promptUserPromise(schema)
  .then(function(result) {
    var fbInfo = {
      app_id: result.app_id,
      app_name: result.app_name
    }
    return fbInfo;
  })
}

Base.promptUserPromise = function promptUserPromise(schema) {
  var q = Q.defer();
  var prompt = require('prompt');

  prompt.override = argv;
  prompt.message = '';
  prompt.delimiter = '';
  prompt.start();

  prompt.get(schema, function (err, result) {
    if (err) {
      q.reject(err);
      return utils.fail('Error getting Facebook app information: ' + err);
    }

    q.resolve(result);
  });

  return q.promise;
}

Base.downloadZipToDir = function downloadZipToDir(downloadUrl, zipOutPath, outputDir) {
  console.log('Setting up Facebook');
  var q = Q.defer();
  // var zipOutPath = path.join(process.cwd(), 'base');


  if (!fs.existsSync(zipOutPath)) {
    shelljs.mkdir(zipOutPath);
  }

  if (fs.existsSync(outputDir)) {
    console.log('Dir exists. Nothing to do');
    return q.resolve();
  }

  utils.fetchArchive(zipOutPath, downloadUrl)
  .then(function(data) {
    q.resolve();
  }, function(error) {
    console.log('Failed to download Facebook plugin - ', error);
    q.reject();
  })

  return q.promise;
}

IonicTask.prototype.run = function run(ionic) {
  var self = this,
      project,
      stats,
      projectPath;

  this.ionic = ionic;


  console.log('Args: ', argv._);

  try {

    switch (argv._[1]) {
      default:
        Base.setupFacebook();
    }
  } catch(ex) {
    console.log('Base error:', ex);
  }

  IonicStats.t();

};

exports.IonicTask = IonicTask;
