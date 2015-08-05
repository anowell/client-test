var util = require('util')

// A minimal stdout logger that is easy to replace with most major loggers
// To replace this logger, just be sure the replacement implements debug/info/warn/error
var red = "\x1b[31m"
var green = "\x1b[32m"
var white = "\x1b[39m"
var gray = "\x1b[90m"
var yellow = "\x1b[33m"

var logger = {
  config: {debug: false},
  debug: function(msg) {
    if(logger.config.debug) {
        process.stdout.write(gray);
        console.log(msg);
        process.stdout.write(white)
    }
  },
  info: function(msg) {
    console.log(msg)
  },
  warn: function(msg) {
    process.stdout.write(yellow+"WARNING: ");
    console.log(msg);
    process.stdout.write(white)
  },
  error: function(msg) {
    process.stdout.write(red+"ERROR: ");
    console.log(msg)
    process.stdout.write(white)
  },
  pass: function(msg) {
    logger.info(green + '✔ ' + white + msg)
  },
  fail: function(msg) {
    logger.info(red + '✖ ' + white + msg)
  },
  replaceLogger: function(altLogger) {
    var keys = ["debug", "info", "warn", "error", "pass", "fail"]
    for(var i=0; i<keys.length; ++i) {
      var key = keys[i]
      if(typeof altLogger[key] === 'function') {
        logger[key] = altLogger[key]
      } else {
        logger.warn("Replacement logger missing function: " + key)
      }
    }
  }
}

module.exports = logger
