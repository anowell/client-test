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

  if(!arrlen) { return {} }

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
  //   string or function returning a string
  var url = runtimeDefinition.url
  url = (_.isFunction(runtimeDefinition.url)) ? runtimeDefinition.url() : runtimeDefinition.url
  runtimeDefinition.url = url

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



  // Handoff to driver to make the request
  var endTime, startTime = new Date().getTime()
  driver.run(url, runtimeDefinition.driverOptions, time, exports.loggers, function(response) {
    endTime = new Date().getTime()
    _responseTimes.push(response.responseTime);

    var name = testDefinition.name || _.compact([
      (runtimeDefinition.driverOptions.method || "get").toUpperCase(),
      url
    ]).join(' ')

    var testcaseResult = {
      name: name,
      failures: [],
      errors: []
    }

    var errorTrace = ""
    var verboseTrace = ""

    var assertions = []

    // Coerce into array of assertions
    if(_.isPlainObject(runtimeDefinition.assert)) {
      runtimeDefinition.assert = _.map(runtimeDefinition.assert, function(v, k) {
        var obj = {}
        obj[k] = v
        return obj
      })
    }

    // Handle response assertions
    _.each(runtimeDefinition.assert, function(a) {
      var isSuccess = false
      _.forOwn(a, function(expect, check) {
        // console.log("Asserting '" + check + "' - expecting: " + expect)
        try {
          registration.getAssertion(check)(response, expect, url)
          isSuccess = true
        } catch(e) {
          if(e && e.message) {
            errorTrace += red("FAILED: ") + "assert " + check + '\n'
            errorTrace += url + '\n' + e.message + '\n'
            testcaseResult.failures.push({
              message: "FAILED assert " + check + ": " + url,
              type: 'assert:' + check,
              backtrace: e.stack
            })
          } else {
            errorTrace += red("ERROR: ") + e + '\n'
            testcaseResult.errors.push({
              message: "ERROR: " + e ,
              type: 'assert:' + check,
              backtrace: "assert:" + check + ": " + url
            })
          }
          if(runtimeDefinition.verbose) {
            verboseTrace = response
          }
          return false // Early exit from _.forOwn
        }
      })
      return isSuccess // Only allow one failed assertion per url
    })
    testcaseResult.duration = endTime - startTime

    _suiteResults.testCount += 1
    if(testcaseResult.errors.length > 0) {
      _suiteResults.errorCount += 1
      console.log(red('✖ ') + testcaseResult.name)
    } else if (testcaseResult.failures.length > 0) {
      _suiteResults.failureCount += 1
      console.log(red('✖ ') + testcaseResult.name)
    } else {
      console.log(green('✔ ') + testcaseResult.name)
    }
    if(errorTrace) {
      console.log(errorTrace)
    }
    if(verboseTrace){
      console.log("TEST DEFINITION:")
      console.log(runtimeDefinition);
      console.log("RESPONSE:")
      console.log(verboseTrace)
    }

    // JUnit Logging
    if( exports.runOptions.junitLog) {
      exports.loggers.junitResults.write(_testcaseTemplate({testcase: testcaseResult}))
    }

    callback() // Triggers execution of next test
  })
}


exports.run = function(options, callback){
  _testcaseTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-testcase.xml').toString())
  _suiteTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-suite.xml').toString())

  _suiteResults.name = options.name;
  exports.runOptions = options;
  exports.loggers = {};

  if(!fs.existsSync("output")) { fs.mkdirSync("output") }
  if(!fs.existsSync("output/perf")) { fs.mkdirSync("output/perf") }
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
      // I'm not carrying around a bag of junk properties just cuz a generator doesn't follow spec
      return _.pick(test,
        'name',           // OPTIONAL: name of test case
        'url',            // REQUIRED: URL to test
        'driver',         // OPTIONAL: driver responsible for issuing request (default = nodeRequest)
        'driverOptions',  // OPTIONAL: options passed through to the driver
        'assert',         // OPTIONAL: assertion to execute against the response object
        'verbose'         // OPTIONAL: boolean to indicate if additional logging should be performed
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
      var next = generator.getNextTests()

      if(options.shuffle) {
        next = shuffle(next)
      }

      if(next.length === 0) {
        console.log("WARNING: concurrency dropping - test generator is starving the test runner")
        return withNextTests(enqueueTests)
      }

      enqueueTests(next)
    }
  }


  q.drain = function(){
    if(testsRemaining > 0 && generator.hasNextTests()) {
      console.log("WARNING: test queue has been drained early - starving with 0 outstanding requests - waiting VERY patiently")
      return withNextTests(enqueueTests)
    }

      // Let the final test's event loop finish [assertions/logging] before bailing
    setTimeout(function() {
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
    }, 0)
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
  } else {
    callback(_suiteResults)
  }
}

