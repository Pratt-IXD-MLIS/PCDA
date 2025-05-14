const express = require("express");
const router = express.Router();
const helpers = require("./helpers");
const Document = require("../models/documents");
const DocumentUser = require("../models/document_user");

router.post("/update", async (req, res, next) => {
  try {
    if (helpers.isNotLoggedIn(req, res)) {
      return;
    }

    const documentId = req.body.documentId;
    const status = req.body.status;
    const userId = req.session.currentUser.id;

    if (!documentId || !status || !DocumentUser.statuses.includes(status)) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Invalid document status update request.",
      };
      return res.redirect("/documents");
    }

    // Get the document to verify it exists
    const document = await Document.get(documentId);
    if (!document) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document not found.",
      };
      return res.redirect("/documents");
    }

    // Update or create the document-user relationship
    const documentUser = {
      documentId: documentId,
      userId: userId,
      status: status,
    };

    await DocumentUser.upsert(documentUser);

    req.session.flash = {
      type: "info",
      intro: "Success!",
      message: `Document "${document.title}" marked as "${status}".`,
    };

    // Redirect back to the document page or referring page
    const redirectUrl = req.body.redirectUrl || `/documents/show/${documentId}`;
    res.redirect(303, redirectUrl);
  } catch (error) {
    console.error("Error updating document status:", error);
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to update document status. Please try again later.",
    };
    res.redirect("/documents");
  }
});

// Get documents by status
router.get("/status/:status", async (req, res, next) => {
  try {
    // Check if user is logged in
    if (helpers.isNotLoggedIn(req, res)) {
      return;
    }

    const status = req.params.status;
    const userId = req.session.currentUser.id;

    // Validate status
    if (!DocumentUser.statuses.includes(status)) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Invalid reading status specified.",
      };
      return res.redirect("/users/profile");
    }

    // Get documents with the specified status
    const documents = await DocumentUser.getDocumentsByStatus(userId, status);

    // Format status for display
    const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1);

    res.render("documents/index", {
      title: `DocSystem || ${formattedStatus} Documents`,
      documents: documents,
      status: status,
    });
  } catch (error) {
    console.error("Error getting documents by status:", error);
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not retrieve documents. Please try again later.",
    };
    res.redirect("/users/profile");
  }
});

module.exports = router;
