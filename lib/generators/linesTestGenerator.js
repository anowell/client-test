var fs    = require("fs"),
    _     = require("lodash"),
    url   = require('url')



var tests = []

exports.init = function(context) {
  tests = makeTests(context)
}

exports.getNextTests = function() {
  return tests
}

exports.hasNextTests = function() {
  return true
}
/*
  linesTestGenerator:
    Each line is a test
    Each test is one or or more absolute URLs (semi-colon delimited)
      OR
    Each test may be a single path (with one or more hostnames specified by context.hostnames)


  Examples of valid lines using absolute URLs (context.hostnames should not be specified):
    http://mydomain.com/some_path
    http://mydomain.com/some_path; http://mydomain.com/some_path?enable=experiment123

  Example of valid lines using path ASSUMING context.hostnames is specified
    /some_path
    /some/other/path.html?with=params&to=go

  Not valid because I'm not currently interested in dealing with cross-product of paths and hostnames:
    /some_path; /some_other_path
*/

var makeTests = function(context){
  var lines = fs.readFileSync(context.inputFile).toString().split('\n')
  var tests = _.map( lines, function(line) {
    var path;
    if(context.hostnames && !_.isEmpty(context.hostname)) {
      path = url.parse(line).path
      console.log(typeof context.hostnames + ": " + path);
      return { testUrls : _.each(context.hostnames, function(host) { url.resolve(host, path) }) }
    }

    return { testUrls : line.split(';'), name : path || line }
  })

  console.log('read ' + tests.length + " tests from input file")
  return tests;
}
