const express = require("express");
const router = express.Router();

const CoursesModel = require("../models/courses");
const SyllabiModel = require("../models/syllabi");

function validateCourseData(data) {
  const errors = [];
  if (!data.code) errors.push("Course code is required");
  if (!data.title) errors.push("Course title is required");
  if (!data.department) errors.push("Department is required");
  if (!data.credits || data.credits < 0)
    errors.push("Valid credits value is required");
  return errors;
}

router.get("/", async function (req, res, next) {
  try {
    let courses;
    if (req.query.department) {
      courses = await CoursesModel.getByDepartment(req.query.department);
    } else if (req.query.search) {
      courses = await CoursesModel.search(req.query.search);
    } else {
      courses = await CoursesModel.all();
    }

    const departments = await CoursesModel.getDepartments();

    res.render("courses/index", {
      title: "Courses",
      courses,
      departments,
      currentDepartment: req.query.department,
      searchQuery: req.query.search,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).render("error", {
      message: "Failed to load courses. Please try again later.",
    });
  }
});

router.get("/new", async function (req, res, next) {
  const departments = await CoursesModel.getDepartments();
  res.render("courses/form", {
    title: "New Course",
    course: {},
    departments: departments,
    isNew: true,
  });
});

// POST /courses - Create new course
router.post("/", async function (req, res, next) {
  try {
    const courseData = {
      code: req.body.code,
      title: req.body.title,
      description: req.body.description,
      department: req.body.department,
      credits: parseInt(req.body.credits),
    };

    const errors = validateCourseData(courseData);
    if (errors.length > 0) {
      const departments = await CoursesModel.getDepartments();
      return res.render("courses/form", {
        title: "New Course",
        course: courseData,
        departments: departments,
        errors: errors,
        isNew: true,
      });
    }

    const course = await CoursesModel.add(courseData);

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: `Course "${course.code}: ${course.title}" has been created.`,
    };

    res.redirect(`/courses/${course.id}`);
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).render("error", {
      message: "Failed to create course. Please try again.",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const course = await CoursesModel.get(req.params.id);
    if (!course) {
      return res.status(404).render("error", {
        message: "Course not found",
      });
    }

    const linkedSyllabi = await SyllabiModel.getByCourse(req.params.id);

    const unlinkedSyllabi = await SyllabiModel.getUnlinked();

    res.render("courses/show", {
      title: `${course.code}: ${course.title}`,
      course,
      linkedSyllabi,
      unlinkedSyllabi,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).render("error", {
      message: "Failed to load course. Please try again later.",
    });
  }
});

router.get("/:id/edit", async (req, res) => {
  try {
    const course = await CoursesModel.get(req.params.id);
    if (!course) {
      return res.status(404).render("error", {
        message: "Course not found",
      });
    }

    const departments = await CoursesModel.getDepartments();

    res.render("courses/form", {
      title: "Edit Course",
      course,
      departments,
      isNew: false,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).render("error", {
      message: "Failed to load course. Please try again later.",
    });
  }
});

// POST /courses/:id - Update course
router.post("/:id", async (req, res) => {
  try {
    const courseData = {
      id: req.params.id,
      code: req.body.code,
      title: req.body.title,
      description: req.body.description,
      department: req.body.department,
      credits: parseInt(req.body.credits),
    };

    const errors = validateCourseData(courseData);
    if (errors.length > 0) {
      const departments = await CoursesModel.getDepartments();
      return res.render("courses/form", {
        title: "Edit Course",
        course: courseData,
        departments,
        errors,
        isNew: false,
      });
    }

    const course = await CoursesModel.update(courseData);

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: `Course "${course.code}: ${course.title}" has been updated.`,
    };

    res.redirect(`/courses/${course.id}`);
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).render("error", {
      message: "Failed to update course. Please try again.",
    });
  }
});

router.post("/:id/delete", async (req, res) => {
  try {
    const course = await CoursesModel.get(req.params.id);
    if (!course) {
      return res.status(404).render("error", {
        message: "Course not found",
      });
    }

    await CoursesModel.delete(req.params.id);

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: `Course "${course.code}: ${course.title}" has been deleted.`,
    };

    res.redirect("/courses");
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).render("error", {
      message: "Failed to delete course. Please try again later.",
    });
  }
});

router.post("/:id/link-syllabus", async (req, res) => {
  try {
    const courseId = req.params.id;
    const syllabusId = req.body.syllabus_id;

    if (!syllabusId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Please select a syllabus to link.",
      };
      return res.redirect(`/courses/${courseId}`);
    }

    const syllabus = await SyllabiModel.get(syllabusId);

    if (!syllabus) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Selected syllabus not found.",
      };
      return res.redirect(`/courses/${courseId}`);
    }

    if (syllabus.courseId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "This syllabus is already linked to a course.",
      };
      return res.redirect(`/courses/${courseId}`);
    }

    // Update the syllabus with the course ID
    await SyllabiModel.update({
      id: syllabusId,
      courseId: courseId,
      // Only include required fields from the syllabi model
      semester: syllabus.semester,
      year: syllabus.year,
      instructor: syllabus.instructor,
      urlLink: syllabus.urlLink || null,
    });

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: "Syllabus has been linked to the course.",
    };

    res.redirect(`/courses/${courseId}`);
  } catch (error) {
    console.error("Error linking syllabus:", error);
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to link syllabus. Please try again.",
    };
    res.redirect(`/courses/${courseId}`);
  }
});

// POST /courses/:id/unlink-syllabus - Unlink a syllabus from a course
router.post("/:id/unlink-syllabus", async (req, res) => {
  try {
    const courseId = req.params.id;
    const syllabusId = req.body.syllabus_id;

    if (!syllabusId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Syllabus ID is required.",
      };
      return res.redirect(`/courses/${courseId}`);
    }

    // Get the syllabus to verify it exists and belongs to this course
    const syllabus = await SyllabiModel.get(syllabusId);

    if (!syllabus || syllabus.courseId != courseId) {
      req.session.flash = {
        type: "error",
        intro: "Error!",
        message: "Invalid syllabus or syllabus does not belong to this course.",
      };
      return res.redirect(`/courses/${courseId}`);
    }

    // Update the syllabus to remove the course ID
    await SyllabiModel.update({
      id: syllabusId,
      courseId: null,
      // Only include required fields from the syllabi model
      semester: syllabus.semester,
      year: syllabus.year,
      instructor: syllabus.instructor,
      urlLink: syllabus.urlLink || null,
    });

    req.session.flash = {
      type: "success",
      intro: "Success!",
      message: "Syllabus has been unlinked from the course.",
    };

    res.redirect(`/courses/${courseId}`);
  } catch (error) {
    console.error("Error unlinking syllabus:", error);
    req.session.flash = {
      type: "error",
      intro: "Error!",
      message: "Failed to unlink syllabus. Please try again.",
    };
    res.redirect(`/courses/${req.params.id}`);
  }
});

module.exports = router;
