var fs = require('fs'),
    os = require('os'),
    request = require('request'),
    ncp = require('ncp').ncp,
    path = require('path'),
    shelljs = require('shelljs/global'),
    unzip = require('unzip'),
    IonicTask = require('./task').IonicTask;

var argv = require('optimist').argv;


var IonicUpdateIonicTask = function() {
};

IonicUpdateIonicTask.prototype = new IonicTask();

IonicUpdateIonicTask.prototype.run = function(ionic) {
};
