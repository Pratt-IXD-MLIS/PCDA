const db = require("../database");
const path = require("path");
const fs = require("fs");

exports.all = async () => {
  const { rows } = await db.getPool().query("select * from documents order by created_at desc");
  return db.camelize(rows);
};

exports.getRelatedDocuments = async (documentId, limit = 3) => {
  try {
    const document = await exports.get(documentId);
    if (!document) return [];

    const query = document.genreId
      ? `select * from documents
         where id != $1
         and genre_id = $2
         order by created_at desc
         limit $3`
      : `select * from documents
         where id != $1
         order by created_at desc
         limit $2`;

    const params = document.genreId
      ? [documentId, document.genreId, limit]
      : [documentId, limit];

    const { rows } = await db.getPool().query(query, params);
    return db.camelize(rows);
  } catch (error) {
    console.error(`Error getting related documents for document ${documentId}:`, error);
    return [];
  }
};

exports.get = async (id) => {
  const { rows } = await db.getPool().query("select * from documents where id = $1", [id]);
  return rows.length ? db.camelize(rows)[0] : null;
};

/**
 * Get documents by syllabus ID
 */
exports.getBySyllabusId = async (syllabusId) => {
  try {
    const query = `select d.* from documents d
      join syllabi_documents sd on d.id = sd.document_id
      where sd.syllabus_id = $1
      order by d.created_at desc`;
    const { rows } = await db.getPool().query(query, [syllabusId]);
    return db.camelize(rows);
  } catch (error) {
    console.error("Error getting documents by syllabus ID:", error);
    return [];
  }
};

/**
 * Get all documents with filtering, sorting and pagination options
 * @param {Object} options - Query options including page, limit, search, documentType, sortBy
 * @returns {Object} Object containing documents array and total count
 */
exports.allWithOptions = async (options) => {
  try {
    const page = options.page || 1;
    const limit = options.limit || 12;
    const offset = (page - 1) * limit;
    const search = options.search || "";
    const documentType = options.documentType || "";
    const sortBy = options.sortBy || "title";

    // Build WHERE clause for filtering
    let whereClause = "";
    const params = [];
    let paramCount = 1;

    if (search) {
      whereClause += ` WHERE (title ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (documentType) {
      if (whereClause === "") {
        whereClause += ` WHERE document_type = $${paramCount}`;
      } else {
        whereClause += ` AND document_type = $${paramCount}`;
      }
      params.push(documentType);
      paramCount++;
    }

    // Build ORDER BY clause for sorting
    let orderByClause = "";
    switch (sortBy) {
      case "title":
        orderByClause = " ORDER BY title ASC";
        break;
      case "createdAt":
        orderByClause = " ORDER BY created_at DESC";
        break;
      case "publishingYear":
        orderByClause = " ORDER BY publishing_year DESC NULLS LAST";
        break;
      case "documentType":
        orderByClause = " ORDER BY document_type ASC";
        break;
      default:
        orderByClause = " ORDER BY title ASC";
    }

    // Get total count for pagination
    const countQuery = `select count(*) from documents${whereClause}`;
    const countResult = await db.getPool().query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get documents with pagination
    const query = `select * from documents${whereClause}${orderByClause}
      limit $${paramCount} offset $${paramCount + 1}`;

    // Add limit and offset parameters
    params.push(limit, offset);

    const { rows } = await db.getPool().query(query, params);

    return {
      documents: db.camelize(rows),
      total: total,
    };
  } catch (error) {
    console.error("Error getting documents with options:", error);
    throw error;
  }
};

exports.add = async (document) => {
  const client = await db.getPool().connect();
  try {
    await client.query("BEGIN");
    const { title, description, syllabusId, filename, filepath, filesize } = document;
    const { rows } = await client.query(
      `insert into documents (title, description, filename, filepath, filesize)
       values ($1, $2, $3, $4, $5) returning *`,
      [title, description, filename, filepath, filesize]
    );
    const newDocument = db.camelize(rows)[0];
    if (syllabusId) {
      await client.query(
        `insert into syllabi_documents (document_id, syllabus_id)
         values ($1, $2)`,
        [newDocument.id, syllabusId]
      );
    }
    await client.query("COMMIT");
    return newDocument;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error adding document:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.update = async (document) => {
  const { id, title, description } = document;
  const { rows } = await db.getPool().query(
    `update documents
     set title = $1, description = $2, updated_at = current_timestamp
     where id = $3 returning *`,
    [title, description, id]
  );
  return rows.length ? db.camelize(rows)[0] : null;
};

exports.delete = async (id) => {
  const document = await exports.get(id);
  if (!document) return false;
  
  if (document.filepath) {
    const fullPath = path.join(process.cwd(), document.filepath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  
  const { rowCount } = await db.getPool().query(
    "delete from documents where id = $1",
    [id]
  );
  return rowCount > 0;
};

/**
 * Associate a document with a syllabus using junction table
 */
exports.linkToSyllabus = async (documentId, syllabusId) => {
  try {
    const { rows } = await db.getPool().query(
      `insert into syllabi_documents (document_id, syllabus_id)
       values ($1, $2)
       on conflict (document_id, syllabus_id) do nothing
       returning *`,
      [documentId, syllabusId]
    );
    return rows.length > 0;
  } catch (error) {
    console.error("Error linking document to syllabus:", error);
    return false;
  }
};

/**
 * Remove association between a document and a syllabus
 */
exports.unlinkFromSyllabus = async (documentId, syllabusId) => {
  try {
    const { rowCount } = await db.getPool().query(
      `delete from syllabi_documents
       where document_id = $1 and syllabus_id = $2`,
      [documentId, syllabusId]
    );
    return rowCount > 0;
  } catch (error) {
    console.error("Error unlinking document from syllabus:", error);
    return false;
  }
};

/**
 * Get documents by document type
 */
exports.getByDocumentType = async (documentType) => {
  const { rows } = await db.getPool().query(
    "select * from documents where document_type = $1 order by created_at desc",
    [documentType]
  );
  return db.camelize(rows);
};

/**
 * Create or update a document
 */
exports.upsert = async (document) => {
  if (document.id) {
    return exports.update(document);
  }
  return exports.add(document);
};
