var fs = require('fs'),
    path = require('path'),
    argv = require('optimist').argv,
    Q = require('q'),
    xml2js = require('xml2js'),
    colors = require('colors'),
    request = require('request'),
    _ = require('underscore'),
    md5 = require('MD5'),
    resSettings = require('./settings.js'),
    Task = require('../task').Task;


var IonicTask = function() {};

IonicTask.prototype = new Task();

IonicTask.prototype.run = function() {
  if (!fs.existsSync(resSettings.ResSettings.configFile)) {
    console.error('Invalid ' + resSettings.ResSettings.configFile + ' file. Make sure the working directory is a Cordova project.');
    return;
  }

  if (argv.icon || argv.i) {
    console.info('Ionic icon resources generator');
    IonicTask.IonicResources('icon');

  } else if (argv.splash || argv.s) {
    console.info('Ionic splash screen resources generator');
    IonicTask.IonicResources('splash');

  } else {
    console.info('Ionic icon and splash screen resources generator');
    IonicTask.IonicResources('icon');
    IonicTask.IonicResources('splash');
  }
};

IonicTask.IonicResources = function(resType, options) {
  var settings = resSettings.ResSettings;
  var platforms = resSettings.ResPlatforms;
  var images = [];
  var generateQueue = [];
  var buildPlatforms = [];
  var tmpDir = path.join(settings.resourceDir, settings.resourceTmpDir);
  var sourceFiles = {};
  var configData;

  loadPlatforms()
    .then(queuePlatformImages)
    .then(queueSourceImages)
    .then(queueImageGeneration)
    .then(loadSourceImages)
    .then(generateImages)
    .then(loadImages)
    .then(saveConfigData)
    .catch(console.error);

  function loadPlatforms() {
    var deferred = Q.defer();

    try {
      if (!fs.existsSync(settings.resourceDir)) {
        fs.mkdirSync(settings.resourceDir);
      }

      if (fs.existsSync('platforms')) {
        buildPlatforms = fs.readdirSync('platforms');

        if (buildPlatforms.length) {

          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir);
          }

          deferred.resolve();
        }
      }

      if (!buildPlatforms.length) {
        deferred.reject('No platforms have been added. Please add a platform, for example: ionic platform add ios');
      }

    } catch (err) {
      deferred.reject('Error loading platforms: ' + err);
    }

    return deferred.promise;
  }

  function queuePlatformImages() {
    buildPlatforms.forEach(function(platform) {
      if (!platforms[platform]) return;

      var platformResourceDir = path.join(settings.resourceDir, platform);
      var resTypeDir = path.join(platformResourceDir, settings[resType + 'Dir']);

      if (!fs.existsSync(platformResourceDir)) {
        fs.mkdirSync(platformResourceDir);
      }

      if (!fs.existsSync(resTypeDir)) {
        fs.mkdirSync(resTypeDir);
      }

      _.forEach(platforms[platform][resType].images, function(imageData) {
        var data = _.clone(imageData);
        _.extend(data, {
          platform: platform,
          src: path.join(resTypeDir, imageData.name),
          nodeName: platforms[platform][resType].nodeName,
          nodeAttributes: platforms[platform][resType].nodeAttributes
        });
        images.push(data);
      });
    });
  }

  function queueSourceImages() {
    var promises = [];

    images.forEach(function(imageData) {
      promises.push(queueSourceImage(imageData));
    });

    return Q.all(promises);
  }

  function queueSourceImage(imageData) {
    var deferred = Q.defer();

    var filename, globalSourceFile, platformSourceFile;

    var validSourceFiles = _.map(settings.sourceExtensions, function(ext) {
      return settings[resType + 'SourceFile'] + '.' + ext;
    });

    for (var x = 0; x < validSourceFiles.length; x++) {
      globalSourceFile = path.join(settings.resourceDir, validSourceFiles[x]);
      platformSourceFile = path.join(settings.resourceDir, imageData.platform, validSourceFiles[x]);

      if (fs.existsSync(platformSourceFile)) {
        imageData.sourceFilePath = platformSourceFile;
        filename = imageData.platform + '/' + validSourceFiles[x];
        break;

      } else if (fs.existsSync(globalSourceFile)) {
        imageData.sourceFilePath = globalSourceFile;
        filename = validSourceFiles[x];
        break;
      }
    }

    if (!imageData.sourceFilePath) {
      deferred.reject('Source ' + resType + ' file not found in "resources" or "resources/' + imageData.platform + '", supported files: ' + validSourceFiles.join(', '));

    } else if (sourceFiles[imageData.sourceFilePath]) {
      deferred.resolve();

    } else {
      sourceFiles[imageData.sourceFilePath] = {
        filePath: imageData.sourceFilePath,
        filename: filename
      };

      fs.readFile(imageData.sourceFilePath, function(err, buf) {
        if (err) {
          deferred.reject('Error reading ' + imageData.sourceFilePath);

        } else {
          try {
            sourceFiles[imageData.sourceFilePath].imageId = md5(buf);
            deferred.resolve();

          } catch (e) {
            deferred.reject('Error loading ' + imageData.sourceFilePath + ' md5: ' + e);
          }
        }
      });
    }

    return deferred.promise;
  }

  function loadSourceImages() {
    var promises = [];

    _.each(sourceFiles, function(sourceFile) {
      if (!sourceFile.upload) return;

      var deferred = Q.defer();

      console.log(' uploading ' + sourceFile.filename + '...');

      var postData = {
        url: settings.apiUrl + settings.apiUploadPath,
        formData: {
          image_id: sourceFile.imageId,
          src: fs.createReadStream(sourceFile.filePath)
        },
        proxy: process.env.PROXY || null
      };

      request.post(postData, function(err, httpResponse, body) {
        function reject(msg) {
          try {
            msg += JSON.parse(body).Error;
          } catch (e) {
            msg += body || '';
          }
          deferred.reject(msg);
        }

        if (err) {
          var msg = 'Failed to upload source image: ';
          if (err.code == 'ENOTFOUND') {
            msg += 'requires network connection';
          } else {
            msg += err;
          }
          deferred.reject(msg);

        } else if (!httpResponse) {
          reject('Invalid http response');

        } else if (httpResponse.statusCode >= 500) {
          reject('Image server temporarily unavailable: ');

        } else if (httpResponse.statusCode == 404) {
          reject('Image server unavailable: ');

        } else if (httpResponse.statusCode > 200) {
          reject('Invalid upload: ');

        } else {
          try {
            var d = JSON.parse(body);
            sourceFile.width = d.Width;
            sourceFile.height = d.Height;
            console.success(sourceFile.filename + ' (' + d.Width + 'x' + d.Height + ') upload complete');
            deferred.resolve();

          } catch (e) {
            reject('Error parsing upload response: ');
          }
        }
      });
      promises.push(deferred.promise);
    });

    return Q.all(promises);
  }

  function queueImageGeneration() {
    var deferred = Q.defer();

    _.each(images, function(imageData) {
      var sourceFile = sourceFiles[imageData.sourceFilePath];
      var tmpFilename = sourceFile.imageId + '-' + imageData.platform + '-' + imageData.name;

      imageData.imageId = sourceFile.imageId;
      imageData.tmpPath = path.join(settings.resourceDir, settings.resourceTmpDir, tmpFilename);

      if (fs.existsSync(imageData.tmpPath)) {
        console.success(imageData.platform + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ') from cache');

      } else {
        sourceFile.upload = true;
        generateQueue.push(imageData);
      }
    });

    deferred.resolve();
    return deferred.promise;
  }

  function generateImages() {
    var deferred = Q.defer();

    // https://github.com/ferentchak/QThrottle
    var max = settings.generateThrottle - 1;
    var outstanding = 0;

    function catchingFunction(value) {
      deferred.notify(value);
      outstanding--;

      if (generateQueue.length) {
        outstanding++;
        generateImage(generateQueue.pop())
          .then(catchingFunction)
          .fail(deferred.reject);

      } else if (outstanding === 0) {
        deferred.resolve();
      }
    }

    if (generateQueue.length) {
      while (max-- && generateQueue.length) {
        generateImage(generateQueue.pop())
          .then(catchingFunction)
          .fail(deferred.reject);
        outstanding++;
      }
    } else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  function generateImage(imageData) {
    var deferred = Q.defer();

    var sourceFile = sourceFiles[imageData.sourceFilePath];

    if (sourceFile.width < imageData.width || sourceFile.height < imageData.height) {
      imageData.skipConfig = true;
      console.error('Source ' + sourceFile.filename + ' (' + sourceFile.width + 'x' + sourceFile.height + ') too small to generate ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')');
      deferred.resolve();

    } else {
      console.log(' generating ' + resType + ' ' + imageData.platform + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')...');

      var postData = {
        url: settings.apiUrl + settings.apiTransformPath,
        formData: {
          image_id: imageData.imageId,
          name: imageData.name,
          width: imageData.width,
          height: imageData.height,
          platform: imageData.platform,
          crop: 'center'
        },
        proxy: process.env.PROXY || null
      };

      var wr = fs.createWriteStream(imageData.tmpPath, { flags: 'w' });
      wr.on("error", function(err) {
        console.error('Error copying to ' + imageData.tmpPath + ': ' + err);
        deferred.resolve();
      });
      wr.on("finish", function() {
        if (!imageData.rejected) {
          console.success(imageData.platform + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ') generated');
          deferred.resolve();
        }
      });

      request.post(postData, function(err, httpResponse, body) {

        function reject(msg) {
          try {
            wr.close();
            fs.unlink(imageData.tmpPath);
          } catch (err) {}

          try {
            msg += JSON.parse(body).Error;
          } catch (e) {
            msg += body || '';
          }
          imageData.rejected = true;
          deferred.reject(msg);
        }

        if (err || !httpResponse) {
          reject('Failed to generate image: ' + err);

        } else if (httpResponse.statusCode >= 500) {
          reject('Image transformation server temporarily unavailable: ');

        } else if (httpResponse.statusCode > 200) {
          reject('Invalid transformation: ');
        }
      })
      .pipe(wr);
    }

    return deferred.promise;
  }

  function loadImages() {
    var promises = [];

    images.forEach(function(imageData) {
      if (!fs.existsSync(imageData.tmpPath)) return;

      var deferred = Q.defer();

      var rd = fs.createReadStream(imageData.tmpPath);
      rd.on('error', function(err) {
        deferred.reject('Unable to read generated image: ' + err);
      });

      var wr = fs.createWriteStream(imageData.src, {flags: 'w'});
      wr.on('error', function(err) {
        deferred.reject('Unable to copy to ' + imageData.src + ': ' + err);
      });
      wr.on('finish', function() {
        deferred.resolve();
      });
      rd.pipe(wr);

      promises.push(deferred.promise);
    });

    return Q.all(promises);
  }

  function saveConfigData() {
    var deferred = Q.defer();

    try {
      fs.readFile(settings.configFile, function(err, data) {
        if (err) {
          deferred.reject('Error reading config file: ' + err);

        } else {
          var parser = new xml2js.Parser();
          parser.parseString(data, function(err, configData) {
            if (err) {
              deferred.reject('Error parsing config file: ' + err);

            } else {

              buildPlatforms.forEach(function(platform) {
                var platformData = getPlatformConfigData(configData, platform);
                if (platformData && platformData[resType]) {
                  platformData[resType] = [];
                }
              });

              images.forEach(function(imageData) {
                if (imageData.skipConfig) return;

                if (!configData.widget.platform) {
                  configData.widget.platform = [];
                }

                var platformData = getPlatformConfigData(configData, imageData.platform);

                if (!platformData) {
                  configData.widget.platform.push({ '$': { name: imageData.platform } });
                  platformData = getPlatformConfigData(configData, imageData.platform);
                }

                if (!platformData[imageData.nodeName]) {
                  platformData[imageData.nodeName] = [];
                }

                var node = getResourceConfigNode(platformData, imageData.nodeName, imageData.src);
                if (!node) {
                  node = { '$': {} };
                  platformData[imageData.nodeName].push(node);
                }

                imageData.nodeAttributes.forEach(function(nodeAttribute) {
                  node.$[nodeAttribute] = imageData[nodeAttribute];
                });
              });

              var builder = new xml2js.Builder();
              var xmlString = builder.buildObject(configData);

              fs.writeFile(settings.configFile, xmlString, function(err) {
                if (err) {
                  deferred.reject('Error writing config data: ' + err);
                } else {
                  deferred.resolve();
                }
              });
            }
          });
        }
      });

    } catch (err) {
      deferred.reject('Error saving config data: ' + err);
    }

    return deferred.promise;
  }

  function updatePlatformConfigData(imageData) {
    try {


    } catch (err) {
      console.error('Error setting platform config data: ' + err);
    }
  }

  function getPlatformConfigData(configData, platform) {
    if (configData.widget && configData.widget.platform) {
      return _.find(configData.widget.platform, function(d) {
        return d && d.$ && d.$.name == platform;
      });
    }
  }

  function getResourceConfigNode(platformData, nodeName, src) {
    if (platformData[nodeName]) {
      return _.find(platformData[nodeName], function(d) {
        return d && d.$ && d.$.src == src;
      });
    }
  }

};

exports.IonicTask = IonicTask;
