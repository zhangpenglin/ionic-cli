var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    xml2js = require('xml2js'),
    colors = require('colors'),
    request = require('request'),
    _ = require('underscore'),
    resSettings = require('./settings.js');


exports.IonicRes = function(resType) {
  var settings = resSettings.ResSettings;
  var platforms = resSettings.ResPlatforms;
  var generateQueue = [];
  var images = [];
  var resTypeDir = path.join(settings.resourceDir, settings[resType + 'Dir']);
  var tmpDir = path.join(settings.resourceDir, settings.resourceTmpDir);
  var sourceImageId, sourceFile, sourceWidth, sourceHeight;
  var configData;

  console.info('Ionic ' + resType + ' resources builder');

  verifySourceImage()
    .then(loadConfigData)
    .then(loadPlatforms)
    .then(uploadSource)
    .then(generateImages)
    .then(loadImages)
    .then(saveConfigData)
    .catch(console.error);

  function verifySourceImage() {
    var deferred = Q.defer();

    for (var x = 0; x < settings.sourceExtensions.length; x++) {
      var tmp = settings[resType + 'SourceFile'] + '.' + settings.sourceExtensions[x];
      if (fs.existsSync(tmp)) {
        sourceFile = tmp;
        break;
      }
    }

    if (!sourceFile) {
      deferred.reject(resType + ' source file not found, skipping resources build');

    } else {
      fs.readFile(sourceFile, function(err, buf) {
        if (err) {
          deferred.reject('Error reading ' + sourceFile);
        } else {
          var md5 = require('MD5');
          sourceImageId = md5(buf);
          deferred.resolve();
        }
      });
    }

    return deferred.promise;
  }

  function loadPlatforms() {
    var deferred = Q.defer();

    try {
      var buildPlatforms = fs.readdirSync('platforms');

      if (buildPlatforms.length) {

        if (!fs.existsSync(settings.resourceDir)) {
          fs.mkdirSync(settings.resourceDir);
        }

        if (!fs.existsSync(resTypeDir)) {
          fs.mkdirSync(resTypeDir);
        }

        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir);
        }

        buildPlatforms.forEach(loadPlatform);
      }

      deferred.resolve();

    } catch (err) {
      deferred.reject('Error loading platforms: ' + err);
    }

    return deferred.promise;
  }

  function loadPlatform(platformName) {
    if (!platforms[platformName]) return;

    var platformResourceDir = path.join(resTypeDir, platformName);

    if (!fs.existsSync(platformResourceDir)) {
      fs.mkdirSync(platformResourceDir);
    }

    _.forEach(platforms[platformName][resType].images, function(imageData) {
      var tmpFilename = (resType + '-' + sourceImageId + '-' + platformName + '-' + imageData.name).replace(/\//g, '-');
      var data = _.clone(imageData);
      _.extend(data, {
        platformName: platformName,
        src: path.join(platformResourceDir, imageData.name),
        tmpPath: path.join(settings.resourceDir, settings.resourceTmpDir, tmpFilename)
      });
      data.nodeName = platforms[platformName][resType].nodeName;
      data.nodeAttributes = platforms[platformName][resType].nodeAttributes;

      if (settings.cacheImages && fs.existsSync(data.tmpPath)) {
        images.push(data);
      } else {
        generateQueue.push(data);
      }

    });
  }

  function uploadSource() {
    var deferred = Q.defer();

    if (generateQueue.length) {
      process.stdout.write(' uploading...');

      var postData = {
        url: settings.apiUrl + settings.apiUploadPath,
        formData: {
          image_id: sourceImageId,
          src: fs.createReadStream(sourceFile)
        },
        proxy: process.env.PROXY || null
      };

      request.post(postData, function optionalCallback(err, httpResponse, body) {
        process.stdout.write('complete\n');

        function reject(msg) {
          try {
            msg += JSON.parse(body).Error;
          } catch (e) {
            msg += body || '';
          }
          deferred.reject(msg);
        }

        if (err || !httpResponse) {
          reject('Failed to post image: ' + err);

        } else if (httpResponse.statusCode >= 500) {
          reject('Image res server temporarily unavailable: ');

        } else if (httpResponse.statusCode == 404) {
          reject('Image res server unavailable: ');

        } else if (httpResponse.statusCode > 200) {
          reject('Invalid upload: ');

        } else {
          try {
            var d = JSON.parse(body);
            sourceWidth = d.Width;
            sourceHeight = d.Height;
            verifySourceDimensions();
            deferred.resolve();
          } catch (e) {
            reject('Error parsing upload response: ');
          }
        }
      });

    } else {
      console.success('Images created from cache');
      deferred.resolve();
    }

    return deferred.promise;
  }

  function verifySourceDimensions() {
    try {
      if (generateQueue.length) {
        generateQueue.forEach(function(imageData) {
          if (sourceWidth < imageData.width || sourceHeight < imageData.height) {
            imageData.skip = true;
            console.error('Source image (' + sourceWidth + 'x' + sourceHeight + ') too small to generate ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')');
          }
        });
      }

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

    console.log(' generating ' + resType + ' ' + imageData.platformName + ' ' + imageData.name + '...');

    var postData = {
      url: settings.apiUrl + settings.apiTransformPath,
      formData: {
        image_id: sourceImageId,
        name: imageData.name,
        width: imageData.width,
        height: imageData.height,
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
        console.success(imageData.platformName + ' ' + imageData.name + ' (' + imageData.width + 'x' + imageData.height + ')');
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
