const express = require("express");
const router = express.Router();

const helpers = require("./helpers");

const User = require("../models/user");
const Document = require("../models/documents");
const DocumentUser = require("../models/document_user");

router.get("/register", async (req, res, next) => {
  if (helpers.isLoggedIn(req, res)) return;

  res.render("users/register", { title: "DocSystem || User registration" });
});

router.post("/register", async (req, res, next) => {
  if (helpers.isLoggedIn(req, res)) return;

  console.log("body: " + JSON.stringify(req.body));
  const result = await User.register(req.body);

  if (result) {
    req.session.flash = {
      type: "info",
      intro: "Success!",
      message: `The user ${req.body.name} has been created!`,
    };
    return res.redirect(303, "/");
  }

  res.render("users/register", {
    title: "DocSystem || User registration",
    flash: {
      type: "danger",
      intro: "Error!",
      message: "This user already exists",
    },
  });
});

router.get("/login", async (req, res, next) => {
  if (helpers.isLoggedIn(req, res)) return;

  res.render("users/login", { title: "DocSystem || User login" });
});

router.post("/login", async (req, res, next) => {
  if (helpers.isLoggedIn(req, res)) return;

  console.log("body: " + JSON.stringify(req.body));
  const user = await User.login(req.body);

  if (user) {
    req.session.currentUser = user;
    req.session.flash = {
      type: "info",
      intro: "Success!",
      message: `The user ${user.name} has been logged in!`,
    };
    return res.redirect(303, "/");
  }

  res.render("users/login", {
    title: "DocSystem || User Login",
    flash: {
      type: "danger",
      intro: "Error!",
      message:
        "Wrong email and password combination or the user could not be found",
    },
  });
});

router.post("/logout", async (req, res, next) => {
  console.log("body: " + JSON.stringify(req.body));

  const userName = req.session.currentUser?.name;

  req.session.flash = {
    type: "success",
    intro: "Success!",
    message: userName
      ? `Goodbye, ${userName}! You have been successfully logged out.`
      : "You have been successfully logged out.",
  };

  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.redirect(303, "/");
    }

    res.clearCookie("sessionId");
    res.redirect(303, "/");
  });
});

router.get("/profile", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) return;

  const documentsUser = await DocumentUser.allForUser(
    req.session.currentUser.id
  );

  res.render("users/profile", {
    title: "DocSystem || Profile",
    user: req.session.currentUser,
    documentsUser,
  });
});

module.exports = router;
