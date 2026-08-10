var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadApp() {
  var settings = [];
  var middleware = [];
  var connectCalls = [];
  var connectionEvents = [];
  var tokens = {
    layouts: function layouts() {},
    logger: function logger() {},
    jsonParser: function jsonParser() {},
    urlencodedParser: function urlencodedParser() {},
    cookieParser: function cookieParser() {},
    staticFiles: function staticFiles() {},
    indexRouter: function indexRouter() {},
    usersRouter: function usersRouter() {}
  };
  var app = {
    set: function(key, value) {
      settings.push([key, value]);
    },
    use: function() {
      middleware.push(Array.prototype.slice.call(arguments));
    }
  };
  var express = function() { return app; };
  express.static = function() { return tokens.staticFiles; };

  var connection = {
    once: function(event, handler) {
      connectionEvents.push({ method: 'once', event: event, handler: handler });
      return connection;
    },
    on: function(event, handler) {
      connectionEvents.push({ method: 'on', event: event, handler: handler });
      return connection;
    }
  };
  var mongoose = {
    connection: connection,
    connect: function(url, options) {
      connectCalls.push({ url: url, options: options });
    }
  };
  var mocks = {
    express: express,
    'serve-favicon': function() {},
    morgan: function(format) {
      assert.equal(format, 'dev');
      return tokens.logger;
    },
    'cookie-parser': function() { return tokens.cookieParser; },
    'body-parser': {
      json: function() { return tokens.jsonParser; },
      urlencoded: function(options) {
        assert.deepEqual(options, { extended: false });
        return tokens.urlencodedParser;
      }
    },
    'express-ejs-layouts': tokens.layouts,
    './routes/index': tokens.indexRouter,
    './routes/users': tokens.usersRouter,
    mongoose: mongoose
  };
  var originalLoad = Module._load;
  var resolvedPath = require.resolve('../app');

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var exportedApp;
  try {
    exportedApp = require('../app');
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }

  return {
    app: exportedApp,
    settings: settings,
    middleware: middleware,
    connectCalls: connectCalls,
    connectionEvents: connectionEvents,
    tokens: tokens
  };
}

test('app configures views, middleware, routes, and MongoDB', function() {
  var harness = loadApp();

  assert.equal(harness.app !== undefined, true);
  assert.equal(harness.settings[0][0], 'views');
  assert.equal(harness.settings[0][1].endsWith('/views'), true);
  assert.deepEqual(harness.settings[1], ['view engine', 'ejs']);
  assert.deepEqual(harness.middleware.slice(0, 6), [
    [harness.tokens.layouts],
    [harness.tokens.logger],
    [harness.tokens.jsonParser],
    [harness.tokens.urlencodedParser],
    [harness.tokens.cookieParser],
    [harness.tokens.staticFiles]
  ]);
  assert.deepEqual(harness.middleware[6], ['/', harness.tokens.indexRouter]);
  assert.deepEqual(harness.middleware[7], ['/users', harness.tokens.usersRouter]);
  assert.deepEqual(harness.connectCalls, [{
    url: 'mongodb://localhost:27017/bloodb',
    options: { useMongoClient: true }
  }]);
  assert.deepEqual(harness.connectionEvents.map(function(event) {
    return [event.method, event.event];
  }), [['once', 'open'], ['on', 'error']]);
});

test('404 middleware forwards a Not Found error', function() {
  var harness = loadApp();
  var forwardedError;
  var notFoundHandler = harness.middleware[8][0];

  notFoundHandler({}, {}, function(error) {
    forwardedError = error;
  });

  assert.equal(forwardedError.message, 'Not Found');
  assert.equal(forwardedError.status, 404);
});

test('error handler exposes details in development', function() {
  var harness = loadApp();
  var errorHandler = harness.middleware[9][0];
  var error = new Error('Invalid request');
  error.status = 422;
  var response = {
    locals: {},
    status: function(code) { response.statusCode = code; },
    render: function(view) { response.renderedView = view; }
  };

  errorHandler(error, {
    app: { get: function() { return 'development'; } }
  }, response, function() {});

  assert.equal(response.locals.message, 'Invalid request');
  assert.equal(response.locals.error, error);
  assert.equal(response.statusCode, 422);
  assert.equal(response.renderedView, 'error');
});

test('error handler hides details and defaults to 500 in production', function() {
  var harness = loadApp();
  var errorHandler = harness.middleware[9][0];
  var response = {
    locals: {},
    status: function(code) { response.statusCode = code; },
    render: function(view) { response.renderedView = view; }
  };

  errorHandler(new Error('Internal failure'), {
    app: { get: function() { return 'production'; } }
  }, response, function() {});

  assert.equal(response.locals.message, 'Internal failure');
  assert.deepEqual(response.locals.error, {});
  assert.equal(response.statusCode, 500);
  assert.equal(response.renderedView, 'error');
});
