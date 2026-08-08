var assert = require('node:assert/strict');
var http = require('node:http');
var path = require('node:path');
var test = require('node:test');
var express = require('express');
var loadWithMocks = require('../test-support/load-with-mocks');

function request(app, method, requestPath) {
  return new Promise(function(resolve, reject) {
    var server = app.listen(0, '127.0.0.1', function() {
      var clientRequest = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: requestPath,
        method: method
      }, function(response) {
        var chunks = [];

        response.on('data', function(chunk) {
          chunks.push(chunk);
        });
        response.on('end', function() {
          server.close(function() {
            resolve({
              statusCode: response.statusCode,
              body: Buffer.concat(chunks).toString('utf8')
            });
          });
        });
      });

      clientRequest.on('error', function(error) {
        server.close(function() {
          reject(error);
        });
      });
      clientRequest.end();
    });

    server.on('error', reject);
  });
}

function createApp(router, mountPath) {
  var app = express();

  app.use(function(req, res, next) {
    res.render = function(view) {
      res.json({ view: view });
    };
    next();
  });
  app.use(mountPath || '/', router);

  return app;
}

function routePath(fileName) {
  return path.join(__dirname, '..', 'routes', fileName);
}

function createIndexRouter(calls) {
  return loadWithMocks(routePath('index.js'), {
    '../controller/contres': {
      conUser: function(req, res) {
        calls.contact += 1;
        res.status(202).json({ handler: 'contact' });
      }
    },
    '../controller/donres': {
      donUser: function(req, res) {
        calls.donate += 1;
        res.status(202).json({ handler: 'donate' });
      }
    },
    '../controller/needres': {
      showData: function(req, res) {
        calls.need += 1;
        res.status(202).json({ handler: 'need' });
      }
    }
  });
}

test('GET page routes render their expected views', async function(t) {
  var calls = { contact: 0, donate: 0, need: 0 };
  var app = createApp(createIndexRouter(calls));
  var routes = [
    ['/', 'pages/index'],
    ['/donate', 'pages/donate'],
    ['/need', 'pages/need'],
    ['/contact', 'pages/contact'],
    ['/success', 'fpage'],
    ['/maps', 'pages/maps'],
    ['/learn', 'pages/learn']
  ];

  for (var index = 0; index < routes.length; index += 1) {
    await t.test('GET ' + routes[index][0], async function() {
      var response = await request(app, 'GET', routes[index][0]);

      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.body), { view: routes[index][1] });
    });
  }
});

test('POST routes dispatch requests to the matching controller', async function(t) {
  var calls = { contact: 0, donate: 0, need: 0 };
  var app = createApp(createIndexRouter(calls));
  var routes = [
    ['/contact', 'contact'],
    ['/donate', 'donate'],
    ['/need', 'need']
  ];

  for (var index = 0; index < routes.length; index += 1) {
    await t.test('POST ' + routes[index][0], async function() {
      var response = await request(app, 'POST', routes[index][0]);

      assert.equal(response.statusCode, 202);
      assert.deepEqual(JSON.parse(response.body), { handler: routes[index][1] });
      assert.equal(calls[routes[index][1]], 1);
    });
  }
});

test('users route returns its resource response', async function() {
  var router = require(routePath('users.js'));
  var app = createApp(router, '/users');
  var response = await request(app, 'GET', '/users');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'respond with a resource');
});

test('unknown routes return 404', async function() {
  var calls = { contact: 0, donate: 0, need: 0 };
  var app = createApp(createIndexRouter(calls));
  var response = await request(app, 'GET', '/missing');

  assert.equal(response.statusCode, 404);
});
