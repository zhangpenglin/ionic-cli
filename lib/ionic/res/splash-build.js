var Task = require('../task').Task;

var IonicTask = function() {};

IonicTask.prototype = new Task();

IonicTask.prototype.run = function() {
  require('./res-build').IonicRes('splash');
};

exports.IonicTask = IonicTask;
