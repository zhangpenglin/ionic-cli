var fs = require('fs'),
    path = require('path'),
    argv = require('optimist').argv,
    Q = require('q'),
    xml2js = require('xml2js'),
    colors = require('colors'),
    request = require('request'),
    _ = require('underscore'),
    resSettings = require('./settings.js'),
    Task = require('../task').Task;


var IonicTask = function() {};

IonicTask.prototype = new Task();

IonicTask.prototype.run = function() {
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
  var generateQueue = [];
  var images = [];
  var tmpDir = path.join(settings.resourceDir, settings.resourceTmpDir);
  var sourceFiles = [];
  var configData;

  loadConfigData()
    .then(loadPlatforms)
    .then(uploadSourceFiles)
    .then(generateImages)
    .then(loadImages)
    .then(saveConfigData)
    .catch(console.error);

  function loadPlatforms() {
    var deferred = Q.defer();
    var foundPlatforms = false;

    try {

      if (!fs.existsSync(settings.resourceDir)) {
        fs.mkdirSync(settings.resourceDir);
      }

      if (fs.existsSync('platforms')) {
        var buildPlatforms = fs.readdirSync('platforms');

        if (buildPlatforms.length) {
          foundPlatforms = true;

          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir);
          }

          var promises = [];
          buildPlatforms.forEach(function(platformName) {
            promises.push(loadPlatform(platformName));
          });

          Q.all(promises).then(function(){
            deferred.resolve();
          }).catch(deferred.reject);
        }
      }

      if (!foundPlatforms) {
        deferred.reject('No platforms have been added. Please add a platform, for example: ionic platform add ios');
      }

    } catch (err) {
      deferred.reject('Error loading platforms: ' + err);
    }

    return deferred.promise;
  }

  function loadPlatform(platformName) {
    var deferred = Q.defer();

    if (platforms[platformName]) {

      var platformResourceDir = path.join(settings.resourceDir, platformName);
      var resTypeDir = path.join(platformResourceDir, settings[resType + 'Dir']);

      if (!fs.existsSync(platformResourceDir)) {
        fs.mkdirSync(platformResourceDir);
      }

      if (!fs.existsSync(resTypeDir)) {
        fs.mkdirSync(resTypeDir);
      }

      loadSourceImage(platformName).then(function(sourceFile) {

        _.forEach(platforms[platformName][resType].images, function(imageData) {
          var tmpFilename = (resType + '-' + sourceFile.imageId + '-' + platformName + '-' + imageData.name).replace(/\//g, '-');
          var data = _.clone(imageData);
          _.extend(data, {
            platformName: platformName,
            src: path.join(resTypeDir, imageData.name),
            tmpPath: path.join(settings.resourceDir, settings.resourceTmpDir, tmpFilename),
            imageId: sourceFile.imageId
          });
          data.nodeName = platforms[platformName][resType].nodeName;
          data.nodeAttributes = platforms[platformName][resType].nodeAttributes;

          if (settings.cacheImages && fs.existsSync(data.tmpPath)) {
            images.push(data);
            console.success(platformName + ' ' + data.name + ' (' + data.width + 'x' + data.height + ') from cache');
          } else {
            sourceFile.shouldUpload = true;
            generateQueue.push(data);
          }
          deferred.resolve();

        }).catch(deferred.reject);

      });

    } else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  function loadSourceImage(platformName) {
    var deferred = Q.defer();
    var validSourceFiles = [];
    var x, imageId, filePath, filename, globalSourceFile, platformSourceFile;

    for (x = 0; x < settings.sourceExtensions.length; x++) {
      validSourceFiles.push(settings[resType + 'SourceFile'] + '.' + settings.sourceExtensions[x]);
    }

    for (x = 0; x < validSourceFiles.length; x++) {
      globalSourceFile = path.join(settings.resourceDir, validSourceFiles[x]);
      platformSourceFile = path.join(settings.resourceDir, platformName, validSourceFiles[x]);

      if (fs.existsSync(platformSourceFile)) {
        filePath = platformSourceFile;
        filename = platformName + '/' + validSourceFiles[x];
        break;

      } else if (fs.existsSync(globalSourceFile)) {
        filePath = globalSourceFile;
        filename = validSourceFiles[x];
        break;
      }
    }

    if (!filePath) {
      console.error('Source ' + resType + ' file not found in "resources" or "resources/' + platformName + '", supported files: ' + validSourceFiles.join(', '));
      deferred.reject();

    } else {

      var sourceFile;
      for (x = 0; x < sourceFiles.length; x++) {
        if (sourceFiles[x].filePath === filePath) {
          sourceFile = sourceFiles[x];
          break;
        }
      }

      if (!sourceFile) {
        fs.readFile(filePath, function(err, buf) {
          if (err) {
            deferred.reject('Error reading ' + filePath);
          } else {
            try {
              var md5 = require('MD5');
              imageId = md5(buf);
              sourceFile = {
                imageId: imageId,
                filePath: filePath,
                filename: filename
              };
              sourceFiles.push(sourceFile);
              deferred.resolve(sourceFile);

            } catch (e) {
              deferred.reject('Error loading source md5: ' + e);
            }
          }
        });

      } else {
        deferred.resolve(sourceFile);
      }
    }

    return deferred.promise;
  }

  function uploadSourceFiles() {
    if (sourceFiles.length) {
      var promises = [];

      sourceFiles.forEach(function(sourceFile) {
        var deferred = Q.defer();

        if (sourceFile.shouldUpload) {
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
            console.success(sourceFile.filename + ' upload complete');

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
                verifySourceDimensions(sourceFile);
                deferred.resolve();

              } catch (e) {
                reject('Error parsing upload response: ');
              }
            }
          });

        } else {
          deferred.resolve();
        }

        promises.push(deferred.promise);
      });

      return Q.all(promises);

    } else {
      var deferred = Q.defer();
      console.success(resType + ' images created from cache');
      deferred.resolve();
      return deferred.promise;
    }
  }

  function verifySourceDimensions(sourceFile) {
    try {
      generateQueue.forEach(function(imageData) {
        if (imageData.imageId === sourceFile.imageId && (sourceFile.width < imageData.width || sourceFile.height < imageData.height)) {
          console.error('Source ' + sourceFile.filename + ' (' + sourceFile.width + 'x' + sourceFile.height + ') too small to generate ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')');
          imageData.skip = true;
        }
      });

    } catch (e) {
      console.error('Error verifying source dimensions: ' + e);
    }
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

    if (imageData.skip) {
      deferred.resolve();
      return deferred.promise;
    }

    console.log(' generating ' + resType + ' ' + imageData.platformName + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')...');

    var postData = {
      url: settings.apiUrl + settings.apiTransformPath,
      formData: {
        image_id: imageData.imageId,
        name: imageData.name,
        width: imageData.width,
        height: imageData.height,
        platform: imageData.platformName,
        crop: 'center'
      },
      proxy: process.env.PROXY || null
    };

    var wr = fs.createWriteStream(imageData.tmpPath, {flags: 'w'});
    wr.on("error", function(err) {
      console.error('Unable to copy to ' + imageData.tmpPath + ': ' + err);
      deferred.resolve();
    });
    wr.on("finish", function() {
      if (!imageData.rejected) {
        console.success(imageData.platformName + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ') generated');
        images.push(imageData);
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

    return deferred.promise;
  }

  function loadImages() {
    var promises = [];

    images.forEach(function(imageData) {
      var deferred = Q.defer();

      var rd = fs.createReadStream(imageData.tmpPath);
      rd.on('error', function(err) {
        deferred.reject('Unable to read ' + imageData.tmpPath + ': ' + err);
      });

      var wr = fs.createWriteStream(imageData.src, {flags: 'w'});
      wr.on('error', function(err) {
        deferred.reject('Unable to copy to ' + imageData.src + ': ' + err);
      });
      wr.on('finish', function() {
        updatePlatformConfigData(imageData);
        deferred.resolve();
      });
      rd.pipe(wr);

      promises.push(deferred.promise);
    });

    return Q.all(promises);
  }

  function loadConfigData() {
    var deferred = Q.defer();
    var parser = new xml2js.Parser();

    fs.readFile(settings.configFile, function(err, data) {
      if (err) {
        deferred.reject('Error opening ' + settings.configFile + ': ' + err);

      } else {
        parser.parseString(data, function(err, parsedData) {
          if (err) {
            deferred.reject('Error parsing ' + settings.configFile + ': ' + err);

          } else {
            configData = parsedData;
            deferred.resolve();
          }
        });
      }
    });

    return deferred.promise;
  }

  function updatePlatformConfigData(imageData) {

    try {
      if (!configData.widget.platform) {
        configData.widget.platform = [];
      }

      var platformData = getPlatformConfigData(imageData.platformName);

      if (!platformData) {
        configData.widget.platform.push({ '$': { name: imageData.platformName } });
        platformData = getPlatformConfigData(imageData.platformName);
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

    } catch (err) {
      console.error('Error setting platform config data: ' + err);
    }

  }

  function saveConfigData() {
    var deferred = Q.defer();

    try {
      var builder = new xml2js.Builder();
      var xmlString = builder.buildObject(configData);

      fs.writeFile(settings.configFile, xmlString, function(err) {
        if (err) {
          deferred.reject('Error writing config data: ' + err);
        } else {
          deferred.resolve();
        }
      });

    } catch (err) {
      deferred.reject('Error saving config data: ' + err);
    }

    return deferred.promise;
  }

  function getPlatformConfigData(platformName) {
    if (configData.widget && configData.widget.platform) {
      return _.find(configData.widget.platform, function(d) {
        return d && d.$ && d.$.name == platformName;
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
