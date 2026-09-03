var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

test('showData skips the donor lookup when blood group is empty', function() {
  var originalLoad = Module._load;
  var queried = false;

  Module._load = function(request, parent, isMain) {
    if (request === 'mongoose') {
      return {};
    }
    if (request === '../models/donors') {
      return {
        find: function() {
          queried = true;
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  var controller;
  try {
    delete require.cache[require.resolve('../controller/needres')];
    controller = require('../controller/needres');
  } finally {
    Module._load = originalLoad;
  }

  controller.showData({ body: { bgr: '', place: 'Delhi' } }, {
    render: function() {
      assert.fail('did not expect results to render');
    }
  });

  assert.equal(queried, false);
});
