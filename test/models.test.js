var test = require('node:test');
var assert = require('node:assert/strict');
var Module = require('node:module');

function loadModel(modulePath) {
  var schemaDefinition;
  var modelCalls = [];
  var originalLoad = Module._load;
  var resolvedPath = require.resolve(modulePath);

  function Schema(definition) {
    schemaDefinition = definition;
  }

  var mongoose = {
    Schema: Schema,
    model: function(name, schema) {
      var model = { modelName: name, schema: schema };
      modelCalls.push({ name: name, schema: schema, model: model });
      return model;
    }
  };

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'mongoose') return mongoose;
    return originalLoad.call(this, request, parent, isMain);
  };

  var exportedModel;
  try {
    exportedModel = require(modulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }

  return {
    definition: schemaDefinition,
    modelCalls: modelCalls,
    exportedModel: exportedModel
  };
}

test('donor model defines all required fields with the expected types', function() {
  var harness = loadModel('../models/donors');
  var definition = harness.definition;
  var expectedTypes = {
    fname: String,
    lname: String,
    age: Number,
    number: Number,
    email: String,
    place: String,
    gender: String,
    bgroup: String
  };

  assert.deepEqual(Object.keys(definition), Object.keys(expectedTypes));
  Object.keys(expectedTypes).forEach(function(field) {
    assert.equal(definition[field].type, expectedTypes[field]);
    assert.equal(definition[field].required, true);
  });
  assert.equal(harness.modelCalls.length, 1);
  assert.equal(harness.modelCalls[0].name, 'don');
  assert.equal(harness.exportedModel, harness.modelCalls[0].model);
});

test('donor model applies age, gender, and blood-group limits', function() {
  var definition = loadModel('../models/donors').definition;

  assert.equal(definition.age.min, 18);
  assert.equal(definition.age.max, 60);
  assert.equal(definition.gender.min, 1);
  assert.equal(definition.bgroup.max, 3);
});

test('contact model requires identity fields and keeps message optional', function() {
  var harness = loadModel('../models/conts');
  var definition = harness.definition;

  assert.deepEqual(Object.keys(definition), ['name', 'email', 'message']);
  assert.deepEqual(definition.name, { type: String, required: true });
  assert.deepEqual(definition.email, { type: String, required: true });
  assert.deepEqual(definition.message, { type: String });
  assert.equal(harness.modelCalls.length, 1);
  assert.equal(harness.modelCalls[0].name, 'con');
  assert.equal(harness.exportedModel, harness.modelCalls[0].model);
});
