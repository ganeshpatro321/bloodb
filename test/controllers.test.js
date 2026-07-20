const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const controllerDirectory = path.join(__dirname, '..', 'controller');

function loadController(controllerName, stubs) {
  const controllerPath = require.resolve(path.join(controllerDirectory, controllerName));
  const originalLoad = Module._load;

  delete require.cache[controllerPath];
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath && request in stubs) {
      return stubs[request];
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
    json(value) {
      this.jsonCalls.push(value);
    },
    render(view, locals) {
      this.renderCalls.push({ view: view, locals: locals });
    }
  };
}

test('conUser saves contact details, renders success, and sends both emails', () => {
  const savedContacts = [];
  const sentMessages = [];
  const sendGrid = {
    setApiKey(key) {
      this.apiKey = key;
    },
    send(message) {
      sentMessages.push(message);
    }
  };

  class Contact {
    constructor(contact) {
      this.contact = contact;
      savedContacts.push(contact);
    }

    save(callback) {
      callback(null, this.contact);
    }
  }

  const { conUser } = loadController('contres', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': sendGrid
  });
  const request = {
    body: {
      name: 'Asha', email: 'asha@example.com', message: 'Please contact me.',
      internalNote: 'Do not persist this request-only field'
    }
  };
  const response = createResponse();

  conUser(request, response);

  assert.deepEqual(savedContacts, [{
    name: 'Asha',
    email: 'asha@example.com',
    message: 'Please contact me.'
  }]);
  assert.deepEqual(response.renderCalls, [{ view: './pages/contactSuccess', locals: undefined }]);
  assert.equal(sendGrid.apiKey, process.env.API_KEY);
  assert.deepEqual(sentMessages, [
    {
      to: 'bloodb@gmail.com',
      from: 'asha@example.com',
      subject: '(Asha)Contact Response',
      text: 'Please contact me.'
    },
    {
      to: 'asha@example.com',
      from: 'bloodb@gmail.com',
      subject: 'Thank You',
      text: 'Hello,Asha . Contact for more details.'
    }
  ]);
});

test('conUser returns a persistence error as JSON', () => {
  const saveError = new Error('database unavailable');
  const sendGrid = { setApiKey() {}, send() {} };

  class Contact {
    save(callback) {
      callback(saveError);
    }
  }

  const { conUser } = loadController('contres', {
    mongoose: {},
    '../models/conts': Contact,
    '@sendgrid/mail': sendGrid
  });
  const response = createResponse();

  conUser({ body: { name: 'Asha', email: 'asha@example.com', message: 'Help' } }, response);

  assert.deepEqual(response.jsonCalls, [saveError]);
  assert.deepEqual(response.renderCalls, []);
});

test('donUser saves donor details, renders success, and sends confirmation emails', () => {
  const savedDonors = [];
  const sentMessages = [];
  const sendGrid = { setApiKey() {}, send(message) { sentMessages.push(message); } };

  class Donor {
    constructor(donor) {
      this.donor = donor;
      savedDonors.push(donor);
    }

    save(callback) {
      callback(null, this.donor);
    }
  }

  const { donUser } = loadController('donres', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': sendGrid
  });
  const request = {
    body: {
      fname: 'Sam', lname: 'Lee', age: 28, number: 5551234,
      email: 'sam@example.com', place: 'Boston', gender: 'male', bgroup: 'O+',
      isVerified: true
    }
  };
  const response = createResponse();

  donUser(request, response);

  assert.deepEqual(savedDonors, [{
    fname: 'Sam',
    lname: 'Lee',
    age: 28,
    number: 5551234,
    email: 'sam@example.com',
    place: 'Boston',
    gender: 'male',
    bgroup: 'O+'
  }]);
  assert.deepEqual(response.renderCalls, [{ view: './pages/success', locals: undefined }]);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].to, 'bloodb@gmail.com');
  assert.equal(sentMessages[0].text, 'Person Stays inBoston, BloodGroup: O+');
  assert.deepEqual(sentMessages[1], {
    to: 'sam@example.com',
    from: 'bloodb@gmail.com',
    subject: 'Thank You',
    text: 'Hello,Sam Lee . Thanks for saving a life!, We will contact you in need!'
  });
});

test('donUser returns a persistence error as JSON without rendering success', () => {
  const saveError = new Error('donor database unavailable');
  const sendGrid = { setApiKey() {}, send() {} };

  class Donor {
    save(callback) {
      callback(saveError);
    }
  }

  const { donUser } = loadController('donres', {
    mongoose: {},
    '../models/donors': Donor,
    '@sendgrid/mail': sendGrid
  });
  const response = createResponse();

  donUser({
    body: {
      fname: 'Sam', lname: 'Lee', age: 28, number: 5551234,
      email: 'sam@example.com', place: 'Boston', gender: 'male', bgroup: 'O+'
    }
  }, response);

  assert.deepEqual(response.jsonCalls, [saveError]);
  assert.deepEqual(response.renderCalls, []);
});

test('showData searches donors by requested blood group and place', () => {
  const selectedFields = [];
  const donors = [{ fname: 'Sam', bgroup: 'O+', place: 'Boston' }];
  const model = {
    find(criteria) {
      assert.deepEqual(criteria, { bgroup: 'O+', place: 'Boston' });
      return {
        select(fields) {
          selectedFields.push(fields);
          return this;
        },
        exec(callback) {
          callback(null, donors);
        }
      };
    }
  };
  const { showData } = loadController('needres', {
    mongoose: {},
    '../models/donors': model
  });
  const response = createResponse();

  showData({ body: { bgr: 'O+', place: 'Boston' } }, response);

  assert.deepEqual(selectedFields, ['fname lname age number email place gender bgroup']);
  assert.deepEqual(response.renderCalls, [{ view: 'pages/data', locals: { users: donors } }]);
});

test('showData skips the donor search when no blood group is provided', () => {
  const model = { find() { throw new Error('find should not be called'); } };
  const { showData } = loadController('needres', {
    mongoose: {},
    '../models/donors': model
  });
  const response = createResponse();

  showData({ body: { bgr: '', place: 'Boston' } }, response);

  assert.deepEqual(response.renderCalls, []);
});

test('showData propagates donor search errors without rendering results', () => {
  const queryError = new Error('search failed');
  const model = {
    find() {
      return {
        select() {
          return this;
        },
        exec(callback) {
          callback(queryError);
        }
      };
    }
  };
  const { showData } = loadController('needres', {
    mongoose: {},
    '../models/donors': model
  });
  const response = createResponse();

  assert.throws(
    () => showData({ body: { bgr: 'O+', place: 'Boston' } }, response),
    queryError
  );
  assert.deepEqual(response.renderCalls, []);
});
