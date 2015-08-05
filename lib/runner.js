var fs    = require("fs"),
    _     = require("lodash"),
    async = require("async"),
    assert= require('assert'),
    registration = require('./registration.js'),
    jstat = require('jStat').jStat,
    logger = require('./logger.js'),
    Timer = require('./timer.js')


var _testcaseTemplate;
var _suiteTemplate;
var _responseTimes = [];

var _suiteResults = {
  name : "Default",
  errorCount: 0,
  failureCount: 0,
  testCount: 0
}

var red = function(str){return "\x1b[31m" + str + "\x1b[39m"};
var green = function(str){return "\x1b[32m" + str + "\x1b[39m"};

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


var _firstTestDefinition = true
exports.runTest = function(testDefinition, testCompleteCb) {
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
  logger.debug(runtimeDefinition)
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
  var name = testDefinition.name || _.compact([
    (runtimeDefinition.driverOptions.method || "get").toUpperCase(),
    url
  ]).join(' ')

  var timer // endTime, startTime
  var errorTrace = ""
  var verboseTrace = ""
  var testcaseResult = {
    name: name,
    failures: [],
    errors: []
  }


  var driverCallback = function(response) {
    timer.log("end")
    _responseTimes.push(response.responseTime);

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
        logger.debug("Asserting '" + check + "' - expecting: " + expect)
        try {
          registration.getAssertion(check)(response, expect, url)
          isSuccess = true
        } catch(e) {
          if(e && e.message) {
            errorTrace += "FAILED assertion: " + check + '\n'
            errorTrace += url + '\n' + e.message + '\n'
            testcaseResult.failures.push({
              message: "FAILED assertion " + check + ": " + url,
              type: 'assert:' + check,
              backtrace: e.stack
            })
          } else {
            errorTrace += e + '\n'
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

    testcaseResult.duration = timer.sinceStart("end")
    logTestResult(testcaseResult, runtimeDefinition, errorTrace, verboseTrace)
    testCompleteCb() // Triggers execution of next test
  }

  try {
    timer = new Timer()
    driver.run(url, runtimeDefinition.driverOptions, driverCallback)
  } catch(e) {
    timer.log("end")
    errorTrace += red("ERROR: ") + e + '\n'
    testcaseResult.duration = timer.sinceStart("end")
    testcaseResult.errors.push({
      message: "ERROR: " + e ,
      type: 'driver:' + driverName,
      backtrace: "run:" + url + ": " + JSON.stringify(runtimeDefinition.driverOptions)
    })
    logTestResult(testcaseResult, runtimeDefinition, errorTrace, verboseTrace)
    testCompleteCb() // Triggers execution of next test
  }
}

var logTestResult = function(testcaseResult, runtimeDefinition, errorTrace, verboseTrace) {
    _suiteResults.testCount += 1
    if(testcaseResult.errors.length > 0) {
      _suiteResults.errorCount += 1
      logger.error(testcaseResult.name)
    } else if (testcaseResult.failures.length > 0) {
      _suiteResults.failureCount += 1
      logger.fail(testcaseResult.name)
    } else {
      logger.pass(testcaseResult.name)
    }
    if(errorTrace) {
      logger.error(errorTrace)
    }
    if(verboseTrace){
      logger.info("TEST DEFINITION:")
      logger.info(runtimeDefinition);
      logger.info("RESPONSE:")
      logger.info(verboseTrace)
    }

    // JUnit Logging
    if( exports.runOptions.junitLog) {
      exports.loggers.junitResults.write(_testcaseTemplate({testcase: testcaseResult}))
    }
}

exports.run = function(options, callback){
  _testcaseTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-testcase.xml').toString())
  _suiteTemplate = _.template(fs.readFileSync(__dirname + '/templates/junit-suite.xml').toString())

  _suiteResults.name = options.name;
  exports.runOptions = options;
  exports.loggers = {};

  if(!fs.existsSync("logs")) { fs.mkdirSync("logs") }
  if(!fs.existsSync("logs/perf")) { fs.mkdirSync("logs/perf") }

  if(options.reproLog) {
    exports.loggers.reproLog = fs.createWriteStream(
      options.reproLog,
      { flags: 'w+' }
    )
    exports.loggers.reproLog.write('[\n') // start of json array
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
      logger.error("RUNNER EXCEPTION during test execution:")
      logger.info(test)
      logger.error(e)
    }
  }, concurrency )


  var enqueueTests = function(tests) {
    if(tests.length === 0) {
      logger.warn("Nothing to enqueue")
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

    logger.info('Queueing ' + nextTests.length + ' tests (' + testsStarted + ' of ' + totalRequests + ')')
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
        logger.warn("concurrency dropping - test generator is starving the test runner")
        return withNextTests(enqueueTests)
      }

      enqueueTests(next)
    }
  }


  q.drain = function(){
    if(testsRemaining > 0 && generator.hasNextTests()) {
      logger.warn("test queue has been drained early - starving with 0 outstanding requests - waiting VERY patiently")
      return withNextTests(enqueueTests)
    }

      // Let the final test's event loop finish [assertions/logging] before bailing
    setTimeout(function() {
      endTime = new Date().getTime()
      _suiteResults.duration = endTime - startTime

      if(options.reproLog) {
        exports.loggers.reproLog.write('\n]\n') // end of json array
      }

      if(options.junitLog) {
        var loggedResults = fs.readFileSync(options.junitLog + '.tmp').toString()
        var junitLog = _suiteTemplate( { suite: _suiteResults, testcases: loggedResults } )
        fs.writeFileSync(options.junitLog, junitLog, { flags: 'w+' })
        fs.unlinkSync(options.junitLog + '.tmp')
      }

      _suiteResults.stats = getStats()

      logSummary = (_suiteResults.failureCount === 0 && _suiteResults.errorCount === 0) ? logger.pass : logger.fail
      logSummary("Completed "+_suiteResults.name + " ("+ _suiteResults.testCount + " tests). " +
        _suiteResults.failureCount + " failures and "+ _suiteResults.errorCount + " errors in " +
        _suiteResults.duration/1000 + " seconds.")

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
        logger.debug("Adding " + tests.length + " to initial tests. " + initialTests.length + " total ready.")
      }
      if(initialTests.length < options.concurrency && generator.hasNextTests()) {
        withNextTests( buildInitialQueue )
      } else {
        logger.debug("Ready to start testing.")

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

