const express = require("express");
const path = require("path");
const fs = require("fs");

const DEBUG = false; // Set to true only in development
const log = {
  debug: (...args) => DEBUG && console.log(...args),
  error: console.error,
};

const { credentials } = require("./config");
const handlebars = require("express-handlebars").create({
  defaultLayout: "main",
  extname: ".handlebars",
  rethrow: true,
  strict: true,
  preventIndent: true,
  helpers: {
    eq: (v1, v2) => v1 == v2,
    ne: (v1, v2) => v1 != v2,
    lt: (v1, v2) => v1 < v2,
    gt: (v1, v2) => v1 > v2,
    lte: (v1, v2) => v1 <= v2,
    gte: (v1, v2) => v1 >= v2,
    and() {
      return Array.prototype.every.call(arguments, Boolean);
    },
    or() {
      return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    },

    someId: (arr, id) => arr && arr.some((obj) => obj.id == id),
    in: (arr, obj) => arr && arr.some((val) => val == obj),

    dateStr: (v) => v && v.toLocaleDateString("en-US"),

    formatDate: function (date, format) {
      if (!date) return "";

      if (typeof date === "string") {
        date = new Date(date);
      }

      if (!(date instanceof Date) || isNaN(date)) {
        return "";
      }

      if (!format) {
        return date.toLocaleDateString("en-US");
      }

      return format.replace(/(MM|DD|YYYY|mm|ss|HH|hh)/g, function (match) {
        switch (match) {
          case "MM":
            return ("0" + (date.getMonth() + 1)).slice(-2);
          case "DD":
            return ("0" + date.getDate()).slice(-2);
          case "YYYY":
            return date.getFullYear();
          case "mm":
            return ("0" + date.getMinutes()).slice(-2);
          case "ss":
            return ("0" + date.getSeconds()).slice(-2);
          case "HH":
            return ("0" + date.getHours()).slice(-2);
          case "hh":
            return ("0" + (date.getHours() % 12 || 12)).slice(-2);
          default:
            return match;
        }
      });
    },

    truncate: function (str, len) {
      if (!str) return "";
      if (str.length <= len) return str;
      return str.substring(0, len) + "...";
    },

    capitalize: function (str) {
      if (!str) return "";
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    toLowerCase: function (str) {
      return str ? str.toLowerCase() : "";
    },

    toUpperCase: function (str) {
      return str ? str.toUpperCase() : "";
    },

    // Helper for debugging in templates
    debug: function (value) {
      console.log("Template Debug - Value:", value);
      return "";
    },
  },
});

const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const expressSession = require("express-session");
const csrf = require("csurf");
const methodOverride = require("method-override");

const indexRouter = require("./routes/index");
const documentsRouter = require("./routes/documents");
const usersRouter = require("./routes/users");
const tagsRouter = require("./routes/tags");
const documentUsersRouter = require("./routes/document_users");
const syllabiRouter = require("./routes/syllabi");
const coursesRouter = require("./routes/courses");

const app = express();
const port = 3000;

app.engine("handlebars", handlebars.engine);
app.set("view engine", "handlebars");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(cookieParser(credentials.cookieSecret));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(methodOverride("_method"));

app.use(
  expressSession({
    secret: credentials.cookieSecret,
    name: "sessionId",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to false for development
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Simple CSRF protection with logout handling
app.use(
  csrf({
    cookie: false, // We're using session instead of cookies
    ignoreMethods: ["GET", "HEAD", "OPTIONS"],
    value: (req) => {
      return (
        req.body._csrf ||
        (req.query && req.query._csrf) ||
        req.headers["csrf-token"] ||
        req.headers["xsrf-token"] ||
        req.headers["x-csrf-token"] ||
        req.headers["x-xsrf-token"]
      );
    },
  })
);

// Make CSRF token available to templates
app.use((req, res, next) => {
  // Generate token and add to locals
  res.locals.csrfToken = req.csrfToken();

  // Add to data context for backward compatibility
  if (!res.locals.data) {
    res.locals.data = {};
  }
  res.locals.data.csrfToken = res.locals.csrfToken;

  // Debug logging
  if (process.env.NODE_ENV === "development") {
    console.log("Path:", req.path);
    console.log("CSRF token generated:", res.locals.csrfToken);
  }

  next();
});

// CSRF error handler
app.use((err, req, res, next) => {
  if (err && err.code === "EBADCSRFTOKEN") {
    // Special handling for logout
    if (req.path === "/users/logout") {
      // Regenerate session to maintain flash message
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration failed:", err);
          return res.redirect(303, "/");
        }

        // Set flash message for successful logout
        req.session.flash = {
          type: "success",
          intro: "Success!",
          message: "You have been successfully logged out.",
        };

        // Clear session cookie and redirect
        res.clearCookie("sessionId");
        return res.redirect(303, "/");
      });
      return;
    }

    // Log error details with simplified context
    console.error("CSRF token validation failed:", {
      path: req.path,
      method: req.method,
      body: req.body,
    });

    if (req.xhr || req.path.startsWith("/api/")) {
      return res.status(403).json({ error: "CSRF token validation failed" });
    }

    // Set flash message
    req.session.flash = {
      type: "error",
      intro: "Security Error",
      message: "Form session expired. Please try again.",
    };

    // Use 303 redirect to force GET for the redirected request
    return res.redirect(303, req.get("Referer") || "/");
  }

  next(err);
});

app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

app.use((req, res, next) => {
  res.locals.currentUser = req.session.currentUser;
  // Set isLoggedIn based on currentUser for template conditionals
  res.locals.isLoggedIn = !!req.session.currentUser;
  // Add DEBUG flag for templates
  res.locals.DEBUG = process.env.DEBUG === "true";
  next();
});

// Create documents and syllabi directories if they don't exist
const documentsDir = path.join(__dirname, "documents");
const syllabiDir = path.join(documentsDir, "syllabi");
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}
if (!fs.existsSync(syllabiDir)) {
  fs.mkdirSync(syllabiDir, { recursive: true });
}

// Configure static file serving
app.use(
  "/bootstrap",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist"))
);
app.use("/documents", express.static(path.join(__dirname, "documents")));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  log.debug(`${req.method} ${req.url}`);
  next();
});

app.use("/", indexRouter);
app.use("/documents", documentsRouter);
app.use("/users", usersRouter);
app.use("/tags", tagsRouter);
app.use("/document_users", documentUsersRouter);
app.use("/syllabi", syllabiRouter);
app.use("/courses", coursesRouter);

app.use((req, res) => {
  res.status(404);
  res.send("<h1>404 - Not Found</h1>");
});

app.use((err, req, res, next) => {
  log.error(err.message);
  res.type("text/plain");
  res.status(500);
  res.send("500 - Server Error");
});

app.listen(port, () =>
  console.log(
    `DocSystem started on http://localhost:${port}; ` +
      `press Ctrl-C to terminate.`
  )
);
