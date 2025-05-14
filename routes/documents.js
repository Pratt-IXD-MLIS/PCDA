const express = require('express');
const router = express.Router();
const Document = require('../models/documents');
const Tag = require('../models/tag');
const DocumentUser = require('../models/document_user');
const helpers = require('./helpers');

// Get all documents with filtering, sorting and pagination
router.get("/", async (req, res, next) => {
  try {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const search = req.query.search || '';
  const documentType = req.query.documentType || '';
  const sortBy = req.query.sortBy || '';

  const options = {
    page,
    limit,
    search,
    documentType,
    sortBy
  };

    const { documents, total } = await Document.allWithOptions(options);
  const totalPages = Math.ceil(total / limit);

  const pagination = {
    currentPage: page,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
    prevPage: page - 1,
    nextPage: page + 1,
    pages: Array.from(
      { length: Math.min(5, totalPages) },
      (_, i) => ({
        pageNumber: Math.max(1, page - 2) + i,
        active: Math.max(1, page - 2) + i === page
      })
    ),
  };

  const documentIds = documents.map((doc) => doc.id);

  // No authors to fetch for documents
  documents.forEach((doc) => (doc.authors = []));

  const docsWithTags = documents.filter((doc) => doc.tagId);
  if (docsWithTags.length > 0) {
    try {
      const tagIds = [...new Set(docsWithTags.map((doc) => doc.tagId))];
      const allTags = await Promise.all(tagIds.map((tagId) => Tag.get(tagId)));
      const tagMap = Object.fromEntries(allTags.filter(Boolean).map((tag) => [tag.id, tag]));
      documents.forEach((doc) => {
        if (doc.tagId && tagMap[doc.tagId]) doc.tag = tagMap[doc.tagId];
      });
    } catch {
      // Ignore tag fetching errors
    }
  }

  try {
    const SyllabiModel = require('../models/syllabi');
    const syllabiCounts = await Promise.all(
      documents.map(async (doc) => {
        try {
          const syllabi = await SyllabiModel.getByDocumentId(doc.id);
          return syllabi ? syllabi.length : 0;
        } catch {
          return 0;
        }
      })
    );
    documents.forEach((doc, index) => (doc.syllabiCount = syllabiCounts[index]));
  } catch {
    documents.forEach((doc) => (doc.syllabiCount = 0));
  }

    res.render("documents/index", {
      title: "DocSystem || Documents Library",
      documents,
      pagination: totalPages > 1 ? pagination : null,
      filters: { search, documentType, sortBy },
      isLoggedIn: !!req.session.currentUser,
      currentUser: req.session.currentUser
    });
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not retrieve documents. Please try again later.",
    };
    res.redirect("/");
  }
});

// Display document creation form
router.get("/form", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) {
    return;
  }
  try {
    res.render("documents/form", {
      title: "DocSystem || Add Document URL",
      tags: await Tag.all(),
    });
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not load document form. Please try again later.",
    };
    res.redirect("/documents");
  }
});

// Create or update a document
router.post("/upsert", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) {
    return;
  }
  try {
    if (!req.body.title || !req.body.url) {
      req.session.flash = {
        type: "error",
        intro: "Validation Error!",
        message: "Document title and URL are required.",
      };
      return res.redirect("/documents/form");
    }

    const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlPattern.test(req.body.url)) {
      req.session.flash = {
        type: "error",
        intro: "Validation Error!",
        message: "Please enter a valid URL including http:// or https://.",
      };
      return res.redirect("/documents/form");
    }

    req.body.documentType = (req.body.documentType || "PDF").toUpperCase();
    const validTypes = ["PDF", "EPUB", "MOBI", "DOCX", "TXT"];
    if (!validTypes.includes(req.body.documentType)) req.body.documentType = "PDF";

    if (req.body.publishingYear) {
      const year = parseInt(req.body.publishingYear);
      if (isNaN(year) || year < 1000 || year > new Date().getFullYear()) {
        req.session.flash = {
          type: "error",
          intro: "Validation Error!",
          message: "Invalid publishing year.",
        };
        return res.redirect("/documents/form");
      }
    }

    const document = await Document.upsert(req.body);
    const action = req.body.id ? "updated" : "created";
    
    // If this is a new document (not an update), create the document-user association
    if (!req.body.id && document) {
      try {
        await DocumentUser.add({
          documentId: document.id,
          userId: req.session.currentUser.id,
          read_status: 'unread'
        });
      } catch (error) {
        console.error('Error creating document-user association:', error);
        // Continue execution even if association fails
      }
    }

    req.session.flash = {
      type: "info",
      intro: "Success!",
      message: `The document URL "${req.body.title}" has been ${action}!`,
    };

    res.redirect(303, "/documents");
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not save document. Please try again later.",
    };
    res.redirect("/documents/form");
  }
});

// Display document edit form
router.get("/edit", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) {
    return;
  }
  try {
    const documentId = req.query.id;
    const document = await Document.get(documentId);

    if (!document) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document not found.",
      };
      return res.redirect("/documents");
    }

    const SyllabiModel = require("../models/syllabi");
    const linkedSyllabi = await SyllabiModel.getByDocumentId(documentId);
    const allSyllabi = await SyllabiModel.all();
    const availableSyllabi = allSyllabi.filter((s) => !linkedSyllabi.some((ls) => ls.id === s.id));

    res.render("documents/form", {
      title: "DocSystem || Edit Document URL",
      document,
      tags: await Tag.all(),
      linkedSyllabi,
      availableSyllabi,
    });
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not load document edit form. Please try again later.",
    };
    res.redirect("/documents");
  }
});

// Show document details
router.get("/show/:id", async (req, res, next) => {
  try {
    const documentId = parseInt(req.params.id, 10);

    if (isNaN(documentId) || documentId <= 0) {
      req.session.flash = {
        type: "error",
        intro: "Invalid Request",
        message: "The document ID provided is invalid.",
      };
      return res.redirect("/documents");
    }

    const document = await Document.get(documentId);

    if (!document) {
      req.session.flash = {
        type: "error",
        intro: "Document Not Found",
        message: "The requested document could not be found.",
      };
      return res.redirect("/documents");
    }

    const SyllabiModel = require("../models/syllabi");
    const linkedSyllabi = await SyllabiModel.getByDocumentId(document.id);
    const relatedDocuments = (await Document.getRelatedDocuments?.(document.id)) || [];

    res.render("documents/show", {
      title: `DocSystem || ${document.title}`,
      document,
      linkedSyllabi,
      relatedDocuments,
      isLoggedIn: !!req.session.currentUser,
      currentUser: req.session.currentUser
    });
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error",
      message: "Could not load document details. Please try again later.",
    };
    res.redirect("/documents");
  }
});

// Get documents by document type
router.get("/type/:documentType", async (req, res, next) => {
  try {
    const documentType = req.params.documentType.toUpperCase();
    const validTypes = ["PDF", "EPUB", "MOBI", "DOC", "DOCX", "TXT"];

    if (!validTypes.includes(documentType)) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Invalid document type specified.",
      };
      return res.redirect("/documents");
    }

    const documents = await Document.getByDocumentType(documentType);

    res.render("documents/index", {
      title: `DocSystem || ${documentType} Documents`,
      documents,
      documentType,
      isLoggedIn: !!req.session.currentUser,
      currentUser: req.session.currentUser
    });
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not retrieve documents. Please try again later.",
    };
    res.redirect("/documents");
  }
});

// Redirect to document URL
router.get("/download/:id", async (req, res, next) => {
  try {
    const document = await Document.get(req.params.id);

    if (!document) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document not found.",
      };
      return res.redirect("/documents");
    }

    if (!document.url) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "This document doesn't have a URL to visit.",
      };
      return res.redirect(`/documents/show/${req.params.id}`);
    }

    res.redirect(document.url);
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Could not download document. Please try again later.",
    };
    res.redirect(`/documents/show/${req.params.id}`);
  }
});

// POST /documents/:id/link-syllabus - Link a syllabus to a document
router.post("/:id/link-syllabus", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) {
    return;
  }
  try {
    const { id: documentId } = req.params;
    const { syllabus_id: syllabusId } = req.body;

    if (!documentId || !syllabusId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document ID and Syllabus ID are required.",
      };
      return res.redirect(`/documents/edit?id=${documentId}`);
    }

    const document = await Document.get(documentId);
    const SyllabiModel = require("../models/syllabi");
    const syllabus = await SyllabiModel.get(syllabusId);

    if (!document || !syllabus) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document or syllabus not found.",
      };
      return res.redirect(`/documents/edit?id=${documentId}`);
    }

    await Document.linkToSyllabus(documentId, syllabusId);

    req.session.flash = {
      type: "info",
      intro: "Success!",
      message: "Syllabus has been linked to the document.",
    };

    res.redirect(`/documents/edit?id=${documentId}`);
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to link syllabus. Please try again.",
    };
    res.redirect(`/documents/edit?id=${req.params.id}`);
  }
});

// POST /documents/:id/unlink-syllabus - Unlink a syllabus from a document
router.post("/:id/unlink-syllabus", async (req, res, next) => {
  if (helpers.ForceLoggedInUser(req, res)) {
    return;
  }
  try {
    const { id: documentId } = req.params;
    const { syllabus_id: syllabusId } = req.body;

    if (!documentId || !syllabusId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Document ID and Syllabus ID are required.",
      };
      return res.redirect(`/documents/edit?id=${documentId}`);
    }

    const unlinkResult = await Document.unlinkFromSyllabus(documentId, syllabusId);

    req.session.flash = unlinkResult
      ? { type: "info", intro: "Success!", message: "Syllabus has been unlinked from the document." }
      : { type: "error", intro: "Error!", message: "Failed to unlink syllabus. It may already be unlinked." };

    res.redirect(`/documents/edit?id=${documentId}`);
  } catch {
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to unlink syllabus. Please try again.",
    };
    res.redirect(`/documents/edit?id=${req.params.id}`);
  }
});

module.exports = router;
