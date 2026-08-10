var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadIndexRouter() {
  var routes = { get: [], post: [] };
  var router = {
    get: function(path, handler) {
      routes.get.push({ path: path, handler: handler });
    },
    post: function(path, handler) {
      routes.post.push({ path: path, handler: handler });
    }
  };
  var contactHandler = function() {};
  var donorHandler = function() {};
  var needHandler = function() {};
  var originalLoad = Module._load;
  var resolvedPath = require.resolve('../routes/index');

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'express') {
      return { Router: function() { return router; } };
    }
    if (request === '../controller/contres') {
      return { conUser: contactHandler };
    }
    if (request === '../controller/donres') {
      return { donUser: donorHandler };
    }
    if (request === '../controller/needres') {
      return { showData: needHandler };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    assert.equal(require('../routes/index'), router);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }

  return {
    routes: routes,
    handlers: {
      contact: contactHandler,
      donor: donorHandler,
      need: needHandler
    }
  };
}

test('GET routes render their expected pages', function() {
  var harness = loadIndexRouter();
  var expectedRoutes = [
    ['/', 'pages/index'],
    ['/donate', 'pages/donate'],
    ['/need', 'pages/need'],
    ['/contact', 'pages/contact'],
    ['/success', 'fpage'],
    ['/maps', 'pages/maps'],
    ['/learn', 'pages/learn']
  ];

  assert.equal(harness.routes.get.length, expectedRoutes.length);
  harness.routes.get.forEach(function(route, index) {
    var renderedView;

    assert.equal(route.path, expectedRoutes[index][0]);
    route.handler({}, {
      render: function(view) { renderedView = view; }
    });
    assert.equal(renderedView, expectedRoutes[index][1]);
  });
});

test('POST routes delegate to the matching controller handlers', function() {
  var harness = loadIndexRouter();

  assert.deepEqual(harness.routes.post.map(function(route) {
    return route.path;
  }), ['/contact', '/donate', '/need']);
  assert.equal(harness.routes.post[0].handler, harness.handlers.contact);
  assert.equal(harness.routes.post[1].handler, harness.handlers.donor);
  assert.equal(harness.routes.post[2].handler, harness.handlers.need);
});
