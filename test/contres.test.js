var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var loadWithMocks = require('./helpers/loadWithMocks');

var controllerPath = path.join(__dirname, '..', 'controller', 'contres');
var contactModelPath = path.join(__dirname, '..', 'models', 'conts.js');

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

test('conUser saves contact details, renders confirmation, and sends emails', function() {
  var savedPayload;
  var apiKey;
  var sentMessages = [];

  function ContactModel(payload) {
    savedPayload = payload;
  }

  ContactModel.prototype.save = function(callback) {
    callback(null, { id: 'contact-1' });
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
    [contactModelPath]: ContactModel
  });

  process.env.API_KEY = 'test-api-key';

  var req = {
    body: {
      name: 'Ravi',
      email: 'ravi@example.com',
      message: 'Can I donate next week?'
    }
  };
  var res = createResponse();

  controller.conUser(req, res);

  assert.deepEqual(savedPayload, {
    name: 'Ravi',
    email: 'ravi@example.com',
    message: 'Can I donate next week?'
  });
  assert.equal(res.renderedView, './pages/contactSuccess');
  assert.equal(apiKey, 'test-api-key');
  assert.deepEqual(sentMessages, [
    {
      to: 'bloodb@gmail.com',
      from: 'ravi@example.com',
      subject: '(Ravi)Contact Response',
      text: 'Can I donate next week?'
    },
    {
      to: 'ravi@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Ravi . Contact for more details.'
    }
  ]);
});

test('conUser returns save errors as JSON', function() {
  var saveError = new Error('save failed');

  function ContactModel() {}

  ContactModel.prototype.save = function(callback) {
    callback(saveError);
  };

  var controller = loadWithMocks(controllerPath, {
    mongoose: {},
    dotenv: { config: function() {} },
    '@sendgrid/mail': { setApiKey: function() {}, send: function() {} },
    [contactModelPath]: ContactModel
  });

  var req = { body: {} };
  var res = createResponse();

  controller.conUser(req, res);

  assert.equal(res.jsonPayload, saveError);
  assert.equal(res.renderedView, null);
});
