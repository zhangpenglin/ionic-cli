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
  this.ionic = ionic;

  var www = path.join(process.cwd(), 'www');
  if(!fs.existsSync(www)) {
    ionic.fail('Couldn\'t find your www folder. Please run this command in the root of your cordova project.');
  }

  var version = argv._[1] || 'master';
  console.log('Updating ionic to the', version, 'version');

  var url = 'https://github.com/driftyco/ionic/archive/' + version + '.zip';


  this._fetchAndUpdate(url, version);
};

IonicUpdateIonicTask.prototype._fetchAndUpdate = function(url, version) {
  console.log('Downloading Ionic release:', url);
  var self = this;

  var targetPath = 'ionic-dist/';
  var tmpFolder = os.tmpdir();
  var tempZipFilePath = path.join(tmpFolder, 'ionic-' + version + new Date().getTime() + '.zip');
  var tempZipFileStream = fs.createWriteStream(tempZipFilePath)

  var unzipRepo = function(fileName) {
    console.log('Unzipping...', fileName);
    var readStream = fs.createReadStream(fileName);

    var writeStream = unzip.Extract({ path: targetPath });
    writeStream.on('close', function() {
      //cp('-R', targetPath + '/dist/*', 'www/');
      //rm('-rf', targetPath);
      console.log('Ionic updated!');
    });
    readStream.pipe(writeStream);
  };

  request({ url: url, encoding: null }, function(err, res, body) {
    if(err || res.statusCode !== 200) {
      if(res.statusCode == 404) {
        self.ionic.fail('Release not found (HTTP 404). Make sure you have the correct release tag name from here: https://github.com/driftyco/ionic/releases');
      }
      self.ionic.fail('Unable to download release: ' + res.statusCode + ', Error: ' + err);
    }


    tempZipFileStream.write(body);
    tempZipFileStream.close();
    unzipRepo(tempZipFilePath);
  });
}

exports.IonicUpdateIonicTask = IonicUpdateIonicTask;
