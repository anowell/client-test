var _ = require('lodash')

// A simple, re-usable timer for quickly storing multiple times and easily getting elaspsed time between them
var Timer = function(startName) {
  this.times = {}
  this.startName = startName || "start"
  this.log("start")
}

Timer.prototype.log = function(key) { this.times[key] = new Date().getTime() }
Timer.prototype.clock = function(k) { return this.times[k] }
Timer.prototype.sinceStart = function(k)  { return this.times[k] - this.times[this.startName] },
Timer.prototype.diff = function(f,s){ return this.times[s] - this.times[f] },
Timer.prototype.keys = function()   { return _.keys(this.times) }

module.exports = Timer