var fs = require('fs'),
    os = require('os'),
    request = require('request'),
    ncp = require('ncp').ncp,
    path = require('path'),
    shelljs = require('shelljs/global'),
    unzip = require('unzip'),
    IonicTask = require('../task').IonicTask;

var argv = require('optimist').argv;


var IonicUpdateIonicTask = function() {
};

IonicUpdateIonicTask.prototype = new IonicTask();

IonicUpdateIonicTask.HELP_LINE = 'Update the version of Ionic and Angular used for the project.';

IonicUpdateIonicTask.USAGE = 'ionic update-task [version]\n\nWhere version is either empty to use the current version in master' +
      ' or a specific version from the github tags in the Ionic repo releases.';

IonicUpdateIonicTask.prototype.run = function(ionic) {
  var www = path.join(process.cwd(), 'www');
  if(!fs.existsSync(www)) {
    ionic.fail('Couldn\'t find your www folder. Please run this command in the root of your cordova project.');
  }

  this.version = argv._[1] || 'master';
  console.log('Updating ionic to the', this.version, 'version');
};

exports.IonicUpdateIonicTask = IonicUpdateIonicTask;
