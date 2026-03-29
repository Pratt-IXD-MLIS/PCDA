const db = require("../database");

const all = async () => {
  const { rows } = await db
    .getPool()
    .query("SELECT * FROM courses ORDER BY department, code");
  return db.camelize(rows);
};

const get = async (id) => {
  const { rows } = await db
    .getPool()
    .query("SELECT * FROM courses WHERE id = $1", [id]);
  return rows.length ? db.camelize(rows)[0] : null;
};

const getSyllabi = async (courseId) => {
  const { rows } = await db
    .getPool()
    .query(
      "SELECT * FROM syllabi WHERE course_id = $1 ORDER BY semester DESC",
      [courseId]
    );
  return db.camelize(rows);
};

const getByDepartment = async (department) => {
  const { rows } = await db
    .getPool()
    .query("SELECT * FROM courses WHERE department = $1 ORDER BY code", [
      department,
    ]);
  return db.camelize(rows);
};

const search = async (query) => {
  const { rows } = await db.getPool().query(
    `SELECT * FROM courses
     WHERE code ILIKE $1
        OR title ILIKE $1
        OR description ILIKE $1
     ORDER BY department, code`,
    [`%${query}%`]
  );
  return db.camelize(rows);
};

const add = async (course) => {
  const { rows } = await db.getPool().query(
    `INSERT INTO courses (code, title, description, department, credits)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      course.code,
      course.title,
      course.description,
      course.department,
      course.credits,
    ]
  );
  return db.camelize(rows)[0];
};

const update = async (course) => {
  const { rows } = await db.getPool().query(
    `UPDATE courses
     SET code = $1, title = $2, description = $3, department = $4, credits = $5
     WHERE id = $6
     RETURNING *`,
    [
      course.code,
      course.title,
      course.description,
      course.department,
      course.credits,
      course.id,
    ]
  );
  return db.camelize(rows)[0];
};

const remove = async (id) => {
  const { rowCount } = await db
    .getPool()
    .query("DELETE FROM courses WHERE id = $1", [id]);
  return rowCount > 0;
};

const getDepartments = async () => {
  const { rows } = await db
    .getPool()
    .query("SELECT DISTINCT department FROM courses ORDER BY department");
  return rows.map((row) => row.department);
};

module.exports = {
  all,
  get,
  getSyllabi,
  getByDepartment,
  search,
  add,
  update,
  remove,
  getDepartments,
};
