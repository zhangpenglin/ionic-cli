var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    xml2js = require('xml2js'),
    request = require('request'),
    _ = require('underscore'),
    md5 = require('MD5'),
    resSettings = require('./settings.js'),
    Task = require('../task').Task,
    moduleSettings = require('../../../package.json');


var IonicTask = function() {};

IonicTask.prototype = new Task();

IonicTask.prototype.run = function() {
  if (!fs.existsSync(resSettings.ResSettings.configFile)) {
    console.error('Invalid ' + resSettings.ResSettings.configFile + ' file. Make sure the working directory is a Cordova project.');
    return;
  }

  var argv = require('optimist').argv;

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

      _.forEach(platforms[platform][resType].images, function(image) {
        var data = _.clone(image);
        _.extend(data, {
          platform: platform,
          src: path.join(resTypeDir, image.name),
          nodeName: platforms[platform][resType].nodeName,
          nodeAttributes: platforms[platform][resType].nodeAttributes
        });
        images.push(data);
      });
    });
  }

  function queueSourceImages() {
    var usedPlatforms = {};

    var validSourceFiles = _.map(settings.sourceExtensions, function(ext) {
      return settings[resType + 'SourceFile'] + '.' + ext;
    });

    images.forEach(function(image) {
      if (usedPlatforms[image.platform]) return;
      usedPlatforms[image.platform] = { platform: image.platform };
    });

    _.each(usedPlatforms, function(usedPlatform) {
      for (var x = 0; x < validSourceFiles.length; x++) {
        globalSourceFile = path.join(settings.resourceDir, validSourceFiles[x]);
        platformSourceFile = path.join(settings.resourceDir, usedPlatform.platform, validSourceFiles[x]);

        if (fs.existsSync(platformSourceFile)) {
          usedPlatform.sourceFilePath = platformSourceFile;
          usedPlatform.sourceFilename = usedPlatform.platform + '/' + validSourceFiles[x];
          break;

        } else if (fs.existsSync(globalSourceFile)) {
          usedPlatform.sourceFilePath = globalSourceFile;
          usedPlatform.sourceFilename = validSourceFiles[x];
          break;
        }
      }

      if (!usedPlatform.sourceFilePath || sourceFiles[usedPlatform.sourceFilePath]) return;

      sourceFiles[usedPlatform.sourceFilePath] = {
        filePath: usedPlatform.sourceFilePath,
        filename: usedPlatform.sourceFilename
      };
    });

    var missingPlatformSources = _.filter(usedPlatforms, function(usedPlatform) {
      return !usedPlatform.sourceFilePath;
    });

    if (missingPlatformSources.length) {
      var notFoundDirs = ['resources'];
      missingPlatformSources.forEach(function(missingPlatformSource) {
        notFoundDirs.push('resources/' + missingPlatformSource.platform);
      });

      var msg = resType + ' source file not found in ';
      if (notFoundDirs.length > 1) {
        msg += 'any of these directories: ' + notFoundDirs.join(', ');
      } else {
        msg += 'the resources directory';
      }
      console.error(msg);

      console.error('valid ' + resType + ' source files: ' + validSourceFiles.join(', '));

      var deferred = Q.defer();
      deferred.reject();
      return deferred.promise;
    }

    var promises = [];
    _.each(usedPlatforms, function(usedPlatform) {
      var deferred = Q.defer();

      fs.readFile(usedPlatform.sourceFilePath, function(err, buf) {
        if (err) {
          deferred.reject('Error reading ' + usedPlatform.sourceFilePath);

        } else {
          try {
            sourceFiles[usedPlatform.sourceFilePath].imageId = md5(buf);

            images.forEach(function(image){
              if (image.platform == usedPlatform.platform) {
                image.sourceFilePath = usedPlatform.sourceFilePath;

                var sourceFile = sourceFiles[image.sourceFilePath];
                var tmpFilename = sourceFile.imageId + '-' + image.platform + '-' + image.name;

                image.imageId = sourceFile.imageId;
                image.tmpPath = path.join(settings.resourceDir, settings.resourceTmpDir, tmpFilename);

                if (fs.existsSync(image.tmpPath)) {
                  console.success(image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') from cache');

                } else {
                  sourceFile.upload = true;
                  generateQueue.push(image);
                }
              }
            });
            deferred.resolve();

          } catch (e) {
            deferred.reject('Error loading ' + usedPlatform.sourceFilePath + ' md5: ' + e);
          }
        }
      });

      promises.push(deferred.promise);
    });

    return Q.all(promises);
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
          src: fs.createReadStream(sourceFile.filePath),
          cli_version: moduleSettings.version
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

  function generateImage(image) {
    var deferred = Q.defer();

    var sourceFile = sourceFiles[image.sourceFilePath];

    if (sourceFile.width < image.width || sourceFile.height < image.height) {
      image.skipConfig = true;
      console.error('Source ' + sourceFile.filename + ' (' + sourceFile.width + 'x' + sourceFile.height + ') too small to generate ' + image.name + ' (' + image.width + 'x' + image.height + ')');
      deferred.resolve();

    } else {
      console.log(' generating ' + resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ')...');

      var postData = {
        url: settings.apiUrl + settings.apiTransformPath,
        formData: {
          image_id: image.imageId,
          name: image.name,
          width: image.width,
          height: image.height,
          platform: image.platform,
          cli_version: moduleSettings.version,
          crop: 'center'
        },
        proxy: process.env.PROXY || null
      };

      var wr = fs.createWriteStream(image.tmpPath, { flags: 'w' });
      wr.on("error", function(err) {
        console.error('Error copying to ' + image.tmpPath + ': ' + err);
        deferred.resolve();
      });
      wr.on("finish", function() {
        if (!image.rejected) {
          console.success(image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') generated');
          deferred.resolve();
        }
      });

      request.post(postData, function(err, httpResponse, body) {

        function reject(msg) {
          try {
            wr.close();
            fs.unlink(image.tmpPath);
          } catch (err) {}

          try {
            msg += JSON.parse(body).Error;
          } catch (e) {
            msg += body || '';
          }
          image.rejected = true;
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

    images.forEach(function(image) {
      if (!fs.existsSync(image.tmpPath)) return;

      var deferred = Q.defer();

      var rd = fs.createReadStream(image.tmpPath);
      rd.on('error', function(err) {
        deferred.reject('Unable to read generated image: ' + err);
      });

      var wr = fs.createWriteStream(image.src, {flags: 'w'});
      wr.on('error', function(err) {
        deferred.reject('Unable to copy to ' + image.src + ': ' + err);
      });
      wr.on('finish', function() {
        image.isValid = true;
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

              if (resType == 'icon') {
                var defaultIconSize = 0;
                var defaultIcon;

                images.forEach(function(image) {
                  if (image.skipConfig && !image.isValid) return;
                  if (image.width > defaultIconSize && image.width <= settings.defaultMaxIconSize) {
                    defaultIconSize = image.width;
                    defaultIcon = image;
                  }
                });
                if (defaultIcon) {
                  configData.widget.icon = [{ '$': { src: defaultIcon.src } }];
                }
              }

              images.forEach(function(image) {
                if (image.skipConfig && !image.isValid) return;

                if (!configData.widget.platform) {
                  configData.widget.platform = [];
                }

                var platformData = getPlatformConfigData(configData, image.platform);

                if (!platformData) {
                  configData.widget.platform.push({ '$': { name: image.platform } });
                  platformData = getPlatformConfigData(configData, image.platform);
                }

                if (!platformData[image.nodeName]) {
                  platformData[image.nodeName] = [];
                }

                var node = getResourceConfigNode(platformData, image.nodeName, image.src);
                if (!node) {
                  node = { '$': {} };
                  platformData[image.nodeName].push(node);
                }

                image.nodeAttributes.forEach(function(nodeAttribute) {
                  node.$[nodeAttribute] = image[nodeAttribute];
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
