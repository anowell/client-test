
var http  = require("http"),
    https = require("https"),
    url   = require("url"),
    _     = require("lodash"),
    fs    = require("fs")

var firstRun = true;


exports.run = function(testUrl, options, time, loggers, callback){
  var options = options || {}
  var urlOptions = url.parse(testUrl)
  urlOptions.rejectUnauthorized = false // useful for dev environment
  var transport = urlOptions.protocol === "https:" ? https : http

  urlOptions.method = options.method || "GET"
  urlOptions.headers = options.headers
  if(options.auth) {
    urlOptions.auth = options.auth
  }
  time.log("request_start")

  // console.log("REQUEST:")
  // console.log(urlOptions)
  // console.log(options.data)
  // console.log("-------------------------")

  var req = transport.request(urlOptions, function(response){
    time.log("first_byte")
    response.setEncoding('utf8')
    var chunks = []

    response.on('data', function(chunk){
      chunks.push(chunk)
    })

    response.on('end', function(){
      time.log("last_byte")
      var responseTime = time.diff('request_start', 'last_byte')
      var body = chunks.join('')
      if (options.logResponse) {
        var outputFile = "output/response_content/"
          + encodeURIComponent(testUrl) + new Date().getTime() + ".txt"
        fs.writeFile(outputFile, body)
      }
      if (options.consoleResponse){
        console.log(body)
      }

      if (loggers.responsePerfFile){
        var keys = time.keys()
        if (firstRun) {
          var columnTitles = time.keys()
          columnTitles.push('response_time')
          columnTitles.push('content_length')
          columnTitles.push('response_code')
          columnTitles.push('url')
          if (options.tag) columnTitles.push('tag')
          loggers.responsePerfFile.write(columnTitles.join('\t'))
          loggers.responsePerfFile.write('\n')
          firstRun = false
        }
        for (key in keys) {
          loggers.responsePerfFile.write(time.clock(keys[key]) + '\t')
        }
        loggers.responsePerfFile.write(responseTime + '\t')
        loggers.responsePerfFile.write(body.length + '\t')
        loggers.responsePerfFile.write(response.statusCode + '\t')
        loggers.responsePerfFile.write(testUrl + '\t')
        if (options.tag) loggers.responsePerfFile.write(options.tag)
        loggers.responsePerfFile.write('\n')
      }
      callback({
        statusCode: response.statusCode,
        headers : response.headers,
        body : body,
        responseTime: responseTime
      })
    })

    response.on('close', function(){
      debugger;
      console.log("connection closed unexpectedly")
      callback({
        statusCode: -1,
        body: "connection closed unexpectedly"
      })
    })

    response.on("error", function(err){
      console.log(err);
    });
  })


  // Data may be specified directly or in file
  var data = options.data
  if(_.isEmpty(data) && options.dataFile) {
    data = fs.readFileSync(options.dataFile)
  }

  if(data) {
    // Coerce Objects/Arrays to JSON, but not Strings/Buffers
    if(_.isArray(data) || _.isPlainObject(data) || _.isNumber(data) || data===null) {
      req.write(JSON.stringify(data))
    } else {
      req.write(data)
    }
  }

  req.on('error', function(err){
    console.log("client-side request error: " + err);
    debugger;
    callback({
      statusCode: -1,
      body: "client side error"
    });
  });

  if (options.timeout){
    req.setTimeout(options.timeout, req.abort);
  }

  req.end();

}
