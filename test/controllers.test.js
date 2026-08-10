var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadWithMocks(modulePath, mocks) {
  var resolvedPath = require.resolve(modulePath);
  var originalLoad = Module._load;

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }
}

function createSubmissionHarness(controllerPath, modelRequest, handlerName) {
  var savedDocuments = [];
  var saveCallbacks = [];
  var apiKeys = [];
  var sentMessages = [];
  var dotenvCalls = 0;

  function Model(document) {
    savedDocuments.push(document);
  }

  Model.prototype.save = function(callback) {
    saveCallbacks.push(callback);
  };

  var sendgrid = {
    setApiKey: function(apiKey) {
      apiKeys.push(apiKey);
    },
    send: function(message) {
      sentMessages.push(message);
    }
  };

  var mocks = {
    mongoose: {},
    '@sendgrid/mail': sendgrid,
    dotenv: {
      config: function() {
        dotenvCalls += 1;
      }
    }
  };
  mocks[modelRequest] = Model;

  var controller = loadWithMocks(controllerPath, mocks);

  return {
    handler: controller[handlerName],
    savedDocuments: savedDocuments,
    saveCallbacks: saveCallbacks,
    apiKeys: apiKeys,
    sentMessages: sentMessages,
    dotenvCalls: function() { return dotenvCalls; }
  };
}

test('donUser saves the donor and renders the success page', function() {
  var originalApiKey = process.env.API_KEY;
  process.env.API_KEY = 'test-api-key';

  try {
    var harness = createSubmissionHarness(
      '../controller/donres',
      '../models/donors',
      'donUser'
    );
    var body = {
      fname: 'Asha',
      lname: 'Rao',
      age: 28,
      number: 9876543210,
      email: 'asha@example.com',
      place: 'Bengaluru',
      gender: 'female',
      bgroup: 'O+'
    };
    var renderedView;

    harness.handler({ body: body }, {
      render: function(view) { renderedView = view; },
      json: function() { assert.fail('json should not be called'); }
    });

    assert.deepEqual(harness.savedDocuments, [body]);
    assert.equal(harness.saveCallbacks.length, 1);
    harness.saveCallbacks[0](null, {});
    assert.equal(renderedView, './pages/success');
    assert.deepEqual(harness.apiKeys, ['test-api-key']);
    assert.equal(harness.sentMessages.length, 2);
    assert.deepEqual(harness.sentMessages[1], {
      to: 'asha@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Asha Rao . Thanks for saving a life!, We will contact you in need!'
    });
    assert.equal(harness.dotenvCalls(), 1);
  } finally {
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
  }
});

test('donUser returns a database error as JSON', function() {
  var harness = createSubmissionHarness(
    '../controller/donres',
    '../models/donors',
    'donUser'
  );
  var databaseError = new Error('save failed');
  var jsonBody;
  var rendered = false;

  harness.handler({ body: {} }, {
    json: function(body) { jsonBody = body; },
    render: function() { rendered = true; }
  });
  harness.saveCallbacks[0](databaseError);

  assert.equal(jsonBody, databaseError);
  assert.equal(rendered, false);
});

test('conUser saves a contact request and sends both notifications', function() {
  var harness = createSubmissionHarness(
    '../controller/contres',
    '../models/conts',
    'conUser'
  );
  var body = {
    name: 'Mira',
    email: 'mira@example.com',
    message: 'Please contact me.'
  };
  var renderedView;

  harness.handler({ body: body }, {
    render: function(view) { renderedView = view; },
    json: function() { assert.fail('json should not be called'); }
  });
  harness.saveCallbacks[0](null, {});

  assert.deepEqual(harness.savedDocuments, [body]);
  assert.equal(renderedView, './pages/contactSuccess');
  assert.deepEqual(harness.sentMessages, [
    {
      to: 'bloodb@gmail.com',
      from: 'mira@example.com',
      subject: '(Mira)Contact Response',
      text: 'Please contact me.'
    },
    {
      to: 'mira@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Mira . Contact for more details.'
    }
  ]);
});

test('conUser returns a database error as JSON', function() {
  var harness = createSubmissionHarness(
    '../controller/contres',
    '../models/conts',
    'conUser'
  );
  var databaseError = new Error('save failed');
  var jsonBody;

  harness.handler({ body: {} }, {
    json: function(body) { jsonBody = body; },
    render: function() { assert.fail('render should not be called'); }
  });
  harness.saveCallbacks[0](databaseError);

  assert.equal(jsonBody, databaseError);
});

function createNeedHarness() {
  var findFilters = [];
  var selectedFields = [];
  var execCallbacks = [];
  var query = {
    select: function(fields) {
      selectedFields.push(fields);
      return query;
    },
    exec: function(callback) {
      execCallbacks.push(callback);
    }
  };
  var donorModel = {
    find: function(filter) {
      findFilters.push(filter);
      return query;
    }
  };
  var controller = loadWithMocks('../controller/needres', {
    mongoose: {},
    '../models/donors': donorModel
  });

  return {
    handler: controller.showData,
    findFilters: findFilters,
    selectedFields: selectedFields,
    execCallbacks: execCallbacks
  };
}

test('showData filters donors and renders matching results', function() {
  var harness = createNeedHarness();
  var donors = [{ fname: 'Asha', bgroup: 'O+', place: 'Bengaluru' }];
  var rendered;

  harness.handler({ body: { bgr: 'O+', place: 'Bengaluru' } }, {
    render: function(view, data) {
      rendered = { view: view, data: data };
    }
  });

  assert.deepEqual(harness.findFilters, [{ bgroup: 'O+', place: 'Bengaluru' }]);
  assert.deepEqual(harness.selectedFields, [
    'fname lname age number email place gender bgroup'
  ]);
  assert.equal(harness.execCallbacks.length, 1);
  harness.execCallbacks[0](null, donors);
  assert.deepEqual(rendered, {
    view: 'pages/data',
    data: { users: donors }
  });
});

test('showData does not query when no blood group is provided', function() {
  var harness = createNeedHarness();
  var rendered = false;

  harness.handler({ body: { bgr: '', place: 'Bengaluru' } }, {
    render: function() { rendered = true; }
  });

  assert.equal(harness.findFilters.length, 0);
  assert.equal(harness.execCallbacks.length, 0);
  assert.equal(rendered, false);
});

test('showData surfaces donor query errors', function() {
  var harness = createNeedHarness();
  var databaseError = new Error('query failed');

  harness.handler({ body: { bgr: 'AB-', place: 'Pune' } }, {
    render: function() { assert.fail('render should not be called'); }
  });

  assert.throws(function() {
    harness.execCallbacks[0](databaseError);
  }, databaseError);
});
