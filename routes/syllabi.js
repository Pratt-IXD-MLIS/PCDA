const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const SyllabiModel = require("../models/syllabi");
const CoursesModel = require("../models/courses");

const uploadDir = path.join(process.cwd(), "documents", "syllabi");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

router.get("/", async (req, res) => {
  try {
    let syllabi;
    const courses = await CoursesModel.all();
    const years = await SyllabiModel.getYears();

    // Handle search filters
    if (req.query.course_id) {
      syllabi = await SyllabiModel.getByCourse(req.query.course_id);
    } else if (req.query.semester && req.query.year) {
      syllabi = await SyllabiModel.getBySemesterAndYear(
        req.query.semester,
        parseInt(req.query.year)
      );
    } else if (req.query.semester) {
      syllabi = await SyllabiModel.getBySemester(req.query.semester);
    } else if (req.query.year) {
      syllabi = await SyllabiModel.getByYear(parseInt(req.query.year));
    } else if (req.query.instructor) {
      syllabi = await SyllabiModel.getByInstructor(req.query.instructor);
    } else {
      syllabi = await SyllabiModel.all();
    }

    // Group syllabi by course
    const groupedSyllabi = {};
    courses.forEach((course) => {
      groupedSyllabi[course.id] = {
        id: course.id,
        code: course.code,
        title: course.title,
        department: course.department,
        credits: course.credits,
        syllabi: [],
      };
    });

    // Add each syllabus to its course group
    syllabi.forEach((syllabus) => {
      if (syllabus.courseId && groupedSyllabi[syllabus.courseId]) {
        groupedSyllabi[syllabus.courseId].syllabi.push({
          id: syllabus.id,
          semester: syllabus.semester,
          year: syllabus.year,
          instructor: syllabus.instructor,
          urlLink: syllabus.urlLink,
        });
      }
    });

    // Sort syllabi within each group by year and semester
    Object.values(groupedSyllabi).forEach((group) => {
      group.syllabi.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        const semesterOrder = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
        return semesterOrder[b.semester] - semesterOrder[a.semester];
      });
    });

    // Convert to array and sort by course code
    const groupedSyllabiArray = Object.values(groupedSyllabi)
      .filter((group) => group.syllabi.length > 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    res.render("syllabi/index", {
      title: "Course Syllabi",
      groupedSyllabi: groupedSyllabiArray,
      courses,
      years,
      query: req.query,
    });
  } catch (error) {
    console.error("Error fetching syllabi:", error);
    res.status(500).render("syllabi/index", {
      title: "Course Syllabi",
      error: "Failed to load syllabi. Please try again later.",
    });
  }
});

router.get("/new", async (req, res) => {
  try {
    const courses = await CoursesModel.all();
    res.render("syllabi/form", {
      title: "Add New Syllabus",
      syllabus: {
        courseId: req.query.course_id || null,
      },
      courses,
      isNew: true,
    });
  } catch (error) {
    console.error("Error loading form:", error);
    res.status(500).render("error", {
      message: "Failed to load form. Please try again.",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const syllabusData = {
      semester: req.body.semester,
      year: parseInt(req.body.year),
      instructor: req.body.instructor,
      courseId: req.body.course_id,
      urlLink: req.body.url_link || null,
    };

    // Validate data
    const errors = [];
    if (!syllabusData.semester) errors.push("Semester is required");
    if (
      !syllabusData.year ||
      syllabusData.year < 2020 ||
      syllabusData.year > 2030
    )
      errors.push("Valid year between 2020 and 2030 is required");
    if (!syllabusData.instructor) errors.push("Instructor name is required");
    if (!syllabusData.courseId) errors.push("Course selection is required");
    if (
      syllabusData.urlLink &&
      !/^https:\/\/drive\.google\.com\/(open\?id=|file\/d\/|uc\?id=|drive\/folders\/)[a-zA-Z0-9_-]+(\/(view|edit|preview))?$/.test(
        syllabusData.urlLink
      )
    ) {
      errors.push(
        "Please enter a valid Google Drive URL. Accepted formats: /open?id=..., /file/d/.../view, /uc?id=..., or /drive/folders/..."
      );
    }

    if (errors.length > 0) {
      const courses = await CoursesModel.all();
      return res.render("syllabi/form", {
        title: "Add New Syllabus",
        syllabus: syllabusData,
        courses,
        errors,
        isNew: true,
      });
    }

    // Create new syllabus
    const syllabus = await SyllabiModel.add(syllabusData);

    // Add success flash message
    req.session.flash = {
      type: "success",
      intro: "Success!",
      message:
        `Syllabus for ${syllabus.semester} ${syllabus.year} has been created` +
        (syllabus.urlLink ? " with Google Drive link." : "."),
    };

    // Redirect to the syllabus detail page
    res.redirect(`/syllabi/${syllabus.id}`);
  } catch (error) {
    console.error("Error creating syllabus:", error);
    res.status(500).render("syllabi/form", {
      title: "Add New Syllabus",
      syllabus: req.body,
      error: "Failed to create syllabus. Please try again.",
      isNew: true,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    // Get the syllabus with all its details
    const syllabus = await SyllabiModel.get(req.params.id);

    if (!syllabus) {
      return res.status(404).render("error", {
        title: "Syllabus Not Found",
        message: "The requested syllabus could not be found.",
      });
    }

    // Get the course if it exists
    const course =
      syllabus.course ||
      (syllabus.courseId ? await CoursesModel.get(syllabus.courseId) : null);

    // Get documents linked to this syllabus
    const DocumentsModel = require("../models/documents");
    const documents = await SyllabiModel.getDocuments(syllabus.id);

    // Get all available documents for linking
    const allDocuments = await DocumentsModel.all();

    // Filter out already linked documents
    const linkedDocumentIds = documents.map((doc) => doc.id);
    const availableDocuments = allDocuments.filter(
      (doc) => !linkedDocumentIds.includes(doc.id)
    );

    // Parse learning objectives if they exist
    let learningObjectives = [];
    if (syllabus.learningObjectives) {
      try {
        learningObjectives = Array.isArray(syllabus.learningObjectives)
          ? syllabus.learningObjectives
          : JSON.parse(syllabus.learningObjectives);
      } catch (e) {
        console.error("Error parsing learning objectives:", e);
        learningObjectives = [syllabus.learningObjectives];
      }
    }

    const weeklySchedule = syllabus.weeklySchedule
      ? syllabus.weeklySchedule.split("\n").map((week) => week.trim())
      : [];

    // Explicitly provide CSRF token
    const csrfToken = req.csrfToken();

    // Render the syllabus template with all necessary data
    res.render("syllabi/show", {
      title: course
        ? `${course.code}: ${course.title} - ${syllabus.semester} ${syllabus.year}`
        : "Syllabus Details",
      syllabus: {
        ...syllabus,
        learningObjectives,
        weeklySchedule,
      },
      course,
      documents,
      availableDocuments,
      csrfToken,
    });
  } catch (error) {
    console.error("Error fetching syllabus:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to load syllabus. Please try again later.",
    });
  }
});

router.get("/:id/edit", async (req, res) => {
  try {
    const syllabus = await SyllabiModel.get(req.params.id);

    if (!syllabus) {
      return res.status(404).render("error", {
        title: "Syllabus Not Found",
        message: "The requested syllabus could not be found.",
      });
    }

    const courses = await CoursesModel.all();

    const DocumentsModel = require("../models/documents");
    const documents = await SyllabiModel.getDocuments(syllabus.id);

    const allDocuments = await DocumentsModel.all();

    const linkedDocumentIds = documents.map((doc) => doc.id);
    const availableDocuments = allDocuments.filter(
      (doc) => !linkedDocumentIds.includes(doc.id)
    );

    res.render("syllabi/form", {
      title: "Edit Syllabus",
      syllabus: syllabus,
      courses,
      documents,
      availableDocuments,
      isNew: false,
    });
  } catch (error) {
    console.error("Error fetching syllabus for edit:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to load syllabus for editing. Please try again later.",
    });
  }
});
router.post("/:id", async (req, res) => {
  // Note: File upload functionality has been temporarily removed

  try {
    // Get existing syllabus to preserve file path if no new file uploaded
    const existingSyllabus = await SyllabiModel.get(req.params.id);

    if (!existingSyllabus) {
      return res.status(404).render("error", {
        title: "Syllabus Not Found",
        message: "The requested syllabus could not be found.",
      });
    }

    // Transform form data to match model expectations
    const syllabusData = {
      id: req.params.id,
      semester: req.body.semester,
      year: parseInt(req.body.year),
      instructor: req.body.instructor,
      courseId: req.body.course_id,
      urlLink: req.body.url_link || null,
      filePath: existingSyllabus.filePath, // Preserve existing file path
    };

    // Validate data
    const errors = [];
    if (!syllabusData.semester) errors.push("Semester is required");
    if (
      !syllabusData.year ||
      syllabusData.year < 2020 ||
      syllabusData.year > 2030
    )
      errors.push("Valid year between 2020 and 2030 is required");
    if (!syllabusData.instructor) errors.push("Instructor name is required");
    if (!syllabusData.courseId) errors.push("Course selection is required");
    if (
      syllabusData.urlLink &&
      !/^https:\/\/drive\.google\.com\/(open\?id=|file\/d\/|uc\?id=|drive\/folders\/)[a-zA-Z0-9_-]+(\/(view|edit|preview))?$/.test(
        syllabusData.urlLink
      )
    ) {
      errors.push(
        "Please enter a valid Google Drive URL. Accepted formats: /open?id=..., /file/d/.../view, /uc?id=..., or /drive/folders/..."
      );
    }

    // If validation fails, re-render form with errors
    if (errors.length > 0) {
      const courses = await CoursesModel.all();
      const documents = await SyllabiModel.getDocuments(req.params.id);

      return res.render("syllabi/form", {
        title: "Edit Syllabus",
        syllabus: syllabusData,
        courses,
        documents,
        errors,
        isNew: false,
      });
    }

    // Update syllabus
    const syllabus = await SyllabiModel.update(syllabusData);

    if (!syllabus) {
      throw new Error("Update operation failed - no data returned");
    }

    // Add success flash message
    const urlMessage =
      !existingSyllabus.urlLink && syllabusData.urlLink
        ? " and Google Drive link was added"
        : existingSyllabus.urlLink !== syllabusData.urlLink &&
          syllabusData.urlLink
        ? " and Google Drive link was updated"
        : "";

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: `Syllabus for ${syllabus.semester} ${syllabus.year} has been updated${urlMessage}.`,
    };

    // Redirect to the syllabus detail page
    return res.redirect(`/syllabi/${syllabus.id}`);
  } catch (error) {
    console.error("Error updating syllabus:", error);

    try {
      // Get required data for form re-render
      const courses = await CoursesModel.all();
      const documents = await SyllabiModel.getDocuments(req.params.id);

      // Re-render form with error
      return res.status(500).render("syllabi/form", {
        title: "Edit Syllabus",
        syllabus: {
          id: req.params.id,
          semester: req.body.semester,
          year: req.body.year,
          instructor: req.body.instructor,
          courseId: req.body.course_id,
          urlLink: req.body.url_link || null,
        },
        courses,
        documents,
        errors: ["Failed to update syllabus: " + error.message],
        isNew: false,
      });
    } catch (renderError) {
      // If form re-render fails, show a simple error page
      console.error("Error rendering form after update failure:", renderError);
      return res.status(500).render("error", {
        title: "System Error",
        message: "An unexpected error occurred. Please try again later.",
      });
    }
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const syllabus = await SyllabiModel.get(req.params.id);

    if (!syllabus) {
      return res.status(404).render("error", {
        title: "Syllabus Not Found",
        message: "The requested syllabus could not be found.",
      });
    }

    // Delete the syllabus file if it exists
    if (syllabus.filePath) {
      const filePath = path.join(process.cwd(), syllabus.filePath.substring(1));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete the syllabus from the database
    await SyllabiModel.delete(req.params.id);

    // Add success flash message
    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: "Syllabus has been deleted.",
    };

    // Redirect to the syllabi list
    res.redirect("/syllabi");
  } catch (error) {
    console.error("Error deleting syllabus:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to delete syllabus. Please try again later.",
    });
  }
});

router.get("/download/:id", async (req, res) => {
  try {
    const syllabus = await SyllabiModel.get(req.params.id);

    if (!syllabus || !syllabus.filePath) {
      return res.status(404).render("error", {
        title: "File Not Found",
        message: "The requested syllabus file could not be found.",
      });
    }

    const filePath = path.join(process.cwd(), syllabus.filePath.substring(1));
    if (!fs.existsSync(filePath)) {
      return res.status(404).render("error", {
        title: "File Not Found",
        message:
          "The requested syllabus file could not be found on the server.",
      });
    }

    // Send the file as a download
    res.download(filePath);
  } catch (error) {
    console.error("Error downloading syllabus file:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to download syllabus file. Please try again later.",
    });
  }
});

router.post("/:id/link-document", async (req, res) => {
  try {
    const syllabusId = req.params.id;
    const documentId = req.body.document_id;

    if (!syllabusId || !documentId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Syllabus ID and Document ID are required.",
      };
      return res.redirect(`/syllabi/${syllabusId || ""}`);
    }

    // Verify syllabus exists
    const syllabus = await SyllabiModel.get(syllabusId);
    if (!syllabus) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "The requested syllabus could not be found.",
      };
      return res.redirect("/syllabi");
    }

    // Verify document exists and get its type
    const DocumentsModel = require("../models/documents");
    const document = await DocumentsModel.get(documentId);
    if (!document) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "The requested document could not be found.",
      };
      return res.redirect(`/syllabi/${syllabusId}`);
    }

    // Verify document has a valid document_type
    const validTypes = ['PDF', 'EPUB', 'MOBI', 'DOCX', 'TXT'];
    if (!document.documentType || !validTypes.includes(document.documentType.toUpperCase())) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: `Invalid document type: ${document.documentType || 'missing'}. Must be one of: ${validTypes.join(', ')}`,
      };
      return res.redirect(`/syllabi/${syllabusId}`);
    }

    try {
      // Link document to syllabus - document_type will be fetched within linkDocument method
      const result = await SyllabiModel.linkDocument(syllabusId, documentId);

      // Flash success message
      req.session.flash = {
        type: result.alreadyLinked ? "info" : "success",
        intro: result.alreadyLinked ? "Note" : "Success!",
        message: result.alreadyLinked
          ? `Document "${document.title}" is already linked to the syllabus.`
          : `Document "${document.title}" has been linked to the syllabus.`,
      };
    } catch (linkError) {
      console.error("Error in linkDocument function:", linkError);
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: `Failed to link document: ${linkError.message}`,
      };
    }

    // Redirect back to syllabus page
    res.redirect(`/syllabi/${syllabusId}`);
  } catch (error) {
    console.error("Error linking document to syllabus:", error);
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to link document to syllabus. Please try again later.",
    };
    // Try to redirect back to a safe page
    try {
      res.redirect(`/syllabi/${req.params.id}`);
    } catch (redirectError) {
      res.redirect("/syllabi");
    }
  }
});

router.post("/:id/unlink-document", async (req, res) => {
  try {
    const syllabusId = req.params.id;
    const documentId = req.body.document_id;

    if (!syllabusId || !documentId) {
      return res.status(400).render("error", {
        title: "Bad Request",
        message: "Syllabus ID and Document ID are required.",
      });
    }

    const syllabus = await SyllabiModel.get(syllabusId);
    if (!syllabus) {
      return res.status(404).render("error", {
        title: "Syllabus Not Found",
        message: "The requested syllabus could not be found.",
      });
    }

    // Unlink document from syllabus
    await SyllabiModel.unlinkDocument(syllabusId, documentId);

    // Flash success message
    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: "Document has been unlinked from the syllabus.",
    };

    // Redirect back to syllabus page
    res.redirect(`/syllabi/${syllabusId}`);
  } catch (error) {
    console.error("Error unlinking document from syllabus:", error);
    res.status(500).render("error", {
      title: "Error",
      message:
        "Failed to unlink document from syllabus. Please try again later.",
    });
  }
});

module.exports = router;
