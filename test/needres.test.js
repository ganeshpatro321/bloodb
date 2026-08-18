var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadController(donorModel) {
  var originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'mongoose') {
      return {};
    }
    if (request === '../models/donors') {
      return donorModel;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var controllerPath = require.resolve('../controller/needres');
  delete require.cache[controllerPath];
  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
}

test('showData finds matching donors and renders the results page', function() {
  var donors = [{ fname: 'Asha', bgroup: 'O+' }];
  var receivedFilter;
  var selectedFields;
  var donorModel = {
    find: function(filter) {
      receivedFilter = filter;
      return {
        select: function(fields) {
          selectedFields = fields;
        },
        exec: function(callback) {
          callback(null, donors);
        }
      };
    }
  };
  var controller = loadController(donorModel);
  var rendered;

  controller.showData({ body: { bgr: 'O+', place: 'Pune' } }, {
    render: function(view, data) {
      rendered = { view: view, data: data };
    }
  });

  assert.deepEqual(receivedFilter, { bgroup: 'O+', place: 'Pune' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.deepEqual(rendered, { view: 'pages/data', data: { users: donors } });
});

test('showData does not query donors when no blood group is supplied', function() {
  var findCalled = false;
  var controller = loadController({
    find: function() {
      findCalled = true;
    }
  });

  controller.showData({ body: { bgr: '', place: 'Pune' } }, {});

  assert.equal(findCalled, false);
});

test('showData propagates donor query errors', function() {
  var queryError = new Error('database unavailable');
  var controller = loadController({
    find: function() {
      return {
        select: function() {},
        exec: function(callback) {
          callback(queryError);
        }
      };
    }
  });

  assert.throws(function() {
    controller.showData({ body: { bgr: 'AB-', place: 'Delhi' } }, {});
  }, queryError);
});
