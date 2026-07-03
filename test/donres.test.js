var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var loadWithMocks = require('./helpers/loadWithMocks');

var controllerPath = path.join(__dirname, '..', 'controller', 'donres');
var donorModelPath = path.join(__dirname, '..', 'models', 'donors.js');

function createResponse() {
  return {
    jsonPayload: null,
    renderedView: null,
    json: function(payload) {
      this.jsonPayload = payload;
    },
    render: function(view) {
      this.renderedView = view;
    }
  };
}

test('donUser saves donor details, renders success, and sends notification emails', function() {
  var savedPayload;
  var apiKey;
  var sentMessages = [];

  function DonorModel(payload) {
    savedPayload = payload;
  }

  DonorModel.prototype.save = function(callback) {
    callback(null, { id: 'donor-1' });
  };

  var sgMail = {
    setApiKey: function(value) {
      apiKey = value;
    },
    send: function(message) {
      sentMessages.push(message);
    }
  };

  var controller = loadWithMocks(controllerPath, {
    mongoose: {},
    dotenv: { config: function() {} },
    '@sendgrid/mail': sgMail,
    [donorModelPath]: DonorModel
  });

  process.env.API_KEY = 'test-api-key';

  var req = {
    body: {
      fname: 'Asha',
      lname: 'Patel',
      age: 31,
      number: 9876543210,
      email: 'asha@example.com',
      place: 'Hyderabad',
      gender: 'female',
      bgroup: 'O+',
      name: 'Asha Patel'
    }
  };
  var res = createResponse();

  controller.donUser(req, res);

  assert.deepEqual(savedPayload, {
    fname: 'Asha',
    lname: 'Patel',
    age: 31,
    number: 9876543210,
    email: 'asha@example.com',
    place: 'Hyderabad',
    gender: 'female',
    bgroup: 'O+'
  });
  assert.equal(res.renderedView, './pages/success');
  assert.equal(apiKey, 'test-api-key');
  assert.equal(sentMessages.length, 2);
  assert.deepEqual(sentMessages[0], {
    to: 'bloodb@gmail.com',
    from: 'asha@example.com',
    subject: '(Asha Patel)Donation Response',
    text: 'Person Stays inHyderabad, BloodGroup: O+'
  });
  assert.deepEqual(sentMessages[1], {
    to: 'asha@example.com',
    from: 'bloodb@gmail.com',
    subject: 'Thank You',
    text: 'Hello,Asha Patel . Thanks for saving a life!, We will contact you in need!'
  });
});

test('donUser returns save errors as JSON', function() {
  var saveError = new Error('save failed');

  function DonorModel() {}

  DonorModel.prototype.save = function(callback) {
    callback(saveError);
  };

  var controller = loadWithMocks(controllerPath, {
    mongoose: {},
    dotenv: { config: function() {} },
    '@sendgrid/mail': { setApiKey: function() {}, send: function() {} },
    [donorModelPath]: DonorModel
  });

  var req = { body: {} };
  var res = createResponse();

  controller.donUser(req, res);

  assert.equal(res.jsonPayload, saveError);
  assert.equal(res.renderedView, null);
});
