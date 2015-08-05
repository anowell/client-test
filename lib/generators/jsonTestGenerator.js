var fs    = require("fs"),
    logger= require('../logger.js')

var tests = []

// Very basic JSON-based test generator
// Useful for replaying repro logs

exports.init = function(context) {
  tests = context.input || JSON.parse(fs.readFileSync(context.inputFile))
  logger.debug("jsonTestGenerator loaded " + tests.length + " tests.")
}

exports.getNextTests = function() {
  return tests
}

exports.hasNextTests = function() {
  return true
}