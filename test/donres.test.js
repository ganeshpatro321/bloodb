var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function createHarness(saveError) {
  var savedDonor;
  var configuredApiKey;
  var sentMessages = [];

  function DonorModel(donor) {
    savedDonor = donor;
    this.save = function(callback) {
      callback(saveError, saveError ? undefined : { id: 'donor-1' });
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
    if (request === '../models/donors') return DonorModel;
    if (request === '@sendgrid/mail') return sendGrid;
    if (request === 'dotenv') return { config: function() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  var controllerPath = require.resolve('../controller/donres');
  delete require.cache[controllerPath];
  try {
    return {
      controller: require(controllerPath),
      getSavedDonor: function() { return savedDonor; },
      getConfiguredApiKey: function() { return configuredApiKey; },
      sentMessages: sentMessages
    };
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
}

test('donUser saves donor details, renders success, and sends notifications', function() {
  var originalApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';
  try {
    var harness = createHarness(null);
    var renderedView;
    var donor = {
      name: 'Asha Patil',
      fname: 'Asha',
      lname: 'Patil',
      age: 30,
      number: 9876543210,
      email: 'asha@example.com',
      place: 'Pune',
      gender: 'Female',
      bgroup: 'O+'
    };

    harness.controller.donUser({ body: donor }, {
      render: function(view) { renderedView = view; },
      json: function() { assert.fail('success should not return an error'); }
    });

    assert.deepEqual(harness.getSavedDonor(), {
      fname: donor.fname,
      lname: donor.lname,
      age: donor.age,
      number: donor.number,
      email: donor.email,
      place: donor.place,
      gender: donor.gender,
      bgroup: donor.bgroup
    });
    assert.equal(renderedView, './pages/success');
    assert.equal(harness.getConfiguredApiKey(), 'test-api-key');
    assert.deepEqual(harness.sentMessages, [
      {
        to: 'bloodb@gmail.com',
        from: 'asha@example.com',
        subject: '(Asha Patil)Donation Response',
        text: 'Person Stays inPune, BloodGroup: O+'
      },
      {
        to: 'asha@example.com',
        from: 'bloodb@gmail.com',
        subject: 'Thank You',
        text: 'Hello,Asha Patil . Thanks for saving a life!, We will contact you in need!'
      }
    ]);
  } finally {
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
  }
});

test('donUser returns a persistence error as JSON', function() {
  var saveError = new Error('donor save failed');
  var harness = createHarness(saveError);
  var jsonResponse;
  var rendered = false;

  harness.controller.donUser({
    body: {
      fname: 'Asha',
      lname: 'Patil',
      email: 'asha@example.com',
      place: 'Pune',
      bgroup: 'O+'
    }
  }, {
    json: function(value) { jsonResponse = value; },
    render: function() { rendered = true; }
  });

  assert.equal(jsonResponse, saveError);
  assert.equal(rendered, false);
});
