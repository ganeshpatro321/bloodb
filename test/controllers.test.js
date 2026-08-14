var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadWithMocks(modulePath, mocks) {
  var originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('need controller queries matching donors and renders the selected fields', function() {
  var criteria;
  var selection;
  var queryResult = [{ fname: 'Asha', bgroup: 'O+' }];
  var donorModel = {
    find: function(value) {
      criteria = value;
      return {
        select: function(value) {
          selection = value;
        },
        exec: function(callback) {
          callback(null, queryResult);
        }
      };
    }
  };
  var controller = loadWithMocks('../controller/needres', {
    mongoose: {},
    '../models/donors': donorModel
  });
  var rendered;

  controller.showData({ body: { bgr: 'O+', place: 'Pune' } }, {
    render: function(view, data) {
      rendered = { view: view, data: data };
    }
  });

  assert.deepEqual(criteria, { bgroup: 'O+', place: 'Pune' });
  assert.equal(selection, 'fname lname age number email place gender bgroup');
  assert.deepEqual(rendered, {
    view: 'pages/data',
    data: { users: queryResult }
  });
});

test('need controller does not query when no blood group is supplied', function() {
  var findCalled = false;
  var controller = loadWithMocks('../controller/needres', {
    mongoose: {},
    '../models/donors': {
      find: function() {
        findCalled = true;
      }
    }
  });

  controller.showData({ body: { bgr: '', place: 'Pune' } }, {});

  assert.equal(findCalled, false);
});

test('need controller propagates donor query errors', function() {
  var queryError = new Error('query failed');
  var controller = loadWithMocks('../controller/needres', {
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
    controller.showData({ body: { bgr: 'AB-', place: 'Delhi' } }, {});
  }, function(error) {
    return error === queryError;
  });
});

test('donation controller saves form data, renders success, and sends notifications', function() {
  var savedDocument;
  var saveCallback;
  var apiKey;
  var messages = [];

  function Donor(document) {
    savedDocument = document;
    this.save = function(callback) {
      saveCallback = callback;
    };
  }

  var controller = loadWithMocks('../controller/donres', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': {
      setApiKey: function(value) { apiKey = value; },
      send: function(message) { messages.push(message); }
    },
    dotenv: { config: function() {} }
  });
  var body = {
    fname: 'Asha',
    lname: 'Rao',
    age: 28,
    number: 1234567890,
    email: 'asha@example.com',
    place: 'Pune',
    gender: 'female',
    bgroup: 'O+'
  };
  var renderedView;
  var previousApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';

  try {
    controller.donUser({ body: body }, {
      render: function(view) { renderedView = view; }
    });
    saveCallback(null, savedDocument);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousApiKey;
    }
  }

  assert.deepEqual(savedDocument, body);
  assert.equal(renderedView, './pages/success');
  assert.equal(apiKey, 'test-api-key');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map(function(message) {
    return { to: message.to, from: message.from };
  }), [
    {
      to: 'bloodb@gmail.com',
      from: 'asha@example.com'
    },
    {
      to: 'asha@example.com',
      from: 'bloodb@gmail.com'
    }
  ]);
  assert.equal(messages[1].subject, 'Thank You');
  assert.match(messages[1].text, /Asha Rao/);
});

test('donation controller returns persistence errors as JSON without rendering success', function() {
  var persistenceError = new Error('donor save failed');
  var jsonValue;
  var renderCalled = false;

  function Donor() {
    this.save = function(callback) {
      callback(persistenceError);
    };
  }

  var controller = loadWithMocks('../controller/donres', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': {
      setApiKey: function() {},
      send: function() {}
    },
    dotenv: { config: function() {} }
  });

  controller.donUser({
    body: {
      fname: 'Asha',
      lname: 'Rao',
      email: 'asha@example.com',
      place: 'Pune',
      bgroup: 'O+'
    }
  }, {
    json: function(value) { jsonValue = value; },
    render: function() { renderCalled = true; }
  });

  assert.equal(jsonValue, persistenceError);
  assert.equal(renderCalled, false);
});

test('contact controller saves form data, renders success, and sends both messages', function() {
  var savedDocument;
  var apiKey;
  var messages = [];

  function Contact(document) {
    savedDocument = document;
    this.save = function(callback) {
      callback(null, document);
    };
  }

  var controller = loadWithMocks('../controller/contres', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': {
      setApiKey: function(value) { apiKey = value; },
      send: function(message) { messages.push(message); }
    },
    dotenv: { config: function() {} }
  });
  var body = {
    name: 'Ravi Kumar',
    email: 'ravi@example.com',
    message: 'Please share donation details'
  };
  var renderedView;
  var previousApiKey = process.env.API_KEY;
  process.env.API_KEY = 'contact-test-key';

  try {
    controller.conUser({ body: body }, {
      render: function(view) { renderedView = view; }
    });
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousApiKey;
    }
  }

  assert.deepEqual(savedDocument, body);
  assert.equal(renderedView, './pages/contactSuccess');
  assert.equal(apiKey, 'contact-test-key');
  assert.deepEqual(messages, [
    {
      to: 'bloodb@gmail.com',
      from: 'ravi@example.com',
      subject: '(Ravi Kumar)Contact Response',
      text: 'Please share donation details'
    },
    {
      to: 'ravi@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Ravi Kumar . Contact for more details.'
    }
  ]);
});

test('contact controller returns persistence errors as JSON', function() {
  var persistenceError = new Error('database unavailable');
  var jsonValue;

  function Contact() {
    this.save = function(callback) {
      callback(persistenceError);
    };
  }

  var controller = loadWithMocks('../controller/contres', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': {
      setApiKey: function() {},
      send: function() {}
    },
    dotenv: { config: function() {} }
  });

  controller.conUser({
    body: {
      name: 'Ravi',
      email: 'ravi@example.com',
      message: 'Please call me'
    }
  }, {
    json: function(value) { jsonValue = value; }
  });

  assert.equal(jsonValue, persistenceError);
});
