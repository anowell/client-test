
var phantom = require("phantom"),
    fs = require("fs"),
    logger = require("../logger.js"),
    Timer = require("../timer.js")


var domPerfFile = fs.createWriteStream(
  "output/perf/domPerf.tsv",
  { flags: 'a'}
)

exports.run = function(testUrl, options, callback){
  var options = options || {}

  var requestOptions = {
    operation : options.method,
    data : options.data,
    headers : options.headers
  }
  var timer = new Timer()
  phantomLazy(function(ph){
    // logger.info("phandomDriver: " + testUrl)
    ph.createPage(function(pageObj){
      pageObj.set("libraryPath", "lib.client")
      pageObj.set("viewportSize",{ width: 1200, height: 800 })
      pageObj.set("onConsoleMessage", function(msg){logger.info(msg)})
      pageObj.set("onError", function(msg, trace){logger.info(msg + trace)})
      pageObj.set("onLoadStarted", function(status){
        timer.log("dom_load_start")
        logger.info('started loading in phantom')
      })
      //pageObj.set("onError", function(msg, trace){
      //  logger.info("received error")
      //  errors.write("errors?")
      //  errors.write(msg)
      //  errors.write(trace)
      //  errors.flush()
      //})
      timer.log("phantom_request")
      pageObj.open(testUrl, requestOptions, function(status){
        timer.log("dom_loaded")
        var responseTime = timer.diff('phantom_request', 'dom_loaded')
        if (domPerfFile) {
          domPerfFile.write("phantom request start:\t" + timer.clock("phantom_request")
            + "\tstarting dom:\t" + (timer.clock("dom_load_start") - timer.clock("phantom_request"))
            + "\tdom loaded:\t" + (timer.clock("dom_loaded") - timer.clock("phantom_request"))
            + "\tdom load time:\t" + (timer.clock("dom_loaded") - timer.clock("dom_load_start"))
            + '\n')
        }
        logger.info("page in phantom is " + status)
        if (options.logResponse){
          var outputFile = "output/dom_content/"
            + encodeURIComponent(testUrl) + new Date().getTime() + ".txt"
          pageObj.get("content", function(content){
            fs.writeFile(outputFile, content)
          })
        }

        var cbResponse = { statusCode : status, page : pageObj, responseTime : responseTime }
        if (options.renderPage){
          var renderFile = "output/rendered/"
            + encodeURIComponent(testUrl) + new Date().getTime() + ".png"
          pageObj.render(renderFile, function(){logger.info("rendered " + renderFile ); callback(cbResponse)})
        } else { callback(cbResponse)
        }
      })
    })
  })
}

function phantomLazy(callback){
  if (!exports.phantomObj) {
    logger.info("Creating Phantom Object")
    phantom.create(function(ph){
      logger.info("Creating Phantom Object")
      exports.phantomObj = ph
      callback(exports.phantomObj)
    })
  } else { callback(exports.phantomObj)}
}

/*

var errors = fs.createWriteStream(
  "output/client-errors.out",
  { flags: 'a'}
)
*/


///TODO: remove below, once fully integrated with above
/*
function try_phantom() {
  phantom.create(function(ph){
    ph.createPage(function(page){
      page.set("viewportSize",{ width: 1200, height: 800 })
      page.set("onConsoleMessage", function(msg){logger.info(msg)})
      page.set("onLoadStarted", function(status){logger.info('started loading')})
      page.set("onError", function(msg, trace){
        logger.info("received error")
        errors.write(msg)
        errors.write(trace)
      })
      page.open("https://opendata.test-socrata.com/", function(status){
        logger.info("page request status is " + status)
        page.evaluate(
          function(){logger.info("returning title"); return document.title},
          function(result){logger.info(result)}
        )
        page.render("output/screenshot.png", function(){logger.info("rendered")})
        page.evaluate(
          function(){return $(".browseList")[0].getBoundingClientRect()},
          function(result){
            logger.info("rectangle is " + result)
            page.set("clipRect", result, function(){
              page.render("output/rect.png", function(){logger.info("rendered rectangle")})
            })
          }
        )
        page.evaluate( function(){ throw new Error("mock error")})
      })
    })
  })
}
*/
