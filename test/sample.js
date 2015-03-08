var assert = require('assert'),
    zergRush = require('../lib/zergRush.js'),
    _ = require('lodash')

describe('injecting client tests', function(){
  var files = ['./input/staging_soql_perf.csv']
  _.each(files, function(file){ describe(file, function(){
    var tests = zergRush.makeTests(file)
    _.each(tests, function(test){it(test.description, function(done){test(done)})})
  })})
})
