const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function loadController(controllerFile, mocks) {
  const controllerPath = path.join(__dirname, '..', 'controller', controllerFile);
  const originalLoad = Module._load;

  delete require.cache[require.resolve(controllerPath)];

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createResponse() {
  return {
    rendered: null,
    jsonBody: null,
    render(view, data) {
      this.rendered = { view, data };
    },
    json(body) {
      this.jsonBody = body;
    }
  };
}

function createModel(saveImpl) {
  function Model(data) {
    this.data = data;
    Model.instances.push(this);
  }

  Model.instances = [];
  Model.prototype.save = function(callback) {
    saveImpl(callback, this);
  };

  return Model;
}

function createMailMock() {
  return {
    apiKey: null,
    messages: [],
    setApiKey(apiKey) {
      this.apiKey = apiKey;
    },
    send(message) {
      this.messages.push(message);
    }
  };
}

test('conUser saves contact details, renders success, and sends emails', function() {
  const Contact = createModel(function(callback) {
    callback(null, { id: 'contact-id' });
  });
  const mail = createMailMock();
  const controller = loadController('contres.js', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': mail,
    dotenv: { config() {} }
  });
  const req = {
    body: {
      name: 'Asha',
      email: 'asha@example.com',
      message: 'I want to help.'
    }
  };
  const res = createResponse();

  controller.conUser(req, res);

  assert.deepEqual(Contact.instances[0].data, req.body);
  assert.deepEqual(res.rendered, { view: './pages/contactSuccess', data: undefined });
  assert.equal(mail.messages.length, 2);
  assert.equal(mail.messages[0].to, 'bloodb@gmail.com');
  assert.equal(mail.messages[0].from, 'asha@example.com');
  assert.equal(mail.messages[0].subject, '(Asha)Contact Response');
  assert.equal(mail.messages[0].text, 'I want to help.');
  assert.equal(mail.messages[1].to, 'asha@example.com');
  assert.match(mail.messages[1].text, /Hello,Asha/);
});

test('conUser returns save errors as json', function() {
  const saveError = new Error('save failed');
  const Contact = createModel(function(callback) {
    callback(saveError);
  });
  const controller = loadController('contres.js', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': createMailMock(),
    dotenv: { config() {} }
  });
  const req = {
    body: {
      name: 'Ravi',
      email: 'ravi@example.com',
      message: 'Please contact me.'
    }
  };
  const res = createResponse();

  controller.conUser(req, res);

  assert.equal(res.jsonBody, saveError);
  assert.equal(res.rendered, null);
});

test('donUser saves donor details, renders success, and sends emails', function() {
  const Donor = createModel(function(callback) {
    callback(null, { id: 'donor-id' });
  });
  const mail = createMailMock();
  const controller = loadController('donres.js', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': mail,
    dotenv: { config() {} }
  });
  const req = {
    body: {
      fname: 'Meera',
      lname: 'Patel',
      age: 28,
      number: 9876543210,
      email: 'meera@example.com',
      place: 'Pune',
      gender: 'Female',
      bgroup: 'O+'
    }
  };
  const res = createResponse();

  controller.donUser(req, res);

  assert.deepEqual(Donor.instances[0].data, req.body);
  assert.deepEqual(res.rendered, { view: './pages/success', data: undefined });
  assert.equal(mail.messages.length, 2);
  assert.equal(mail.messages[0].to, 'bloodb@gmail.com');
  assert.equal(mail.messages[0].from, 'meera@example.com');
  assert.match(mail.messages[0].text, /Pune/);
  assert.match(mail.messages[0].text, /O\+/);
  assert.equal(mail.messages[1].to, 'meera@example.com');
  assert.match(mail.messages[1].text, /Meera Patel/);
});

test('showData finds matching donors and renders the data page', function() {
  const selectedFields = [];
  const donors = [
    {
      fname: 'Neha',
      lname: 'Kumar',
      age: 32,
      number: 1234567890,
      email: 'neha@example.com',
      place: 'Delhi',
      gender: 'Female',
      bgroup: 'A+'
    }
  ];
  const Donor = {
    findCalls: [],
    find(query) {
      this.findCalls.push(query);

      return {
        select(fields) {
          selectedFields.push(fields);
        },
        exec(callback) {
          callback(null, donors);
        }
      };
    }
  };
  const controller = loadController('needres.js', {
    mongoose: {},
    '../models/donors': Donor
  });
  const res = createResponse();
  const originalLog = console.log;

  console.log = function() {};
  try {
    controller.showData({ body: { bgr: 'A+', place: 'Delhi' } }, res);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(Donor.findCalls, [{ bgroup: 'A+', place: 'Delhi' }]);
  assert.deepEqual(selectedFields, ['fname lname age number email place gender bgroup']);
  assert.deepEqual(res.rendered, {
    view: 'pages/data',
    data: { users: donors }
  });
});

test('showData does not query donors when blood group is blank', function() {
  const Donor = {
    find() {
      throw new Error('find should not be called');
    }
  };
  const controller = loadController('needres.js', {
    mongoose: {},
    '../models/donors': Donor
  });
  const res = createResponse();

  controller.showData({ body: { bgr: '', place: 'Delhi' } }, res);

  assert.equal(res.rendered, null);
});
