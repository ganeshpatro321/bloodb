var donModel = require('../models/donors');

var VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

var showData = function(req, res) {
  var bgr = (req.body.bgr || '').trim();
  var place = (req.body.place || '').trim();

  if (!bgr || !place) {
    return res.status(400).render('pages/need', { error: 'Blood group and place are required.' });
  }

  if (!VALID_BLOOD_GROUPS.includes(bgr)) {
    return res.status(400).render('pages/need', { error: 'Invalid blood group selected.' });
  }

  donModel.find({ bgroup: bgr, place: { $regex: new RegExp('^' + place + '$', 'i') } })
    .select('fname lname age number email place gender bgroup')
    .exec(function(err, users) {
      if (err) {
        console.error('Search error:', err);
        return res.status(500).render('error', { message: 'Search failed', error: {} });
      }
      res.render('pages/data', { users: users, bgr: bgr, place: place });
    });
};

module.exports = { showData: showData };
