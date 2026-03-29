const db = require("../database");

const statuses = ["todo", "reading", "finished"];

const add = async (documentUser) => {
  const { rows } = await db
    .getPool()
    .query(
      "INSERT INTO documents_users(document_id, user_id, read_status) VALUES($1, $2, $3) RETURNING *",
      [documentUser.documentId, documentUser.userId, documentUser.read_status]
    );
  return db.camelize(rows)[0];
};

const get = async (document, userId) => {
  const { rows } = await db
    .getPool()
    .query(
      "SELECT * FROM documents_users WHERE document_id = $1 AND user_id = $2",
      [document.id, userId]
    );
  return rows.length ? db.camelize(rows)[0] : null;
};

const allForUser = async (userId) => {
  const { rows } = await db
    .getPool()
    .query("SELECT * FROM documents_users WHERE user_id = $1", [userId]);
  return db.camelize(rows);
};

const update = async (documentUser) => {
  const { rows } = await db
    .getPool()
    .query(
      "UPDATE documents_users SET read_status = $3 WHERE document_id = $1 AND user_id = $2 RETURNING *",
      [documentUser.documentId, documentUser.userId, documentUser.read_status]
    );
  return rows.length ? db.camelize(rows)[0] : null;
};

const upsert = async (documentUser) => {
  const { rows } = await db
    .getPool()
    .query(
      "SELECT * FROM documents_users WHERE document_id = $1 AND user_id = $2",
      [documentUser.documentId, documentUser.userId]
    );
  return rows.length ? update(documentUser) : add(documentUser);
};

const getDocumentsByStatus = async (userId, status) => {
  const { rows } = await db.getPool().query(
    `
    SELECT d.* FROM documents d
    JOIN documents_users du ON d.id = du.document_id
    WHERE du.user_id = $1 AND du.read_status = $2
    ORDER BY d.title
    `,
    [userId, status]
  );
  return db.camelize(rows);
};

module.exports = {
  statuses,
  add,
  get,
  allForUser,
  update,
  upsert,
  getDocumentsByStatus,
};
