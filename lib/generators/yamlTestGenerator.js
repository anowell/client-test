var fs    = require("fs"),
    _     = require("lodash"),
    url   = require("url"),
    path  = require("path"),
    yaml  = require("js-yaml")

//
// Yaml Test Generator
//
//
// Format expects 2 root properties:
//    defaults: an object of default TestDefition properties
//    tests: an array of zerg-rush TestDefinitions that are merged with the defaults
//
// In both cases, a few deviations from the standard TestDefinition
//   - May specify 'path' to be appended to hostname instead of a full url
//   - May specify use relative path in specifying 'dataFile', e.g. { dataFile: my_file.json }
//   - May specify a global dataDir. { dataDir : path/to/data/files }, { dataFile : my_file.json }
//   - May specify HTTP method and path (or url) as {method:path}, e.g., { post : "/route/to/foo" }
//   - May specify many of the nodeRequest driver options top-level: data, dataFile, headers, auth, timeout, method
//



/// Self-register generator
exports.register = function() {
  return require('zerg-rush').registerGenerator('yamlTestGenerator', exports)
}

var _tests = []
exports.init = function(context) {
  var doc = yaml.load(context.input || fs.readFileSync(context.inputFile))
  var config = yaml.load(_.template(fs.readFileSync(context.configFile))({'env': process.env}))
  var defaults = _.merge({}, doc.defaults, config.defaults)

  var phase = context.phase || "tests"
  if(_.isArray(doc[phase])) {
    _tests = _.map(doc[phase], function(test) { return exports.makeTestVariations(test, defaults, context) })
    _tests = _.flatten(_tests, true)
    _tests = _.filter(_tests, function(test) { return !_.has(test, "disabled") })
  } else if(!_.isEmpty(doc[phase])){
    console.log("Not a valid test phase (expected Array): " + phase)
  }
}

exports.getNextTests = function() {
  var tests = _tests
  _tests = []
  return tests
}

exports.hasNextTests = function() {
  return _tests.length > 0
}

var replaceAll = function(str, o, n) { return str.split(o).join(n) }
var rand = function(max) { return Math.floor(Math.random() * max); }

// Exporting for reuse by custom yaml-generators
exports.makeTestVariations = function(test, defaults, context) {
  var testVariations = []

  if(_.isArray()) {
    var variations = test.variations
    delete test.variations
    for(var i=0; i<variations.length; ++i) {
      test.variation = varations[i]
      testVariations.push(makeTest(test, defaults, context))
    }
  } else {
    var variationCount = test.variations || 1
    delete test.variations
    for(var i=0; i<variationCount; ++i) {
      if(variationCount > 1) { test.variation = i }
      testVariations.push(makeTest(test, defaults, context))
    }
  }

  return testVariations
}

var makeTest = function(test, defaults, context) {
  // Customize merge to concat arrays
  var testDefinition = _.merge({}, defaults, test, function(a, b) {
    if (_.isArray(a)) { return a.concat(b); }
  })

  // Interpolate the whole testDefinition, to allow for stuff like: <%= variation %>
  var interpolateContext = _.merge({env: process.env, rand: rand}, testDefinition)
  testDefinition = yaml.load(_.template(yaml.dump(testDefinition))(interpolateContext))

  // Helpers for constructing 'url' string
  if(testDefinition.path) {
    if(_.isEmpty(testDefinition.hostname)){ throw "No hostname has been specified." }
    testDefinition.url = url.resolve(testDefinition.hostname, testDefinition.path)
  } else {
    _.each(['get','put','patch','post','delete'], function (verb) {
      if(testDefinition[verb]) {
        testDefinition.driverOptions.method = verb
        testDefinition.url = url.resolve(testDefinition.hostname || "", testDefinition[verb])
        return false
      }
    })
  }

  if(_.isEmpty(testDefinition.url) && _.isEmpty(testDefinition.url)) {
    throw("Don't know how to build a zerg-rush TestDefinition from this input: " + JSON.stringify(testDefinition))
  }


  testDefinition.driverOptions = testDefinition.driverOptions || {}

  // Allow data to be specified in file specified by 'dataFile' property
  if(_.isString(testDefinition.dataFile)) {
    var dir = path.dirname(context.inputFile)
    if(testDefinition.dataDir) { dir = path.resolve(dir, testDefinition.dataDir) }
    testDefinition.dataFile = path.resolve(dir, testDefinition.dataFile)
  }

  // Helpers for constructing 'driverOptions' object
  _.each(['tag','data', 'dataFile', 'auth','timeout', 'method'], function (prop) {
    if(testDefinition[prop]) {
      testDefinition.driverOptions[prop] = testDefinition[prop]
      delete testDefinition[prop]
    }
  })
  if(testDefinition.headers) {
    testDefinition.driverOptions.headers = _.merge({}, testDefinition.driverOptions.headers, testDefinition.headers)
    delete testDefinition.headers
  }

  // Guess the Content-Type if not explicitly set
  if(_.isString(testDefinition.driverOptions.data)) {
    testDefinition.driverOptions.headers = _.merge({ "Content-Type": "text/plain"}, testDefinition.driverOptions.headers)
  } else if(_.isObject(testDefinition.driverOptions.data)) {
    testDefinition.driverOptions.headers = _.merge({ "Content-Type": "application/json"}, testDefinition.driverOptions.headers)
  }


  // Helpers for modifying 'url' string
  if(testDefinition.params) {
    var params = _.keys(testDefinition.params).map(function(k) { return k+"="+testDefinition.params[k] })
    var separator = (testDefinition.url.indexOf('?') === -1) ? '?' : '&'
    testDefinition.url = testDefinition.url + separator + params.join("&")
    delete testDefinition.params
  }

  // Salt query string which may work to get around simple caching
  if(context.saltQueries) {
    var saltString = '_=test_salt_' + new Date().getTime().toString()
    testDefinition.url = _.map(testDefinition.url, function(t) {
      var separator = (t.indexOf('?') === -1) ? '?' : '&'
      return t + separator + saltString
    })
  }

  return testDefinition
}
