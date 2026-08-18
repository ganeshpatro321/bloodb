var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadRouter() {
  var routes = [];
  var router = {
    get: function(path, handler) {
      routes.push({ method: 'get', path: path, handler: handler });
    },
    post: function(path, handler) {
      routes.push({ method: 'post', path: path, handler: handler });
    }
  };
  var controllers = {
    '../controller/contres': { conUser: function conUser() {} },
    '../controller/donres': { donUser: function donUser() {} },
    '../controller/needres': { showData: function showData() {} }
  };
  var originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (request === 'express') {
      return { Router: function() { return router; } };
    }
    if (controllers[request]) {
      return controllers[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var indexPath = require.resolve('../routes/index');
  delete require.cache[indexPath];
  try {
    return {
      router: require(indexPath),
      routes: routes,
      controllers: controllers
    };
  } finally {
    Module._load = originalLoad;
    delete require.cache[indexPath];
  }
}

test('index router registers the expected GET pages', function() {
  var loaded = loadRouter();
  var expectedViews = {
    '/': 'pages/index',
    '/donate': 'pages/donate',
    '/need': 'pages/need',
    '/contact': 'pages/contact',
    '/success': 'fpage',
    '/maps': 'pages/maps',
    '/learn': 'pages/learn'
  };
  var getRoutes = loaded.routes.filter(function(route) {
    return route.method === 'get';
  });

  assert.deepEqual(getRoutes.map(function(route) { return route.path; }), Object.keys(expectedViews));

  getRoutes.forEach(function(route) {
    var renderedView;
    route.handler({}, {
      render: function(view) {
        renderedView = view;
      }
    });
    assert.equal(renderedView, expectedViews[route.path]);
  });
});

test('index router connects form POSTs to their controllers', function() {
  var loaded = loadRouter();
  var postRoutes = loaded.routes.filter(function(route) {
    return route.method === 'post';
  });

  assert.deepEqual(postRoutes.map(function(route) { return route.path; }), [
    '/contact',
    '/donate',
    '/need'
  ]);
  assert.equal(postRoutes[0].handler, loaded.controllers['../controller/contres'].conUser);
  assert.equal(postRoutes[1].handler, loaded.controllers['../controller/donres'].donUser);
  assert.equal(postRoutes[2].handler, loaded.controllers['../controller/needres'].showData);
});
