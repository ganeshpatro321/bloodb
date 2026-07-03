var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var loadWithMocks = require('./helpers/loadWithMocks');

var controllerPath = path.join(__dirname, '..', 'controller', 'needres');
var donorModelPath = path.join(__dirname, '..', 'models', 'donors.js');

function createResponse() {
  return {
    renderedView: null,
    renderedLocals: null,
    render: function(view, locals) {
      this.renderedView = view;
      this.renderedLocals = locals;
    }
  };
}

test('showData queries matching donors and renders the results page', function() {
  var selectedFields;
  var findCriteria;
  var donors = [
    {
      fname: 'Asha',
      lname: 'Patel',
      age: 31,
      number: 9876543210,
      email: 'asha@example.com',
      place: 'Hyderabad',
      gender: 'female',
      bgroup: 'O+'
    }
  ];

  var donorModel = {
    find: function(criteria) {
      findCriteria = criteria;

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

  var controller = loadWithMocks(controllerPath, {
    mongoose: {},
    [donorModelPath]: donorModel
  });

  var req = { body: { bgr: 'O+', place: 'Hyderabad' } };
  var res = createResponse();
  var originalLog = console.log;

  console.log = function() {};
  try {
    controller.showData(req, res);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(findCriteria, { bgroup: 'O+', place: 'Hyderabad' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.equal(res.renderedView, 'pages/data');
  assert.deepEqual(res.renderedLocals, { users: donors });
});

test('showData does not query when blood group is empty', function() {
  var findCalled = false;
  var donorModel = {
    find: function() {
      findCalled = true;
    }
  };

  var controller = loadWithMocks(controllerPath, {
    mongoose: {},
    [donorModelPath]: donorModel
  });

  var req = { body: { bgr: '', place: 'Hyderabad' } };
  var res = createResponse();

  controller.showData(req, res);

  assert.equal(findCalled, false);
  assert.equal(res.renderedView, null);
});
