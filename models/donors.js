var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var donSchema = new Schema({
  fname : { type : String, required : true },
  lname : { type : String, required : true },
  age : { type : Number, required : true, min:18, max:60 },
  number : { type : Number, required : true  },
  email : { type : String, required : true},
  place : { type : String, required : true },
  gender : { type : String, required : true, min:1 },
  bgroup : { type : String, required : true, maxlength:3 }
});

var donModel = mongoose.model('don', donSchema );
module.exports = donModel;
