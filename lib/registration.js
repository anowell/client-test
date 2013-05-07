var fs    = require("fs"),
    _     = require("underscore"),
    path  = require("path")


var _assertions = {}
var _comparators = {}
var _drivers = {}
var _generators = {}


var getInternalStore = function(library) {
  switch(library) {
    case 'assertion' :  return _assertions
    case 'comparator' : return _comparators
    case 'driver' :     return _drivers
    case 'generator' :  return _generators 
    default :           throw("'" + library + "' is not a supported component type.")
  }  
}

//TODO: consider a lazy-loading strategy
var registerComponent = function(library, key, component) {
  if(!key) { throw("Must provide a key when registering a component") }
  var store = getInternalStore(library)
  if(store[key]) { throw("'" + library + "' key '" + key + "' is already defined. Keys must be unique.")}
  if(!_.isObject(component)) { throw("The " + key + " " + library + " component is not a valid object for registration.") }
  
  store[key] = component
  return key
}

var getComponent = function(library, key) {
  var store = getInternalStore(library)
  if(!store[key]) { throw("" + library + " '" + key + "' is undefined. Are you sure you registered it?")}
  return store[key]
}


exports.registerGenerator = function(key, module) {
  return registerComponent("generator", key, module)
}
exports.registerDriver = function(key, module) {
  return registerComponent("driver", key, module)
}
var registerAssertion = exports.registerAssertion = function(key, fn) {
  return registerComponent("assertion", key, fn)
}
var registerComparator = exports.registerComparator = function(key, fn) {
  return registerComponent("comparator", key, fn)
}
exports.registerAssertions = function(module) {
  for(var key in module) {
    if(module.hasOwnProperty(key)) {
      registerAssertion(key, module[key])
    }
  }
}
exports.registerComparators = function(module) {
  for(var key in module) {
    if(module.hasOwnProperty(key)) {
      registerComparator(key, module[key])
    }
  }
}

exports.getAssertion = function(key) {
  return getComponent('assertion', key)
}
exports.getComparator = function(key) {
  return getComponent('comparator', key)
}
exports.getGenerator = function(key) {
  return getComponent('generator', key)
}
exports.getDriver = function(key) {
  return getComponent('driver', key)
}


// Built-in modules
exports.registerBuiltInModules = function() {
  var clientTestLib = path.dirname(module.filename)

  fs.readdirSync(path.resolve(clientTestLib, "generators")).forEach(function(file) {
    exports.registerGenerator(path.basename(file, '.js'), require("./generators/" + file))
  })
  fs.readdirSync(path.resolve(clientTestLib, "drivers")).forEach(function(file) {
    exports.registerDriver(path.basename(file, '.js'), require("./drivers/" + file))
  })
  exports.registerAssertions(require("./assert.js"))
  exports.registerComparators(require("./compare.js"))
}
