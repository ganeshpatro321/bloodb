var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadIndexRouter(controllers) {
  var routes = [];
  var router = {
    get: function(path, handler) {
      routes.push({ method: 'get', path: path, handler: handler });
    },
    post: function(path, handler) {
      routes.push({ method: 'post', path: path, handler: handler });
    }
  };
  var originalLoad = Module._load;
  var resolvedPath = require.resolve('../routes/index');

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'express') {
      return { Router: function() { return router; } };
    }
    if (Object.prototype.hasOwnProperty.call(controllers, request)) {
      return controllers[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    assert.equal(require('../routes/index'), router);
    return routes;
  } finally {
    Module._load = originalLoad;
  }
}

function findRoute(routes, method, path) {
  return routes.find(function(route) {
    return route.method === method && route.path === path;
  });
}

test('page routes render their corresponding views', function() {
  var routes = loadIndexRouter({
    '../controller/contres': { conUser: function() {} },
    '../controller/donres': { donUser: function() {} },
    '../controller/needres': { showData: function() {} }
  });
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
    var renderedView;
    var route = findRoute(routes, 'get', path);

    assert.ok(route, 'expected GET route for ' + path);
    route.handler({}, {
      render: function(view) { renderedView = view; }
    });
    assert.equal(renderedView, expectedViews[path]);
  });
});

test('form routes delegate to the matching controller handlers', function() {
  var calls = [];
  var controllers = {
    '../controller/contres': {
      conUser: function(req, res) { calls.push({ name: 'contact', req: req, res: res }); }
    },
    '../controller/donres': {
      donUser: function(req, res) { calls.push({ name: 'donate', req: req, res: res }); }
    },
    '../controller/needres': {
      showData: function(req, res) { calls.push({ name: 'need', req: req, res: res }); }
    }
  };
  var routes = loadIndexRouter(controllers);

  [
    { path: '/contact', name: 'contact' },
    { path: '/donate', name: 'donate' },
    { path: '/need', name: 'need' }
  ].forEach(function(expected) {
    var request = { body: { route: expected.name } };
    var response = {};
    var route = findRoute(routes, 'post', expected.path);

    assert.ok(route, 'expected POST route for ' + expected.path);
    route.handler(request, response);
  });

  assert.deepEqual(calls.map(function(call) { return call.name; }), ['contact', 'donate', 'need']);
  calls.forEach(function(call) {
    assert.equal(call.req.body.route, call.name);
    assert.equal(call.res && typeof call.res, 'object');
  });
});
