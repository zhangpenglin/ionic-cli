var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    request = require('request'),
    _ = require('underscore'),
    md5 = require('MD5'),
    resSettings = require('./settings.js'),
    Task = require('../task').Task,
    moduleSettings = require('../../../package.json');


var IonicResources = function() {};

IonicResources.prototype = new Task();

IonicResources.prototype.run = function() {
  if (!fs.existsSync(resSettings.ResSettings.configFile)) {
    console.error('Invalid ' + resSettings.ResSettings.configFile + ' file. Make sure the working directory is a Cordova project.');
    return;
  }

  if (!fs.existsSync('platforms')) {
    console.error('No platforms have been added. Please add a platform, for example: ionic platform add ios');
    return;
  }

  if (!fs.existsSync(resSettings.ResSettings.resourceDir)) {
    fs.mkdirSync(resSettings.ResSettings.resourceDir);
  }

  var argv = require('optimist').argv;

  if (argv.icon || argv.i) {
    console.info('Ionic icon resources generator');
    IonicResources.ionicResources('icon')
      .then(IonicResources.updateConfigData);

  } else if (argv.splash || argv.s) {
    console.info('Ionic splash screen resources generator');
    IonicResources.ionicResources('splash')
      .then(IonicResources.updateConfigData);

  } else {
    console.info('Ionic icon and splash screen resources generator');

    Q.all([
      IonicResources.ionicResources('icon'),
      IonicResources.ionicResources('splash')
    ])
      .then(function(result){
        IonicResources.updateConfigData(_.flatten(result, true));
      });
  }
};

IonicResources.ionicResources = function(resType) {
  var settings = resSettings.ResSettings;
  var platformConfigs = resSettings.ResPlatforms;
  var images = [];
  var generateQueue = [];
  var buildPlatforms = [];
  var tmpDir = path.join(settings.resourceDir, settings.resourceTmpDir);
  var sourceFiles = {};
  var usedPlatforms = {};
  var generatingImages = {};

  return loadPlatforms()
    .then(buildImagesData)
    .then(validateSourceImages)
    .then(queueResourceImages)
    .then(loadSourceImages)
    .then(generateResourceImages)
    .then(loadResourceImages)
    .catch(console.error);

  function loadPlatforms() {
    var deferred = Q.defer();

    try {
      buildPlatforms = fs.readdirSync('platforms');

      if (buildPlatforms.length) {

        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir);
        }

        deferred.resolve();

      } else {
        deferred.reject('No platforms have been added. Please add a platform, for example: ionic platform add ios');
      }

    } catch (err) {
      deferred.reject('Error loading platforms: ' + err);
    }

    return deferred.promise;
  }

  function buildImagesData() {
    var deferred = Q.defer();

    buildPlatforms.forEach(function(platform) {
      if (!platformConfigs[platform]) return;

      var platformResourceDir = path.join(settings.resourceDir, platform);
      var resTypeDir = path.join(platformResourceDir, settings[resType + 'Dir']);

      if (!fs.existsSync(platformResourceDir)) {
        fs.mkdirSync(platformResourceDir);
      }

      if (!fs.existsSync(resTypeDir)) {
        fs.mkdirSync(resTypeDir);
      }

      _.forEach(platformConfigs[platform][resType].images, function(image) {
        var data = _.clone(image);
        _.extend(data, {
          platform: platform,
          src: path.join(resTypeDir, image.name),
          nodeName: platformConfigs[platform][resType].nodeName,
          nodeAttributes: platformConfigs[platform][resType].nodeAttributes,
          resType: resType
        });
        images.push(data);
      });
    });

    deferred.resolve();
    return deferred.promise;
  }

  function validateSourceImages() {
    var deferred = Q.defer();

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

      deferred.reject();

    } else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  function queueResourceImages() {
    var promises = [];

    _.each(usedPlatforms, function(usedPlatform) {
      var deferred = Q.defer();
      promises.push(deferred.promise);

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
                var tmpFilename = sourceFile.imageId + '-' + image.width + 'x' + image.height + '.png';

                image.imageId = sourceFile.imageId;
                image.tmpPath = path.join(tmpDir, tmpFilename);

                if (settings.cacheImages && fs.existsSync(image.tmpPath)) {
                  console.success(image.resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') from cache');

                } else {
                  loadCachedSourceImageData(sourceFile);

                  if (sourceFile.cachedData && (sourceFile.cachedData.width < image.width || sourceFile.cachedData.height < image.height)) {
                    image.skipConfig = true;
                    console.error(image.resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') skipped, source image ' + sourceFile.filename + ' (' + sourceFile.cachedData.width + 'x' + sourceFile.cachedData.height + ') too small');

                  } else {
                    sourceFile.upload = true;
                    generateQueue.push(image);
                  }
                }
              }
            });
            deferred.resolve();

          } catch (e) {
            deferred.reject('Error loading ' + usedPlatform.sourceFilePath + ' md5: ' + e);
          }
        }
      });
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
            cacheSourceImageData(sourceFile);
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

  function cacheSourceImageData(sourceFile) {
    try {
      var data = JSON.stringify({
        width: sourceFile.width,
        height: sourceFile.height
      });
      var cachedImagePath = path.join(tmpDir, sourceFile.imageId + '.json');
      fs.writeFile(cachedImagePath, data, function (err) {
        if (err) console.error('Error writing cacheSourceImageData: ' + err);
      });
    } catch (e) {
      console.error('Error cacheSourceImageData: ' + e);
    }
  }

  function loadCachedSourceImageData(sourceFile) {
    if (!sourceFile.cachedData && sourceFile.cachedData !== false) {
      try {
        var cachedImagePath = path.join(tmpDir, sourceFile.imageId + '.json');
        sourceFile.cachedData = JSON.parse(fs.readFileSync(cachedImagePath));
      } catch (e) {
        sourceFile.cachedData = false;
      }
    }
  }

  function generateResourceImages() {
    var deferred = Q.defer();

    // https://github.com/ferentchak/QThrottle
    var max = settings.generateThrottle - 1;
    var outstanding = 0;

    function catchingFunction(value) {
      deferred.notify(value);
      outstanding--;

      if (generateQueue.length) {
        outstanding++;
        generateResourceImage(generateQueue.pop())
          .then(catchingFunction)
          .fail(deferred.reject);

      } else if (outstanding === 0) {
        deferred.resolve();
      }
    }

    if (generateQueue.length) {
      while (max-- && generateQueue.length) {
        generateResourceImage(generateQueue.pop())
          .then(catchingFunction)
          .fail(deferred.reject);
        outstanding++;
      }
    } else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  function generateResourceImage(image) {
    var deferred = Q.defer();

    var sourceFile = sourceFiles[image.sourceFilePath];

    if (sourceFile.width < image.width || sourceFile.height < image.height) {
      image.skipConfig = true;
      console.error(image.resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') skipped, source image ' + sourceFile.filename + ' (' + sourceFile.width + 'x' + sourceFile.height + ') too small');
      deferred.resolve();

    } else if (generatingImages[image.tmpPath]) {
      console.success(image.resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') generated');
      deferred.resolve();

    } else {
      console.log(' generating ' + resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ')...');
      generatingImages[image.tmpPath] = true;

      var postData = {
        url: settings.apiUrl + settings.apiTransformPath,
        formData: {
          image_id: image.imageId,
          name: image.name,
          platform: image.platform,
          width: image.width,
          height: image.height,
          crop: 'center',
          cli_version: moduleSettings.version
        },
        proxy: process.env.PROXY || null
      };

      var wr = fs.createWriteStream(image.tmpPath, { flags: 'w' });
      wr.on("error", function(err) {
        console.error('Error copying to ' + image.tmpPath + ': ' + err);
        deferred.resolve();
      });
      wr.on("finish", function() {
        if (!image.skipConfig) {
          console.success(image.resType + ' ' + image.platform + ' ' + image.name + ' (' + image.width + 'x' + image.height + ') generated');
          deferred.resolve();
        }
      });

      request.post(postData, function(err, httpResponse, body) {

        function reject(msg) {
          try {
            delete generatingImages[image.tmpPath];
            wr.close();
            fs.unlink(image.tmpPath);
          } catch (err) {}

          try {
            msg += JSON.parse(body).Error;
          } catch (e) {
            msg += body || '';
          }
          image.skipConfig = true;
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

  function loadResourceImages() {
    var promises = [];

    images.forEach(function(image) {
      if (!fs.existsSync(image.tmpPath)) return;

      var deferred = Q.defer();
      promises.push(deferred.promise);

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
    });

    var deferred = Q.defer();
    Q.all(promises).then(function(){
      deferred.resolve(_.filter(images, function(image){
        return image.isValid && !image.skipConfig;
      }));
    });
    return deferred.promise;
  }

};



IonicResources.updateConfigData = function(images) {
  if (!images || !images.length) return;

  var xml2js = require('xml2js');
  var settings = resSettings.ResSettings;
  var configData;
  var madeChanges = false;

  try {
    fs.readFile(settings.configFile, onConfigRead);
  } catch (err) {
    console.error('Error saveConfigData: ' + err);
  }

  function onConfigRead(err, data) {
    if (err) return console.error('Error reading config file: ' + err);

    try {
      var parser = new xml2js.Parser();
      parser.parseString(data, onXmlParse);
    } catch (e) {
      console.error('Error xml2js parseString: ' + e);
    }
  }

  function onXmlParse(err, parsedData) {
    if (err) return console.error('Error parsing config file: ' + err);

    configData = parsedData;
    clearResourcesNodes();
    images.forEach(updateImageNode);
    buildDefaultIconNode();
    writeConfigData();
  }

  function clearResourcesNodes() {
    images.forEach(function(image) {
      if (!image) return;
      var platformConfigData = getPlatformConfigData(image.platform);
      if (platformConfigData && platformConfigData[image.resType]) {
        delete platformConfigData[image.resType];
        madeChanges = true;
      }
    });
  }

  function updateImageNode(image) {
    if (!image) return;

    if (!configData.widget.platform) {
      configData.widget.platform = [];
    }

    var platformConfigData = getPlatformConfigData(image.platform);

    if (!platformConfigData) {
      configData.widget.platform.push({ '$': { name: image.platform } });
      platformConfigData = getPlatformConfigData(image.platform);
    }

    if (!platformConfigData[image.nodeName]) {
      platformConfigData[image.nodeName] = [];
    }

    var node = getResourceConfigNode(platformConfigData, image.nodeName, image.src);
    if (!node) {
      node = { '$': {} };
      platformConfigData[image.nodeName].push(node);
      madeChanges = true;
    }

    image.nodeAttributes.forEach(function(nodeAttribute) {
      node.$[nodeAttribute] = image[nodeAttribute];
    });
  }

  function buildDefaultIconNode() {
    var currentSize = 0;
    var defaultIcon;

    images.forEach(function(image) {
      if (image && image.resType == 'icon' && image.width > currentSize && image.width <= settings.defaultMaxIconSize) {
        currentSize = image.width;
        defaultIcon = image;
      }
    });

    if (defaultIcon) {
      configData.widget.icon = [{ '$': { src: defaultIcon.src } }];
      madeChanges = true;
    }
  }

  function writeConfigData() {
    if (!madeChanges) return;

    try {
      var builder = new xml2js.Builder();
      var xmlString = builder.buildObject(configData);

      fs.writeFile(settings.configFile, xmlString, function(err) {
        if (err) console.error('Error writing config data: ' + err);
      });
    } catch (e) {
      console.error('Error writeConfigData: ' + e);
    }
  }

  function getPlatformConfigData(platform) {
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

exports.IonicTask = IonicResources;
