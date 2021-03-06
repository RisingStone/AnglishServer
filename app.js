var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var sessions = require('client-sessions');
var mongoose = require('mongoose');

var models = require('./modules/models.js');
var session = require('./modules/session.js');

var index = require('./routes/index');
var users = require('./routes/users');
var api = require('./routes/api');

var app = express();

//Set port
app.set('port', (process.env.PORT || 3000));

//Listen to set port
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//Handles the session token before anything else is done, it's passed in the req.session field.
app.use(session.getSessionToken);

app.use('/', index);
app.use('/users', users);
app.use('/api', api);

// error handlers

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// Prod Error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// //https://www.npmjs.com/package/express-api-doc
// const Docs = require('express-api-doc');
// const docs = new Docs(app);
// docs.generate({
//   path: './template.html',
// });

module.exports = app;