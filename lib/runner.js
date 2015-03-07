var fs    = require("fs"),
    _     = require("lodash"),
    async = require("async"),
    assert= require('assert'),
    registration = require('./registration.js'),
    jstat = require('jStat').jStat


var _testcaseTemplate;
var _suiteTemplate;
var _responseTimes = [];

var _suiteResults = {
  name : "Default",
  errorCount: 0,
  failureCount: 0,
  testCount: 0
}

exports.makeTimeLog = function(){
  var times = {}
  function log_time(key){ times[key] = new Date().getTime() }
  log_time("start")
  return {
    log:          log_time,
    clock:        function(k)  { return times[k] },
    fromStart:    function(k)  { return times[k] - times["start"] },
    diff:         function(f,s){ return times[s] - times[f] },
    keys:         function()   { return _.keys(times) }
  }
}

var getStats = function() {
  var arrlen = _responseTimes.length,
      arr = _responseTimes.slice().sort(function(a,b) { return a-b });

  if(arrlen == 0) { return {} }

  var jobj = jstat(arr);
  return {
    count:  arrlen,
    min:    arr[0],
    max:    arr[arrlen-1],
    avg:    jobj.mean(),
    stdev:  jobj.stdev(),
    meddev: jobj.meddev(),
    p50:    arr[ Math.round((arrlen) * 1 / 2) - 1 ],
    p75:    arr[ Math.round((arrlen) * 3 / 4) - 1 ],
    p90:    arr[ Math.round((arrlen) * 9 / 10) - 1 ],
    p95:    arr[ Math.round((arrlen) * 95 / 100) - 1 ],
    p99:    arr[ Math.round((arrlen) * 99 / 100) - 1 ]
  }
}

var red = function(str){return "\x1b[31m" + str + "\x1b[39m"};
var green = function(str){return "\x1b[32m" + str + "\x1b[39m"};
var bold = function(str){return "\x1b[1m" + str + "\x1b[22m"};

var _firstTestDefinition = true
exports.runTest = function(testDefinition, callback) {
  var time = exports.makeTimeLog()
  var runtimeDefinition = _.merge({}, exports.runOptions.defaultTestDefinition, testDefinition)

  // We're being really flexible here:
  //   testUrl or testUrls
  //   string or array of strings or function returning either a string or an array of strings
  //   a single string can even be multiple URLs, semicolon-delimited
  // As long as we end up with an array of URL strings, we're good
  var testUrls = runtimeDefinition.testUrls || runtimeDefinition.testUrl
  testUrls = (_.isFunction(runtimeDefinition.testUrls)) ? runtimeDefinition.testUrls() : runtimeDefinition.testUrls
  if(_.isString(runtimeDefinition.testUrls)) {
    testUrls = testUrls.split(';')
  }
  delete runtimeDefinition.testUrl
  runtimeDefinition.testUrls = testUrls

  if(exports.runOptions.disableAssertions) {
    delete runtimeDefinition.assert
  }

  // Now we can serialize runtimeDefinition to the repro log
  // console.log(runtimeDefinition)
  if(exports.loggers.reproLog) {
    var reproLine = "  " + JSON.stringify(runtimeDefinition)
    if(_firstTestDefinition) {
      _firstTestDefinition = false
    } else {
      reproLine = ",\n" + reproLine
    }
    exports.loggers.reproLog.write(reproLine)
  }

  var driverName = runtimeDefinition.driver || 'nodeRequest'
  var driver = registration.getDriver(driverName)

  var testcaseResult = {
    name: testDefinition.name || testUrls.join(" "),
    failures: [],
    errors: []
  }

  var verboseTrace = ""
  var endpointTasks = _.map( testUrls, function(url) {
    return function(cb) {
      driver.run(url, runtimeDefinition.driverOptions, time, exports.loggers, function(response) {
        _responseTimes.push(response.responseTime);

        if (runtimeDefinition.driverOptions && runtimeDefinition.driverOptions.consoleTestDefinition){
          console.log(runtimeDefinition);
        }

        // Handle response assertions
        _.each(runtimeDefinition.assert, function(a) {
          // console.log("Asserting '" + a.check + "' - expecting: " + a.expect)
          try {
            registration.getAssertion(a.check)(response, a.expect, url)
          } catch(e) {
            if(e && e.message) {
              verboseTrace += red("FAILED: ") + "assert " + a.check + '\n'
              verboseTrace += url + '\n' + e.message + '\n'
              testcaseResult.failures.push({
                message: "FAILED assert " + a.check + ": " + url,
                type: 'assert:' + a.check,
                backtrace: e.stack
              })
            } else {
              verboseTrace += red("ERROR: ") + e + '\n'
              testcaseResult.errors.push({
                message: "ERROR: " + e ,
                type: 'assert:' + a.check,
                backtrace: "assert:" + a.check + ": " + url
              })

            }
          }
        })

        cb(null, response)
      })

    }
  })

  var endTime, startTime = new Date().getTime()

  async.parallel( endpointTasks, function(err, results) {
      // Compare results from multiple endpoints
      if( results.length > 1 ) {
        _.each(runtimeDefinition.compare, function(c){
          try {
            registration.getComparator(c)(results, runtimeDefinition.testUrls)
          } catch(e) {
            verboseTrace += red("FAILED: ") + "compare " + c + '\n' + testUrls.join("\n") + '\n'
            if(e && e.message) {
              verboseTrace += e.message + '\n'
              testcaseResult.failures.push({
                message: "FAILED compare:" + c + ": " + testUrls.join(" "),
                type: 'compare:' + c,
                backtrace: e.stack
              })
            } else {
              verboseTrace += red("ERROR: ") + e + '\n'
              testcaseResult.errors.push({
                message: "ERROR: " + e ,
                type: 'compare:' + c,
                backtrace: "compare:" + c + ": \n" + testUrls.join("\n")
              })
            }

          }
        })
      }

      endTime = new Date().getTime()
      testcaseResult.duration = endTime - startTime

      _suiteResults.testCount += 1
      if(testcaseResult.errors.length > 0) {
        _suiteResults.errorCount += 1
        console.log(red('✖ ') + testDefinition.name)
      } else if (testcaseResult.failures.length > 0) {
        _suiteResults.failureCount += 1
        console.log(red('✖ ') + testDefinition.name)
      } else {
        console.log(green('✔ ') + testDefinition.name)
      }
      if(verboseTrace) {
        console.log(verboseTrace)
      }

      // JUnit Logging
      if( exports.runOptions.junitLog) {
        exports.loggers.junitResults.write(_testcaseTemplate({testcase: testcaseResult}))
      }

      callback()
  })
}


exports.run = function(options, callback){
  _testcaseTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-testcase.xml').toString())
  _suiteTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-suite.xml').toString())

  _suiteResults.name = options.name;
  exports.runOptions = options;
  exports.loggers = {};

  exports.loggers.responsePerfFile = fs.createWriteStream(
    "output/perf/responsePerf.tsv",
    { flags: 'a'}
  )
  exports.loggers.domPerfFile = fs.createWriteStream(
    "output/perf/domPerf.tsv",
    { flags: 'a'}
  )

  if(options.reproLog) {
    exports.loggers.reproLog = fs.createWriteStream(
      options.reproLog,
      { flags: 'w+' }
    )
    exports.loggers.reproLog.write('[\n')
  }

  if(options.junitLog) {
    exports.loggers.junitResults = fs.createWriteStream(
      options.junitLog + '.tmp',
      { flags: 'w+' }
    )
  }

  var generator = registration.getGenerator(options.generatorContext.name)
  generator.init(options.generatorContext)

  var testsStarted = 0
  var concurrency = options.concurrency || 1
  var totalRequests, testsRemaining
  var startTime, endTime

  var q = async.queue( function(test, callback) {
    try {
      exports.runTest(test, callback)
    } catch(e) {
      console.log("RUNNER EXCEPTION during test execution:")
      console.log(test)
      console.log(e)
    }
  }, concurrency )


  var enqueueTests = function(tests) {
    if(tests.length === 0) {
      console.log("Nothing to enqueue")
      return;
    }
    var nextTests = tests.slice(0, testsRemaining)
    nextTests = _.map(nextTests, function(test) {
      // I'm not carrying around a bag of junk properties just cuz your generator doesn't follow spec
      return _.pick(test,
        'name',           // OPTIONAL: name of test case
        'testUrl',        // REQUIRED*: URL to test
        'testUrls',       // REQUIRED*: Alternative to testUrl
        'driver',         // OPTIONAL: driver responsible for issuing request (default = nodeRequest)
        'driverOptions',  // OPTIONAL: options passed through to the driver
        'assert',         // OPTIONAL: assertion to execute against the response object
        'compare'         // OPTIONAL: comparator to execute against a set of response objects (if testUrls.length > 1)
      )
    })

    testsStarted += nextTests.length
    testsRemaining = totalRequests - testsStarted

    console.log('Queueing ' + nextTests.length + ' tests now. Total queued so far: ' + testsStarted + ' of ' + totalRequests + ' tests.')
    q.push(nextTests)
  }

  var shuffle = function(arr) {
    var cursor = arr.length
    var temp, randIndex

    while(0 != cursor) {
      randIndex = Math.floor(Math.random() * cursor)
      cursor -= 1
      temp = arr[cursor]
      arr[cursor] = arr[randIndex]
      arr[randIndex] = temp
    }

    return arr
  }

  // use to delay execution when the generator is starving us
  var withNextTests = function(cb) {
    if(!generator.hasNextTests()) {
      cb([])
    }

    var next = generator.getNextTests()
    if(options.shuffle) {
      next = shuffle(next)
    }
    if(next.length === 0) {
      setImmediate( function() { withNextTests(cb) } )
    } else {
      cb(next)
    }
  }


  q.empty = function(){
    if (testsRemaining > 0 && generator.hasNextTests()) {
      var tests = generator.getNextTests()

      if(options.shuffle) {
        next = shuffle(next)
      }

      if(tests.length === 0) {
        console.log("WARNING: concurrency dropping - test generator is starving the test runner")
        return withNextTests(enqueueTests)
      }

      enqueueTests(tests)
    }
  }


  q.drain = function(){
    if(testsRemaining > 0 && generator.hasNextTests()) {
      console.log("WARNING: test queue has been drained early - starving with 0 outstanding requests - waiting VERY patiently")
      return withNextTests(enqueueTests)
    }

    endTime = new Date().getTime()
    _suiteResults.duration = endTime - startTime

    if(options.reproLog) {
      exports.loggers.reproLog.write('\n]\n')
    }

    if(options.junitLog) {
      var loggedResults = fs.readFileSync(options.junitLog + '.tmp').toString()
      var junitLog = _suiteTemplate( { suite: _suiteResults, testcases: loggedResults } )
      fs.writeFileSync(options.junitLog, junitLog, { flags: 'w+' })
      fs.unlinkSync(options.junitLog + '.tmp')
    }

    _suiteResults.stats = getStats()

    var formatRollup = (_suiteResults.failureCount === 0 && _suiteResults.errorCount === 0) ? green : red
    console.log(formatRollup("Completed " + _suiteResults.testCount + " tests. " +
      _suiteResults.failureCount + " failures and "+ _suiteResults.errorCount + " errors in " +
      _suiteResults.duration/1000 + " seconds."))

    callback(_suiteResults)
  }


  // This is a bit ugly, but basically delays calling enqueueTests
  // until we've generated at least enough tests to feed the concurrency
  // otherwise we'll be starving the queue from the start
  if(generator.hasNextTests()) {
    var initialTests = []
    var buildInitialQueue = function(tests) {
      if(tests.length > 0) {
        initialTests = initialTests.concat(tests)
        console.log("Adding " + tests.length + " to initial tests. " + initialTests.length + " total ready.")
      }
      if(initialTests.length < options.concurrency && generator.hasNextTests()) {
        withNextTests( buildInitialQueue )
      } else {
        console.log("Ready to start testing.")

        totalRequests = options.totalRequests || initialTests.length
        testsRemaining = totalRequests
        startTime = new Date().getTime()
        enqueueTests(initialTests)
      }
    }
    buildInitialQueue([])
  }
}
