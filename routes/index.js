const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  res.render('index', {
    title: "DocSystem",
    subtitle: "Document Management System",
    welcomeMessage: "Welcome to DocSystem, your central hub for all document types."
  });
});
module.exports = router;
