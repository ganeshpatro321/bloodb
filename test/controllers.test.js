var assert = require('node:assert/strict');
var Module = require('node:module');
var test = require('node:test');

function loadController(path, stubs) {
  var originalLoad = Module._load;
  delete require.cache[require.resolve(path)];

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(path);
  } finally {
    Module._load = originalLoad;
  }
}

function createResponse() {
  return {
    jsonPayload: null,
    renderedView: null,
    renderedData: null,
    json: function(payload) {
      this.jsonPayload = payload;
    },
    render: function(view, data) {
      this.renderedView = view;
      this.renderedData = data;
    }
  };
}

test('donUser saves donor details, renders success, and sends confirmation emails', function() {
  var savedDonor;
  var apiKey;
  var sentMessages = [];

  function DonorModel(data) {
    savedDonor = data;
  }

  DonorModel.prototype.save = function(callback) {
    callback(null, { _id: 'donor-1' });
  };

  var controller = loadController('../controller/donres', {
    mongoose: {},
    dotenv: { config: function() {} },
    '../models/donors': DonorModel,
    '@sendgrid/mail': {
      setApiKey: function(value) {
        apiKey = value;
      },
      send: function(message) {
        sentMessages.push(message);
        return Promise.resolve();
      }
    }
  });

  var req = {
    body: {
      fname: 'Asha',
      lname: 'Patel',
      age: 30,
      number: 9876543210,
      email: 'asha@example.com',
      place: 'Pune',
      gender: 'Female',
      bgroup: 'O+'
    }
  };
  var res = createResponse();
  var previousApiKey = process.env.API_KEY;

  try {
    process.env.API_KEY = 'test-api-key';

    controller.donUser(req, res);

    assert.deepEqual(savedDonor, req.body);
    assert.equal(res.renderedView, './pages/success');
    assert.equal(apiKey, 'test-api-key');
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].to, 'bloodb@gmail.com');
    assert.equal(sentMessages[0].from, 'asha@example.com');
    assert.equal(sentMessages[0].subject.endsWith('Donation Response'), true);
    assert.match(sentMessages[0].text, /Pune/);
    assert.match(sentMessages[0].text, /BloodGroup: O\+/);
    assert.deepEqual(sentMessages[1], {
      to: 'asha@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Asha Patel . Thanks for saving a life!, We will contact you in need!'
    });
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousApiKey;
    }
  }
});

test('conUser saves contact details, renders contact success, and sends emails', function() {
  var savedContact;
  var sentMessages = [];

  function ContactModel(data) {
    savedContact = data;
  }

  ContactModel.prototype.save = function(callback) {
    callback(null, { _id: 'contact-1' });
  };

  var controller = loadController('../controller/contres', {
    mongoose: {},
    dotenv: { config: function() {} },
    '../models/conts': ContactModel,
    '@sendgrid/mail': {
      setApiKey: function() {},
      send: function(message) {
        sentMessages.push(message);
        return Promise.resolve();
      }
    }
  });

  var req = {
    body: {
      name: 'Rahul',
      email: 'rahul@example.com',
      message: 'Need more information'
    }
  };
  var res = createResponse();

  controller.conUser(req, res);

  assert.deepEqual(savedContact, req.body);
  assert.equal(res.renderedView, './pages/contactSuccess');
  assert.deepEqual(sentMessages, [
    {
      to: 'bloodb@gmail.com',
      from: 'rahul@example.com',
      subject: '(Rahul)Contact Response',
      text: 'Need more information'
    },
    {
      to: 'rahul@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Rahul . Contact for more details.'
    }
  ]);
});

test('showData queries donors by blood group and place then renders data page', function() {
  var findCriteria;
  var selectedFields;
  var execCalled = false;
  var matchingUsers = [
    {
      fname: 'Meera',
      lname: 'Rao',
      age: 27,
      number: 1234567890,
      email: 'meera@example.com',
      place: 'Hyderabad',
      gender: 'Female',
      bgroup: 'A+'
    }
  ];

  var controller = loadController('../controller/needres', {
    mongoose: {},
    '../models/donors': {
      find: function(criteria) {
        findCriteria = criteria;
        return {
          select: function(fields) {
            selectedFields = fields;
          },
          exec: function(callback) {
            execCalled = true;
            callback(null, matchingUsers);
          }
        };
      }
    }
  });

  var req = { body: { bgr: 'A+', place: 'Hyderabad' } };
  var res = createResponse();
  var originalLog = console.log;

  try {
    console.log = function() {};
    controller.showData(req, res);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(findCriteria, { bgroup: 'A+', place: 'Hyderabad' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.equal(execCalled, true);
  assert.equal(res.renderedView, 'pages/data');
  assert.deepEqual(res.renderedData, { users: matchingUsers });
});

test('showData skips donor lookup when blood group is empty', function() {
  var findCalled = false;
  var controller = loadController('../controller/needres', {
    mongoose: {},
    '../models/donors': {
      find: function() {
        findCalled = true;
      }
    }
  });

  controller.showData({ body: { bgr: '', place: 'Hyderabad' } }, createResponse());

  assert.equal(findCalled, false);
});
