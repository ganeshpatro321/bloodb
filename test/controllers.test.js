var assert = require('node:assert/strict');
var path = require('node:path');
var test = require('node:test');
var Module = require('node:module');

var projectRoot = path.resolve(__dirname, '..');

function loadController(relativePath, mocks) {
  var controllerPath = path.join(projectRoot, relativePath);
  var originalLoad = Module._load;

  delete require.cache[require.resolve(controllerPath)];
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createResponse() {
  return {
    jsonCalls: [],
    renderCalls: [],
    json: function(value) {
      this.jsonCalls.push(value);
    },
    render: function(view, locals) {
      this.renderCalls.push({ view: view, locals: locals });
    }
  };
}

function createModel(save) {
  function Model(attributes) {
    Object.assign(this, attributes);
  }

  Model.prototype.save = save;
  return Model;
}

function createSendGrid() {
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

test('conUser saves a contact request, renders success, and sends both emails', function() {
  var savedContact;
  var sendGrid = createSendGrid();
  var Contact = createModel(function(callback) {
    savedContact = this;
    callback(null, this);
  });
  var controller = loadController('controller/contres.js', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': sendGrid
  });
  var response = createResponse();
  var request = {
    body: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'Please contact me.'
    }
  };

  controller.conUser(request, response);

  assert.deepEqual(Object.assign({}, savedContact), {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Please contact me.'
  });
  assert.deepEqual(response.renderCalls, [{ view: './pages/contactSuccess', locals: undefined }]);
  assert.deepEqual(sendGrid.apiKeys, [process.env.API_KEY]);
  assert.deepEqual(sendGrid.messages, [
    {
      to: 'bloodb@gmail.com',
      from: 'ada@example.com',
      subject: '(Ada Lovelace)Contact Response',
      text: 'Please contact me.'
    },
    {
      to: 'ada@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Ada Lovelace . Contact for more details.'
    }
  ]);
});

test('conUser returns a persistence error as JSON', function() {
  var saveError = new Error('database unavailable');
  var controller = loadController('controller/contres.js', {
    mongoose: {},
    '../models/conts': createModel(function(callback) {
      callback(saveError);
    }),
    '@sendgrid/mail': createSendGrid()
  });
  var response = createResponse();

  controller.conUser({ body: { name: 'Ada', email: 'ada@example.com', message: 'Hi' } }, response);

  assert.deepEqual(response.jsonCalls, [saveError]);
  assert.deepEqual(response.renderCalls, []);
});

test('donUser saves a donor, renders success, and sends both emails', function() {
  var savedDonor;
  var sendGrid = createSendGrid();
  var Donor = createModel(function(callback) {
    savedDonor = this;
    callback(null, this);
  });
  var controller = loadController('controller/donres.js', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': sendGrid
  });
  var response = createResponse();
  var request = {
    body: {
      fname: 'Grace',
      lname: 'Hopper',
      age: 34,
      number: 5550100,
      email: 'grace@example.com',
      place: 'Arlington',
      gender: 'Female',
      bgroup: 'A+',
      name: 'Grace Hopper'
    }
  };

  controller.donUser(request, response);

  assert.deepEqual(Object.assign({}, savedDonor), {
    fname: 'Grace',
    lname: 'Hopper',
    age: 34,
    number: 5550100,
    email: 'grace@example.com',
    place: 'Arlington',
    gender: 'Female',
    bgroup: 'A+'
  });
  assert.deepEqual(response.renderCalls, [{ view: './pages/success', locals: undefined }]);
  assert.deepEqual(sendGrid.messages, [
    {
      to: 'bloodb@gmail.com',
      from: 'grace@example.com',
      subject: '(Grace Hopper)Donation Response',
      text: 'Person Stays inArlington, BloodGroup: A+'
    },
    {
      to: 'grace@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Grace Hopper . Thanks for saving a life!, We will contact you in need!'
    }
  ]);
});

test('donUser returns a persistence error as JSON', function() {
  var saveError = new Error('validation failed');
  var controller = loadController('controller/donres.js', {
    mongoose: {},
    '../models/donors': createModel(function(callback) {
      callback(saveError);
    }),
    '@sendgrid/mail': createSendGrid()
  });
  var response = createResponse();

  controller.donUser({ body: {} }, response);

  assert.deepEqual(response.jsonCalls, [saveError]);
  assert.deepEqual(response.renderCalls, []);
});

test('showData queries matching donors and renders the results', function() {
  var queryFilter;
  var selectedFields;
  var donors = [{ fname: 'Grace', bgroup: 'A+', place: 'Arlington' }];
  var query = {
    select: function(fields) {
      selectedFields = fields;
      return this;
    },
    exec: function(callback) {
      callback(null, donors);
    }
  };
  var controller = loadController('controller/needres.js', {
    mongoose: {},
    '../models/donors': {
      find: function(filter) {
        queryFilter = filter;
        return query;
      }
    }
  });
  var response = createResponse();

  var originalLog = console.log;
  console.log = function() {};
  try {
    controller.showData({ body: { bgr: 'A+', place: 'Arlington' } }, response);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(queryFilter, { bgroup: 'A+', place: 'Arlington' });
  assert.equal(selectedFields, 'fname lname age number email place gender bgroup');
  assert.deepEqual(response.renderCalls, [{ view: 'pages/data', locals: { users: donors } }]);
});

test('showData skips the database query when no blood group is supplied', function() {
  var findCalled = false;
  var controller = loadController('controller/needres.js', {
    mongoose: {},
    '../models/donors': {
      find: function() {
        findCalled = true;
      }
    }
  });
  var response = createResponse();

  controller.showData({ body: { bgr: '', place: 'Arlington' } }, response);

  assert.equal(findCalled, false);
  assert.deepEqual(response.renderCalls, []);
});
