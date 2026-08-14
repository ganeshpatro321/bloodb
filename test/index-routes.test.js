var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

test('index routes render the expected pages and wire controller handlers', function() {
  var routes = [];
  var router = {
    get: function(path, handler) {
      routes.push({ method: 'get', path: path, handler: handler });
    },
    post: function(path, handler) {
      routes.push({ method: 'post', path: path, handler: handler });
    }
  };
  var handlers = {
    contact: function() {},
    donate: function() {},
    need: function() {}
  };
  var mocks = {
    express: { Router: function() { return router; } },
    '../controller/contres': { conUser: handlers.contact },
    '../controller/donres': { donUser: handlers.donate },
    '../controller/needres': { showData: handlers.need }
  };
  var originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var indexRouter;
  try {
    delete require.cache[require.resolve('../routes/index')];
    indexRouter = require('../routes/index');
  } finally {
    Module._load = originalLoad;
  }

  assert.equal(indexRouter, router);

  var expectedViews = {
    '/': 'pages/index',
    '/donate': 'pages/donate',
    '/need': 'pages/need',
    '/contact': 'pages/contact',
    '/success': 'fpage',
    '/maps': 'pages/maps',
    '/learn': 'pages/learn'
  };

  Object.keys(expectedViews).forEach(function(path) {
    var route = routes.find(function(candidate) {
      return candidate.method === 'get' && candidate.path === path;
    });
    var renderedView;

    assert.ok(route, 'expected GET route for ' + path);
    route.handler({}, {
      render: function(view) {
        renderedView = view;
      }
    });
    assert.equal(renderedView, expectedViews[path]);
  });

  var postHandlers = {};
  routes.filter(function(route) {
    return route.method === 'post';
  }).forEach(function(route) {
    postHandlers[route.path] = route.handler;
  });

  assert.deepEqual(postHandlers, {
    '/contact': handlers.contact,
    '/donate': handlers.donate,
    '/need': handlers.need
  });
});
