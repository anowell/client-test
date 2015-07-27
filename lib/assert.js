var assert = require('assert'),
    _ = require('lodash')


// Assertions based on a single response
exports.statusCode = function(response, expected) {
  assert(_.isNumber(response.statusCode), "Response does not have a valid statusCode:\n" + JSON.stringify(response))
  if(_.isArray(expected)) {
    var allowed = _.map(expected, function(v) { return parseInt(v) })
    assert(_.includes(allowed, response.statusCode), "Expected in: " + allowed + "\nReceived: " + response.statusCode)
  } else {
    assert.strictEqual(response.statusCode, parseInt(expected), "Expected: " + expected + "\nReceived: " + response.statusCode)
  }
}

exports.responseBody = function(response, expected) {
  assert(_.isString(response.body), "Response does not have a body:\n" + JSON.stringify(response))
  assert.strictEqual(response.body, expected, "Expected: " + expected + "\nReceived: " + response.body)
}

exports.responseHeader = function(response, expected) {
  var expectedParts = expected.split(": ")
  var actual = response.headers[expectedParts[0].toLowerCase()]
  assert(_.isString(actual), "Response does not have '" + expectedParts[0] + "' header")
  if(expectedParts[1]) {
    assert.strictEqual(actual, expectedParts[1], "Expected: " + expectedParts[1] + "\nReceived: " + actual)
  }
}

exports.jsonResultCount = function(response, expected) {
  assert(_.isString(response.body), "Response does not have a body:\n" + JSON.stringify(response))

  var expectedCount = parseInt(expected)
  //console.log("checking for " + expectedCount + " rows")
  var results = JSON.parse(response.body)

  assert(_.isArray(results), "Expected JSON Array. Received: " + response.body)
  assert.strictEqual(results.length, expectedCount, "received " + results.length + " rows, expected " + expectedCount)
}

exports.jsonResult = function(response, expected) {
  assert(_.isString(response.body), "Response does not have a body:\n" + JSON.stringify(response))

  // console.log("deep comparison of parsed JSON")
  var expectedObj = (_.isArray(expected) || _.isObject(expected)) ? expected : JSON.parse(expected)
  var responseObj = JSON.parse(response.body)
  assert.deepEqual(responseObj, expectedObj, "\nExpected: " + JSON.stringify(expectedObj) + "\nReceived: " + response.body)
}

exports.jsonSubset = function(response, expected) {
  var expectedObj = (_.isArray(expected) || _.isObject(expected)) ? expected : JSON.parse(expected)
  var responseObj = JSON.parse(response.body)
  assertSubset(responseObj, expectedObj, "Expected subset: " + JSON.stringify(expectedObj) + "\nReceived: " + response.body)
}

var assertSubset = function(haystack, needle, message) {
  message = message || ""
  // Currently arrays must be same length and order... I *think* this is the right behavior
  if(_.isArray(haystack) && _.isArray(needle) && haystack.length == needle.length) {
    _.each(_.zip(haystack, needle), function(pair) { assertSubset(pair[0], pair[1], message) })
  } else if(_.isObject(haystack) && _.isObject(needle)) {
    _.forOwn(needle, function(value, key) {
      assert(_.has(haystack, key), message + "\nMissing key: " + key + " in " + JSON.stringify(haystack))
      assertSubset(haystack[key], value, message)
    })
  } else {
    assert.strictEqual(haystack, needle, message + "\nExpected: " + needle + "\nFound: " + haystack)
  }
}

exports.jsonUnorderedArray = function(response, expected) {
  assert(_.isString(response.body), "Response does not have a body:\n" + JSON.stringify(response))

  // console.log("deep comparison of parsed JSON ignoring order (slow)")
  var expectedArr = _.isArray(expected) ? expected : JSON.parse(expected)
  var responseArr = JSON.parse(response.body)
  assert(_.isArray(responseArr), "Expected JSON Array. Received: " + response.body)

  var alreadyFound = []
  _.each(responseArr, function(obj) {
    for(var j=0; j<expectedArr.length; j++) {
      if(_.isEqual(obj, expectedArr[j]) && !alreadyFound[j]) {
        alreadyFound[j] = true
        return
      }
    }
    assert.fail(responseArr, expectedArr,
      "Failed to find object in JSON array. Missing [at least one instance of]:\n" + JSON.stringify(obj))
  })
}

exports.jsonKeys = function(response, expected) {
  assert(_.isString(response.body), "Response does not have a body:\n" + JSON.stringify(response))

  //console.log("Checking for keys: " + expected)
  var results = JSON.parse(response.body)

  // Wrap non-array objects in array for sake of iterator
  if(!_.isArray(results)) { results = [results] }
  assert.ok(results.length > 0, "No results to compare")

  _.each(results, function(result){
    expectedKeys = (_.isObject(expected)) ? expected : JSON.parse(expected)
    resultKeys = _.keys(result)
    _.each(expectedKeys, function(key) {
      assert.ok( result.hasOwnProperty(key), "Missing key " + key + " in result: \n" + JSON.stringify(result))
    })
    assert.strictEqual(expectedKeys.length, resultKeys.length, "Expected keys: " + JSON.stringify(expectedKeys) + " but found extra keys in: " + JSON.stringify(result))
  })
}


// A bit experimental, but seems to simplify definining one-off assertions directly in a test
// YAML example:
// assert:
// - callback: !!js/function >
//     function handle(response) {
//       this.assert(response.statusCode < 500, 'Expected <500\nReceived '+response.statusCode)
//     }
exports.callback = function(response, callback) {
  var callbackFn = callback
  if(_.isString(callback)) {
    callbackFn = eval(callback)
  }
  assert(_.isFunction(callbackFn), "Expected: function \nReceived: " + callback)

  // Put _, assert, and require on the 'this' object of the callback
  callbackFn.call({ assert: assert, require: require, _: _ }, response)
}




