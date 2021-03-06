var express = require('express');
var router = express.Router();
var models = require('../modules/models')();
var utils = require('../modules/utils');
var templates = require('../modules/templates');
var codes = templates.codes;

router.route('/login')
	.post(function (req, res) {
		var loggingInUser = {};
		var email = req.body.email;
		models.user.findOne({ email: utils.caseInsensitive(email) }).exec()
			.then(function (userFound) {
				if (userFound) {
					var hash = utils.createHash(req.body.password);
					if (hash === userFound.password) {
						loggingInUser = userFound;
						return models.session.findOne({ user: userFound._id }).exec();
					} else {
						throw new templates.error(codes.bad_password, "Bad password", "Password does not match");
					}
				} else {
					throw new templates.error(codes.no_user_found, "User not found", "DB has no matching user: " + utils.caseInsensitive(email));
				}
			}).then(function (session) {
				var sesstoken = utils.createToken();
				if (session) {
					session.set({ token: sesstoken });
				} else {
					session = models.session({ user: loggingInUser._id, token: sesstoken });
				}
				return session.save();
			}).then(function (sessionToken) {
				if (sessionToken) {
					res.send(templates.response(codes.success, "success", sessionToken));
				} else {
					throw new templates.error(codes.fail, "Error creating token", "Unknown DB error");
				}
			}).catch(function (err) {
				res.send(templates.response(err.error_code || codes.bad_password, err.message || 'Fail', err.error || 'Error logging in!'));
			});
	});

router.route('/logout').post(function (req, res) {
	models.session.remove({ token: req.header('sessionToken') }, function (error, userFound) {
		if (error) {
			//Send Error.
			console.log(templates.response(codes.fail, "fail", "Error logging out user."));
			res.status('400').send(templates.response(codes.fail, "fail", "Error logging out user."));
		} else {
			//Send Success.
			res.send(templates.response(codes.success, "Logged out", userFound));
		}
	});
});

router.route('/register').post(function (req, res) {
	var user = models.user(req.body);
	user.permissions = utils.permissions.basicuser;
	user.password = utils.createHash(user.password);
	user.save(function (error, user) {
		if (error) {
			//send error.
			var message = '';
			var code = codes.fail;
			if (error.code == 11000) {
				message = "Email or Handle already registered";
				code = codes.duplicate_username;
			}
			res.status('400').send(templates.response(code, message, {}));
		} else {
			//send success.
			res.send(templates.response(codes.success, "success", user));
		}
	});
});

/**
 * Get a users info.
 * Post to update a user, to update you need mod permissions and greater permissions than the updated user.
 * 
 * Get requires a query param of the email.
 * Post requires a query param of the session token and a query param of the to be updates user's email 
 * and a body of the updated fields.
 */
router.get('/user/email', function (req, res) {
	var user_email = req.query.email;
	models.user.findOne({ email: utils.caseInsensitive(user_email) }, '_id handle email permissions', function (error, userFound) {
		if (error) {
			//Send error
			res.status('400').send(templates.response(codes.fail, "Error retrieving user", error));
		} else {
			if (userFound) {
				//Send Success.
				res.send(templates.response(codes.success, "success", userFound));
			} else {
				//Send error
				res.status('400').send(templates.response(codes.no_user_found, "Error retrieving user", 'User not found'));
			}
		}
	});
});

router.get('/user/:user_id', function (req, res) {
	var user_id = req.params.user_id;
	models.user.findOne({ _id: user_id }, '_id handle email permissions', function (error, userFound) {
		if (error) {
			//Send error
			res.status('400').send(templates.response(codes.fail, "Error retrieving user", error));
		} else {
			if (userFound) {
				//Send Success.
				res.send(templates.response(codes.success, "success", userFound));
			} else {
				//Send error
				res.status('400').send(templates.response(codes.no_user_found, "Error retrieving user", 'User not found'));
			}
		}
	});
});

router.get('/user/handle/:handle', function (req, res) {
	var user_id = req.params.handle;
	models.user.find({ handle: utils.caseInsensitive(user_id) }, '_id handle email permissions', function (error, userFound) {
		if (error) {
			//Send error
			res.status('400').send(templates.response(codes.fail, "Error retrieving user", error));
		} else {
			if (userFound) {
				//Send Success.
				res.send(templates.response(codes.success, "success", userFound));
			} else {
				//Send error
				res.status('400').send(templates.response(codes.no_user_found, "Error retrieving user", 'User not found'));
			}
		}
	});
});

router.post('/user/email', function (req, res) {
	var userDetailsToUpdate = models.user(req.body);
	var userEmail = req.query.email;
	var updaterSessionToken = req.session;
	if (!updaterSessionToken) {
		res.send(templates.response(codes.bad_session_token, 'Invalid session or permissions', 'Invalid session or permissions'));
		return;
	}
	//We need to find a session token so we can get a user ID/
	models.user.findOne({ email: utils.caseInsensitive(userEmail) }, '_id handle email permissions').exec()
		.then(function (user) {
			if (!user) {
				throw new templates.error(codes.no_user_found, "Cannot update user, not found", "User not found, check user id");
			}

			if (!user._id.equals(updaterSessionToken.user._id)) {

				if (updaterSessionToken.user.permissions < utils.permissions.mod) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have at least mod permissions to update users");
				}

				if (updaterSessionToken.user.permissions <= user.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the user to be updated");
				}

				if (updaterSessionToken.user.permissions <= userDetailsToUpdate.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the resultant update");
				}
			}

			//Update isNew flag otherwise it will think we are duplicating handle and email
			user.isNew = false;

			//We found the user to update
			user.email = userDetailsToUpdate.email || user.email;
			user.handle = userDetailsToUpdate.handle || user.handle;
			//0 || 1 is some dum shit in JS, this means I can't use this short hand logical OR for this
			if (userDetailsToUpdate.permissions || userDetailsToUpdate.permissions === 0) {
				user.permissions = userDetailsToUpdate.permissions;
			}
			//Gotta make a hash in this case.
			if (userDetailsToUpdate.password) {
				user.password = utils.createHash(userDetailsToUpdate.password);
			}

			return user.save();
		})
		.then(function (user) {
			res.send(templates.response(codes.success, "success", user));
		})
		.catch(function (err) {
			res.send(templates.response(err.error_code || codes.invalid_permissions, err.message || 'Fail', err.error || 'Error updating user!'));
		});
});

router.post('/user/:user_id', function (req, res) {
	var updaterSessionToken = req.session;
	var userDetailsToUpdate = models.user(req.body);
	var user_id = req.params.user_id;
	if (!updaterSessionToken) {
		res.send(templates.response(codes.bad_session_token, 'Invalid session or permissions', 'Invalid session or permissions'));
		return;
	}
	models.user.findOne({ _id: user_id }, '_id handle email permissions').exec()
		.then(function (user) {
			if (!user) {
				throw new templates.error(codes.no_user_found, "Cannot update user, not found", "User not found, check user id");
			}

			if (!user._id.equals(updaterSessionToken.user._id)) {

				if (updaterSessionToken.user.permissions < utils.permissions.mod) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have at least mod permissions to update users");
				}

				if (updaterSessionToken.user.permissions <= user.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the user to be updated");
				}

				if (updaterSessionToken.user.permissions <= userDetailsToUpdate.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the resultant update");
				}
			}

			//Update isNew flag otherwise it will think we are duplicating handle and email
			user.isNew = false;

			//We found the user to update
			user.email = userDetailsToUpdate.email || user.email;
			user.handle = userDetailsToUpdate.handle || user.handle;
			//0 || 1 is some dum shit in JS, this means I can't use this short hand logical OR for this
			if (userDetailsToUpdate.permissions || userDetailsToUpdate.permissions === 0) {
				user.permissions = userDetailsToUpdate.permissions;
			}
			//Gotta make a hash in this case.
			if (userDetailsToUpdate.password) {
				user.password = utils.createHash(userDetailsToUpdate.password);
			}

			return user.save();
		})
		.then(function (user) {
			if (user) {
				res.send(templates.response(codes.success, "success", user));
			} else {
				throw new templates.error(codes.fail, "Failed to save user", "DB error");
			}
		})
		.catch(function (err) {
			res.status('400').send(templates.response(err.error_code || codes.fail, err.message || 'Fail', err.error || 'Error updating!'));
		});
});

router.post('/user/handle/:user_id', function (req, res) {
	var updaterSessionToken = req.session;
	var userDetailsToUpdate = models.user(req.body);
	var user_id = req.params.user_id;
	if (!updaterSessionToken) {
		res.send(templates.response(codes.bad_session_token, 'Invalid session or permissions', 'Invalid session or permissions'));
		return;
	}
	models.user.findOne({ handle: utils.caseInsensitive(user_id) }, '_id handle email permissions').exec()
		.then(function (user) {
			if (!user) {
				throw new templates.error(codes.no_user_found, "Cannot update user, not found", "User not found, check user id");
			}

			if (!user._id.equals(updaterSessionToken.user._id)) {

				if (updaterSessionToken.user.permissions < utils.permissions.mod) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have at least mod permissions to update users");
				}

				if (updaterSessionToken.user.permissions <= user.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the user to be updated");
				}

				if (updaterSessionToken.user.permissions <= userDetailsToUpdate.permissions) {
					throw new templates.error(codes.invalid_permissions, "Invalid permissons", "You must have greater permissions than the resultant update");
				}
			}

			//Update isNew flag otherwise it will think we are duplicating handle and email
			user.isNew = false;

			//We found the user to update
			user.email = userDetailsToUpdate.email || user.email;
			user.handle = userDetailsToUpdate.handle || user.handle;
			//0 || 1 is some dum shit in JS, this means I can't use this short hand logical OR for this
			if (userDetailsToUpdate.permissions || userDetailsToUpdate.permissions === 0) {
				user.permissions = userDetailsToUpdate.permissions;
			}
			//Gotta make a hash in this case.
			if (userDetailsToUpdate.password) {
				user.password = utils.createHash(userDetailsToUpdate.password);
			}

			return user.save();
		})
		.then(function (user) {
			if (user) {
				res.send(templates.response(codes.success, "success", user));
			} else {
				throw new templates.error(codes.fail, "Failed to save user", "DB error");
			}
		})
		.catch(function (err) {
			res.status('400').send(templates.response(err.error_code || codes.fail, err.message || 'Fail', err.error || 'Error updating!'));
		});
});

module.exports = router;
