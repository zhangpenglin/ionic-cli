/*
 _             _      
(_)           (_)     
 _  ___  _ __  _  ___ 
| |/ _ \| '_ \| |/ __|
| | (_) | | | | | (__ 
|_|\___/|_| |_|_|\___|

http://ionicframework.com/

A utility for starting and administering Ionic based mobile app projects.
Licensed under the MIT license. See LICENSE For more.

Copyright 2013 Drifty (http://drifty.com/)
*/
                   
var IonicStartTask = require('./ionic/tasks/start.js').IonicStartTask;
var IonicUpdateIonicTask = require('./ionic/tasks/update-ionic.js').IonicUpdateIonicTask;

var argv = require('optimist').argv;

var TASK_COL_PADDING = 20;

var TASKS = [
  {
    title: 'start',
    name: 'start',
    task: IonicStartTask
  },
  {
    title: 'update-ionic',
    name: 'update-ionic',
    task: IonicUpdateIonicTask
  }
];

Ionic = function() {};

Ionic.prototype = {
  _tryBuildingTask: function() {
    if(argv._.length == 0) {
      return false;
    }
    var taskName = argv._[0];

    return this._getTaskWithName(taskName);
  },

  _getTaskWithName: function(name) {
    for(var i = 0; i < TASKS.length; i++) {
      var t = TASKS[i];
      if(t.name === name) {
        return t;
      }
    }
  },

  _printGenericUsage: function() {
    process.stderr.write('Usage: ionic task args\n');
    process.stderr.write('\n\n===============\nAvailable tasks:\n\n');
    
    process.stderr.write('  help');
    for(var i = 0; i < TASK_COL_PADDING - 4; i++) {
      process.stderr.write(' ');
    }
    process.stderr.write('Get help for the ionic utility or one of its tasks\n');

    for(var i = 0; i < TASKS.length; i++) {
      var task = TASKS[i];
      var padding = TASK_COL_PADDING - task.name.length;
      process.stderr.write('  ' + task.name);
      while(padding > 0) {
        process.stderr.write(' ');
        padding--;
      }
      process.stderr.write(task.task.HELP_LINE + '\n');
    }

    process.stderr.write('\n');
    process.exit(1);
  },

  _printIonic: function() {
    process.stdout.write('\n   __          __  \n');
    process.stdout.write('| /  \\ |\\ | | /  `\n' + '| \\__/ | \\| | \\__,\n\n');
  },

  _printHelp: function() {
    var taskName = argv._[1];
    if(!taskName) { return; }
    for(var i = 0; i < TASKS.length; i++) {
      var task = TASKS[i];
      if(task.name == taskName) {
        process.stdout.write('Task: ' + task.title + '\n\n');
        process.stdout.write('Usage: ' + task.task.USAGE + '\n\n');
        break;
      } 
    }
  },

  _loadTaskRunner: function(which) {

  },

  run: function() {
    var task = this._tryBuildingTask();
    if(!task) {
      this._printIonic();
      if(argv._[0] == 'help') {
        this._printHelp();
        if(argv._[1]) {
          return;
        }
      }
      return this._printGenericUsage();
    }

    console.log('Running', task.title, 'task...')

    var taskObj = new task.task();
    taskObj.run(this);
  },

  fail: function(msg) {
    process.stderr.write(msg + '\n');
    process.exit(1);
  },

};

exports.Ionic = Ionic;
