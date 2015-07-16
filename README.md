zerg-rush
===========

**Unleash a Zerg Rush at your web app/service/api**

An extensible web client for functional, comparative, and performance testing.


Key features
------------

- Concurrent requests to any URLs (via nodejs)
    - Asserting based on response body, header, status (extensible)
    - Asserting based on comparison of responses from 2 or more URLs (extensible)
    - Response perf logging (request start, first byte received, last byte received)
    - Response time statistics (various percentiles and deviations)
- Concurrent requests with responses loaded by PhantomJS (less-tested)
    - Asserting based on status or phantomjs page object (i.e. executing JS against DOM)
    - Asserting based on comparison of 2 or more URLs via scripting against each page in phantomjs
    - DOM performance logging (request start, DOM load start, DOM load complete, actions within a loaded DOM)
- Built-in support for defining TestDefinitions with a simple URL-per-line format or a more feature-complete JSON format
    - Repro logs are output as JSON and can be re-run
    - Easily extend to parse any input into valid TestDefinitions


Usage
-----

Tested with Node v0.10.x

Install PhantomJS (required if using phantomDriver)

Basic usage:

    var zergRush = require(‘zerg-rush’);
    var runOptions = {
        generatorContext : { inputFile : ‘./input/list-of-urls.txt’ },
        concurrency : 10
    };
    zergRush.run( runOptions, function() { console.log(“Finished testing”); });


### Test Definition

```javascript
{
    name: "My Test Name"
    testUrl: "http://example.com",
    assert: [
        {
            check: "checkName",
            expect: "expectValue",
        }
    ],
    driver: "nodeRequest",
    driverOptions: {}
}
```

Note: ignoring `testUrls` and `compare` features for now - considering them for deprecation, or refactoring into a separate runner, because they add complexity and using them invalidates much of the perf data that is collected.

TODO: deprecate `[{check: "checkName", expect: "expectValue"}]` in favor of: `[{checkName: "expectValue"}]`
(consider allowing without array if order doesn't matter)

### NodeRequest DriverOptions

```javascript
{
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    auth: "user:password",
    data: "some data to post - could even be a JS object"
    timeout: 60,
    logResponse: true,
    consoleResponse: false,
    tag: "perfTag1"
}
```

TODO
----

Document the included components as well as how to extend zerg-rush with new components: (drivers, generators, assertions, comparators).
