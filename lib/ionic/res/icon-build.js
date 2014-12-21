var Task = require('../task').Task;

var IonicTask = function() {};

IonicTask.prototype = new Task();

IonicTask.prototype.run = function() {
  require('./res-build').IonicRes('icon');
};

exports.IonicTask = IonicTask;
