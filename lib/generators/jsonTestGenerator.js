var fs    = require("fs")

var tests = []

// Very basic JSON-based test generator
// Useful for replaying repro logs

exports.init = function(context) {
  tests = context.input || JSON.parse(fs.readFileSync(context.inputFile))
  console.log("jsonTestGenerator loaded " + tests.length + " tests.")
}

exports.getNextTests = function() {
  return tests
}

exports.hasNextTests = function() {
  return true
}