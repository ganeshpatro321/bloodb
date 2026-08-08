var donModel = require('../models/donors');
const sgMail = require('@sendgrid/mail');
var dotenv = require('dotenv');
dotenv.config();

var VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
var VALID_GENDERS = ['Male', 'Female', 'Other'];

var donUser = function(req, res) {
  var fname = (req.body.fname || '').trim();
  var lname = (req.body.lname || '').trim();
  var age = parseInt(req.body.age, 10);
  var number = (req.body.number || '').trim();
  var email = (req.body.email || '').trim();
  var place = (req.body.place || '').trim();
  var gender = (req.body.gender || '').trim();
  var bgroup = (req.body.bgroup || '').trim();

  // Server-side validation
  if (!fname || !lname || !email || !place || !number) {
    return res.status(400).render('pages/donate', { error: 'All fields are required.' });
  }
  if (isNaN(age) || age < 18 || age > 60) {
    return res.status(400).render('pages/donate', { error: 'Age must be between 18 and 60.' });
  }
  if (!VALID_BLOOD_GROUPS.includes(bgroup)) {
    return res.status(400).render('pages/donate', { error: 'Invalid blood group selected.' });
  }
  if (!VALID_GENDERS.includes(gender)) {
    return res.status(400).render('pages/donate', { error: 'Invalid gender selected.' });
  }

  var donmodel = new donModel({ fname, lname, age, number, email, place, gender, bgroup });

  donmodel.save(function(err) {
    if (err) {
      console.error('Save error:', err);
      return res.status(500).render('pages/donate', { error: 'Registration failed. Please try again.' });
    }
    res.render('./pages/success');
  });

  // Send notification emails (non-blocking)
  sgMail.setApiKey(process.env.API_KEY);
  const adminMsg = {
    to: 'bloodb@gmail.com',
    from: 'bloodb@gmail.com',
    subject: '(' + fname + ' ' + lname + ') Donation Response',
    text: 'New donor registered. Place: ' + place + ', Blood Group: ' + bgroup,
  };
  const donorMsg = {
    to: email,
    from: 'bloodb@gmail.com',
    subject: 'Thank You for Registering as a Donor',
    text: 'Hello, ' + fname + ' ' + lname + '. Thank you for saving a life! We will contact you when needed.',
  };
  sgMail.send(adminMsg).catch(err => console.error('Admin email error:', err));
  sgMail.send(donorMsg).catch(err => console.error('Donor email error:', err));
};

module.exports = { donUser: donUser };
