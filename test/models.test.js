var assert = require('node:assert/strict');
var test = require('node:test');
var Contact = require('../models/conts');
var Donor = require('../models/donors');

test('contact records accept complete submissions', function() {
  var contact = new Contact({
    name: 'Alice',
    email: 'alice@example.com',
    message: 'I would like to help.'
  });

  assert.equal(contact.validateSync(), undefined);
  assert.equal(contact.name, 'Alice');
  assert.equal(contact.email, 'alice@example.com');
  assert.equal(contact.message, 'I would like to help.');
});

test('contact records require a name and email address', function() {
  var validationError = new Contact({ message: 'Missing contact details' }).validateSync();

  assert.ok(validationError);
  assert.equal(validationError.errors.name.kind, 'required');
  assert.equal(validationError.errors.email.kind, 'required');
});

test('donor records accept complete, valid submissions', function() {
  var donor = new Donor({
    fname: 'Bob',
    lname: 'Smith',
    age: 30,
    number: 1234567890,
    email: 'bob@example.com',
    place: 'Bhubaneswar',
    gender: 'Male',
    bgroup: 'O+'
  });

  assert.equal(donor.validateSync(), undefined);
  assert.equal(donor.age, 30);
  assert.equal(donor.bgroup, 'O+');
});

test('donor records require every stored donor field', function() {
  var validationError = new Donor({}).validateSync();
  var requiredFields = ['fname', 'lname', 'age', 'number', 'email', 'place', 'gender', 'bgroup'];

  requiredFields.forEach(function(field) {
    assert.equal(validationError.errors[field].kind, 'required');
  });
});

test('donor records reject ages outside the supported range', function() {
  var underageDonor = new Donor({ age: 17 });
  var overageDonor = new Donor({ age: 61 });

  assert.equal(underageDonor.validateSync().errors.age.kind, 'min');
  assert.equal(overageDonor.validateSync().errors.age.kind, 'max');
});

test('donor records limit blood groups to three characters', function() {
  var validationError = new Donor({ bgroup: 'ABCD' }).validateSync();

  assert.equal(validationError.errors.bgroup.kind, 'maxlength');
});
