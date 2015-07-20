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
//   - May specify assertions as { assertionName : expectation } instead of { check: assertionName, expect: expectation }
//   - May specify json file as an assertion, e.g. { jsonResult: path/to/expected.json }
//   - May specify a global jsonPath. { jsonDir : path/to/json }, { jsonResult : expected.json }
//   - May specify HTTP method and path (or url) as {method:path}, e.g., { post : "/route/to/foo" }
//   - May specify many of the nodeRequest driver options top-level: data, headers, auth, timeout, method
//
// TODO: string replacement for randomized input
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

  _tests = _.map(doc.tests, function(test) { return exports.makeTestVariations(test, defaults, context) })
  _tests = _.flatten(_tests, true)
  _tests = _.filter(_tests, function(test) { return !_.has(test, "disabled") })

  console.log("yamlTestGenerator loaded " + _tests.length + " tests.")
}

exports.getNextTests = function() {
  return _tests
}

exports.hasNextTests = function() {
  return true
}

var replaceAll = function(str, o, n) { return str.split(o).join(n) }
// var rand = function(max) { return Math.floor(Math.random() * max); }

// Exporting for reuse by custom yaml-generators
exports.makeTestVariations = function(test, defaults, context) {
  var variations = []

  var variationCount = test.variations || 1
  for(var i=0; i<variationCount; ++i) {
    delete test.variations;
    variations.push(makeTest(test, defaults, context))
  }
  return variations
}

var makeTest = function(test, defaults, context) {

  var testDefinition = _.merge({}, defaults, test, function(a, b) {
    // Customize merge to concat arrays
    if (_.isArray(a)) { return a.concat(b); }
  })
  var hostname = testDefinition.hostname

  if(testDefinition.url) {
    // NOOP: url already defined
  } else if(testDefinition.path) {
    if(_.isEmpty(hostname)){ throw "No hostname has been specified." }
    testDefinition.url = url.resolve(hostname, testDefinition.path)
  } else {
    _.each(['get','put','patch','post','delete'], function (verb) {
      if(testDefinition[verb]) {
        testDefinition.driverOptions.method = verb
        testDefinition.url = url.resolve(hostname || "", testDefinition[verb])
        return false
      }
    })
  }

  if(_.isEmpty(testDefinition.url) && _.isEmpty(testDefinition.url)) {
    throw("Don't know how to build a zerg-rush TestDefinition from this input: " + JSON.stringify(testDefinition))
  }

  if(testDefinition.assert) {
    if(!_.isArray(testDefinition.assert)) { throw("Test assert property must be an array: " + testDefinition.assert) }

    // Convert [ { myAssertion : myExpectation }] to [ { check : myAssertion, expect : myExpectation }]
    testDefinition.assert = _.map(testDefinition.assert, function(assert) {
      return _.mapValues(assert, function(expect) {
        // Allow expectation to be specified in a JSON file
        if(_.isString(expect) && expect.match(/\.json$/)) {
          var dir = path.dirname(context.inputFile)
          if(testDefinition.jsonDir) { dir = path.resolve(dir, testDefinition.jsonDir) }
          return fs.readFileSync(path.resolve(dir, expect)).toString()
        }
        return expect
      })
    })
  }

  testDefinition.driverOptions = testDefinition.driverOptions || {}

  _.each(['tag','data','auth','timeout', 'method'], function (prop) {
    if(testDefinition[prop]) {
      testDefinition.driverOptions[prop] = testDefinition[prop]
    }
  })

  if(testDefinition.headers) {
    testDefinition.driverOptions.headers = _.merge({}, testDefinition.driverOptions.headers, testDefinition.headers)
  }

  if(testDefinition.params) {
    var params = _.keys(testDefinition.params).map(function(k) { return k+"="+testDefinition.params[k] })
    testDefinition.url = _.map(testDefinition.url, function(t) {
      var separator = (t.indexOf('?') === -1) ? '?' : '&'
      return t + separator + params.join("&")
    })
  }

  if(context.saltQueries) {
    var saltString = '_=test_salt_' + new Date().getTime().toString()
    testDefinition.url = _.map(testDefinition.url, function(t) {
      var separator = (t.indexOf('?') === -1) ? '?' : '&'
      return t + separator + saltString
    })
  }

  return testDefinition
}
