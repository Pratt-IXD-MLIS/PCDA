const express = require("express");
const router = express.Router();
const Tag = require("../models/tag");

router.get("/", async (req, res, next) => {
  const tags = await Tag.all();
  res.render("tags/index", { title: "DocSystem || Tags", tags: tags });
});

router.get("/form", async (req, res, next) => {
  res.render("tags/form", { title: "DocSystem || Add Tag" });
});

router.get("/edit", async (req, res, next) => {
  let tag = await Tag.get(req.query.id);
  res.render("tags/form", { title: "DocSystem || Edit Tag", tag: tag });
});

router.post("/upsert", async (req, res, next) => {
  console.log("body: " + JSON.stringify(req.body));
  await Tag.upsert(req.body);
  let createdOrupdated = req.body.id ? "updated" : "created";
  req.session.flash = {
    type: "info",
    intro: "Success!",
    message: `The tag has been ${createdOrupdated}!`,
  };
  res.redirect(303, "/tags");
});

module.exports = router;

