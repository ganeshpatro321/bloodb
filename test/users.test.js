var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

test('GET /users responds with the resource message', function() {
  var routes = [];
  var router = {
    get: function(path, handler) {
      routes.push({ path: path, handler: handler });
    }
  };
  var originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (request === 'express') {
      return { Router: function() { return router; } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var usersRouter;
  try {
    usersRouter = require('../routes/users');
  } finally {
    Module._load = originalLoad;
  }

  assert.equal(usersRouter, router);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/');

  var responseBody;
  routes[0].handler({}, {
    send: function(body) {
      responseBody = body;
    }
  }, function() {});

  assert.equal(responseBody, 'respond with a resource');
});
