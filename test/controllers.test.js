var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadController(path, mocks) {
  var originalLoad = Module._load;
  var resolvedPath = require.resolve(path);

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(path);
  } finally {
    Module._load = originalLoad;
  }
}

function createModel(saveError, savedDocuments) {
  return function Model(document) {
    savedDocuments.push(document);
    this.save = function(callback) {
      callback(saveError, document);
    };
  };
}

function createMailMock(messages) {
  return {
    setApiKey: function() {},
    send: function(message) {
      messages.push(message);
      return Promise.resolve();
    }
  };
}

var commonMocks = {
  mongoose: {},
  dotenv: { config: function() {} }
};

test('donUser saves donor details, renders success, and sends notifications', function() {
  var savedDocuments = [];
  var messages = [];
  var renderedView;
  var body = {
    fname: 'Asha',
    lname: 'Patel',
    age: 28,
    number: 9876543210,
    email: 'asha@example.com',
    place: 'Pune',
    gender: 'Female',
    bgroup: 'A+'
  };
  var controller = loadController('../controller/donres', Object.assign({}, commonMocks, {
    '../models/donors': createModel(null, savedDocuments),
    '@sendgrid/mail': createMailMock(messages)
  }));

  controller.donUser({ body: body }, {
    render: function(view) { renderedView = view; },
    json: function() { assert.fail('did not expect an error response'); }
  });

  assert.deepEqual(savedDocuments, [body]);
  assert.equal(renderedView, './pages/success');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].to, 'bloodb@gmail.com');
  assert.equal(messages[0].from, body.email);
  assert.equal(messages[1].to, body.email);
  assert.match(messages[1].text, /Asha Patel/);
});

test('donUser returns a persistence error as JSON', function() {
  var error = new Error('save failed');
  var responseError;
  var controller = loadController('../controller/donres', Object.assign({}, commonMocks, {
    '../models/donors': createModel(error, []),
    '@sendgrid/mail': createMailMock([])
  }));

  controller.donUser({ body: {} }, {
    render: function() { assert.fail('did not expect a success view'); },
    json: function(value) { responseError = value; }
  });

  assert.equal(responseError, error);
});

test('conUser saves the contact request and sends both emails', function() {
  var savedDocuments = [];
  var messages = [];
  var renderedView;
  var body = {
    name: 'Ravi Kumar',
    email: 'ravi@example.com',
    message: 'How can I organize a drive?'
  };
  var controller = loadController('../controller/contres', Object.assign({}, commonMocks, {
    '../models/conts': createModel(null, savedDocuments),
    '@sendgrid/mail': createMailMock(messages)
  }));

  controller.conUser({ body: body }, {
    render: function(view) { renderedView = view; },
    json: function() { assert.fail('did not expect an error response'); }
  });

  assert.deepEqual(savedDocuments, [body]);
  assert.equal(renderedView, './pages/contactSuccess');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    to: 'bloodb@gmail.com',
    from: body.email,
    subject: '(Ravi Kumar)Contact Response',
    text: body.message
  });
  assert.equal(messages[1].to, body.email);
});

test('conUser returns a persistence error as JSON', function() {
  var error = new Error('save failed');
  var responseError;
  var controller = loadController('../controller/contres', Object.assign({}, commonMocks, {
    '../models/conts': createModel(error, []),
    '@sendgrid/mail': createMailMock([])
  }));

  controller.conUser({ body: {} }, {
    render: function() { assert.fail('did not expect a success view'); },
    json: function(value) { responseError = value; }
  });

  assert.equal(responseError, error);
});

test('showData filters donors and renders the selected fields', function() {
  var filter;
  var selectedFields;
  var rendered;
  var donors = [{ fname: 'Mina', bgroup: 'O-', place: 'Delhi' }];
  var query = {
    select: function(fields) { selectedFields = fields; },
    exec: function(callback) { callback(null, donors); }
  };
  var donorModel = {
    find: function(value) {
      filter = value;
      return query;
    }
  };
  var controller = loadController('../controller/needres', {
    mongoose: {},
    '../models/donors': donorModel
  });

  controller.showData({ body: { bgr: 'O-', place: 'Delhi' } }, {
    render: function(view, data) { rendered = { view: view, data: data }; }
  });

  assert.deepEqual(filter, { bgroup: 'O-', place: 'Delhi' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.deepEqual(rendered, { view: 'pages/data', data: { users: donors } });
});

test('showData does not query when no blood group is provided', function() {
  var queried = false;
  var controller = loadController('../controller/needres', {
    mongoose: {},
    '../models/donors': {
      find: function() {
        queried = true;
      }
    }
  });

  controller.showData({ body: { bgr: '', place: 'Delhi' } }, {
    render: function() { assert.fail('did not expect results to render'); }
  });

  assert.equal(queried, false);
});

test('showData propagates donor query errors', function() {
  var error = new Error('query failed');
  var controller = loadController('../controller/needres', {
    mongoose: {},
    '../models/donors': {
      find: function() {
        return {
          select: function() {},
          exec: function(callback) { callback(error); }
        };
      }
    }
  });

  assert.throws(function() {
    controller.showData({ body: { bgr: 'AB+', place: 'Mumbai' } }, {
      render: function() { assert.fail('did not expect results to render'); }
    });
  }, error);
});
