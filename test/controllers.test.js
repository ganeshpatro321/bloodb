var assert = require('node:assert/strict');
var path = require('node:path');
var test = require('node:test');
var loadWithMocks = require('../test-support/load-with-mocks');

function createModel(saveError, savedDocuments) {
  return function Model(document) {
    savedDocuments.push(document);
    this.save = function(callback) {
      callback(saveError, document);
    };
  };
}

function createMailStub() {
  return {
    apiKeys: [],
    messages: [],
    setApiKey: function(apiKey) {
      this.apiKeys.push(apiKey);
    },
    send: function(message) {
      this.messages.push(message);
    }
  };
}

function controllerPath(fileName) {
  return path.join(__dirname, '..', 'controller', fileName);
}

test('contact submission saves the response, renders success, and sends notifications', function() {
  var savedDocuments = [];
  var mail = createMailStub();
  var renderedView;
  var controller = loadWithMocks(controllerPath('contres.js'), {
    mongoose: {},
    '../models/conts': createModel(null, savedDocuments),
    '@sendgrid/mail': mail,
    dotenv: { config: function() {} }
  });
  var originalApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';

  controller.conUser({
    body: {
      name: 'Alice',
      email: 'alice@example.com',
      message: 'I would like to help.'
    }
  }, {
    render: function(view) {
      renderedView = view;
    }
  });

  if (originalApiKey === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = originalApiKey;
  }

  assert.deepEqual(savedDocuments, [{
    name: 'Alice',
    email: 'alice@example.com',
    message: 'I would like to help.'
  }]);
  assert.equal(renderedView, './pages/contactSuccess');
  assert.deepEqual(mail.apiKeys, ['test-api-key']);
  assert.equal(mail.messages.length, 2);
  assert.deepEqual(mail.messages[0], {
    to: 'bloodb@gmail.com',
    from: 'alice@example.com',
    subject: '(Alice)Contact Response',
    text: 'I would like to help.'
  });
  assert.equal(mail.messages[1].to, 'alice@example.com');
  assert.equal(mail.messages[1].subject, 'Thank You');
});

test('contact submission returns persistence errors as JSON', function() {
  var persistenceError = new Error('save failed');
  var jsonResponse;
  var controller = loadWithMocks(controllerPath('contres.js'), {
    mongoose: {},
    '../models/conts': createModel(persistenceError, []),
    '@sendgrid/mail': createMailStub(),
    dotenv: { config: function() {} }
  });

  controller.conUser({ body: {} }, {
    json: function(value) {
      jsonResponse = value;
    }
  });

  assert.equal(jsonResponse, persistenceError);
});

test('donor submission saves donor details, renders success, and sends notifications', function() {
  var savedDocuments = [];
  var mail = createMailStub();
  var renderedView;
  var controller = loadWithMocks(controllerPath('donres.js'), {
    mongoose: {},
    '../models/donors': createModel(null, savedDocuments),
    '@sendgrid/mail': mail,
    dotenv: { config: function() {} }
  });
  var body = {
    fname: 'Bob',
    lname: 'Smith',
    age: 30,
    number: 1234567890,
    email: 'bob@example.com',
    place: 'Bhubaneswar',
    gender: 'Male',
    bgroup: 'O+'
  };

  controller.donUser({ body: body }, {
    render: function(view) {
      renderedView = view;
    }
  });

  assert.deepEqual(savedDocuments, [body]);
  assert.equal(renderedView, './pages/success');
  assert.equal(mail.messages.length, 2);
  assert.equal(mail.messages[0].to, 'bloodb@gmail.com');
  assert.equal(mail.messages[0].from, 'bob@example.com');
  assert.match(mail.messages[0].text, /Bhubaneswar/);
  assert.match(mail.messages[0].text, /O\+/);
  assert.equal(mail.messages[1].to, 'bob@example.com');
  assert.match(mail.messages[1].text, /Bob Smith/);
});

test('donor submission returns persistence errors as JSON', function() {
  var persistenceError = new Error('save failed');
  var jsonResponse;
  var controller = loadWithMocks(controllerPath('donres.js'), {
    mongoose: {},
    '../models/donors': createModel(persistenceError, []),
    '@sendgrid/mail': createMailStub(),
    dotenv: { config: function() {} }
  });

  controller.donUser({ body: {} }, {
    json: function(value) {
      jsonResponse = value;
    }
  });

  assert.equal(jsonResponse, persistenceError);
});

test('need search filters donors and renders the selected fields', function() {
  var originalConsoleLog = console.log;
  var selectedFields;
  var searchFilter;
  var renderedView;
  var renderedData;
  var donors = [{ fname: 'Carol', bgroup: 'A+', place: 'Cuttack' }];
  var donorModel = {
    find: function(filter) {
      searchFilter = filter;
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
  var controller = loadWithMocks(controllerPath('needres.js'), {
    mongoose: {},
    '../models/donors': donorModel
  });

  console.log = function() {};
  try {
    controller.showData({ body: { bgr: 'A+', place: 'Cuttack' } }, {
      render: function(view, data) {
        renderedView = view;
        renderedData = data;
      }
    });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.deepEqual(searchFilter, { bgroup: 'A+', place: 'Cuttack' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.equal(renderedView, 'pages/data');
  assert.deepEqual(renderedData, { users: donors });
});

test('need search does nothing when no blood group is provided', function() {
  var findCalled = false;
  var renderCalled = false;
  var controller = loadWithMocks(controllerPath('needres.js'), {
    mongoose: {},
    '../models/donors': {
      find: function() {
        findCalled = true;
      }
    }
  });

  controller.showData({ body: { bgr: '', place: 'Cuttack' } }, {
    render: function() {
      renderCalled = true;
    }
  });

  assert.equal(findCalled, false);
  assert.equal(renderCalled, false);
});

test('need search propagates query errors', function() {
  var queryError = new Error('query failed');
  var controller = loadWithMocks(controllerPath('needres.js'), {
    mongoose: {},
    '../models/donors': {
      find: function() {
        return {
          select: function() {},
          exec: function(callback) {
            callback(queryError);
          }
        };
      }
    }
  });

  assert.throws(function() {
    controller.showData({ body: { bgr: 'B-', place: 'Puri' } }, {});
  }, queryError);
});
