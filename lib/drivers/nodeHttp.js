var http  = require("http"),
    https = require("https"),
    url   = require("url"),
    _     = require("lodash"),
    fs    = require("fs"),
    util  = require('util')
;

exports.options = function(){
  return [{
    option: "--protocol <protocol>",
    description: "can be http or https"
  },
  {
    option: "-m --method <method>",
    description: "http method, defaults to GET"
  },
  {
    option: "-h --header <header:value>",
    description: "add this header"
  },
  {
    option: "-d --data <string>",
    description: "send data with request"
  },
  {
    option: "-f --file <filename>",
    description: "send file's data with request"
  },
  {
    option: "-p --perf",
    description: "log response performance metrics"
  },
  {
    option: "-v --verbose",
    description: "logs the response text"
  }];
}

var firstRun = true;


exports.run = function(testUrl, options, time, loggers, callback){
  // console.log("nodeRequest: " + testUrl)

  var options = options || {}
  var urlOptions = url.parse(testUrl)
  urlOptions.rejectUnauthorized = false // useful for dev environment
  var transport = urlOptions.protocol === "https:" ? https : http

  urlOptions.method = options.method || "GET"
  urlOptions.headers = options.headers
  
  time.log("request_start")

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
      debugger;
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

  if(options.data) {
    if(_.isString(options.data)) { 
      req.write(options.data)
    } else {
      req.write(JSON.stringify(options.data))      
    }
  }

  req.on('error', function(err){
    console.log("client-side request timeout: " + err);
    debugger;
    callback({
      statusCode: -1,
      body: "client side timeout"
    });
  });

  if (options.timeout){
    req.setTimeout(options.timeout, req.abort);
  }

  req.end();

}
