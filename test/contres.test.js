var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function createHarness(saveError) {
  var savedContact;
  var configuredApiKey;
  var sentMessages = [];

  function ContactModel(contact) {
    savedContact = contact;
    this.save = function(callback) {
      callback(saveError, saveError ? undefined : { id: 'contact-1' });
    };
  }

  var sendGrid = {
    setApiKey: function(apiKey) {
      configuredApiKey = apiKey;
    },
    send: function(message) {
      sentMessages.push(message);
    }
  };
  var originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'mongoose') return {};
    if (request === '../models/conts') return ContactModel;
    if (request === '@sendgrid/mail') return sendGrid;
    if (request === 'dotenv') return { config: function() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  var controllerPath = require.resolve('../controller/contres');
  delete require.cache[controllerPath];
  try {
    return {
      controller: require(controllerPath),
      getSavedContact: function() { return savedContact; },
      getConfiguredApiKey: function() { return configuredApiKey; },
      sentMessages: sentMessages
    };
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
}

test('conUser saves contact details, renders success, and sends notifications', function() {
  var originalApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';
  try {
    var harness = createHarness(null);
    var renderedView;
    var request = {
      body: {
        name: 'Ravi',
        email: 'ravi@example.com',
        message: 'I would like to volunteer.'
      }
    };

    harness.controller.conUser(request, {
      render: function(view) { renderedView = view; },
      json: function() { assert.fail('success should not return an error'); }
    });

    assert.deepEqual(harness.getSavedContact(), request.body);
    assert.equal(renderedView, './pages/contactSuccess');
    assert.equal(harness.getConfiguredApiKey(), 'test-api-key');
    assert.deepEqual(harness.sentMessages, [
      {
        to: 'bloodb@gmail.com',
        from: 'ravi@example.com',
        subject: '(Ravi)Contact Response',
        text: 'I would like to volunteer.'
      },
      {
        to: 'ravi@example.com',
        from: 'bloodb@gmail.com',
        subject: 'Thank You',
        text: 'Hello,Ravi . Contact for more details.'
      }
    ]);
  } finally {
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
  }
});

test('conUser returns a persistence error as JSON', function() {
  var saveError = new Error('contact save failed');
  var harness = createHarness(saveError);
  var jsonResponse;
  var rendered = false;

  harness.controller.conUser({
    body: { name: 'Ravi', email: 'ravi@example.com', message: 'Help' }
  }, {
    json: function(value) { jsonResponse = value; },
    render: function() { rendered = true; }
  });

  assert.equal(jsonResponse, saveError);
  assert.equal(rendered, false);
});
