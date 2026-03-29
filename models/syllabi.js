const db = require("../database");

class SyllabiModel {
  // Get all syllabi
  static async all() {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       ORDER BY s.year DESC, 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC`
    );
    return db.camelize(rows);
  }

  // Get single syllabus
  static async get(id) {
    try {
      const { rows } = await db.getPool().query(
        `SELECT s.*, 
                c.code as course_code, 
                c.title as course_title,
                c.department as course_department, 
                c.credits as course_credits
         FROM syllabi s 
         LEFT JOIN courses c ON s.course_id = c.id 
         WHERE s.id = $1`,
        [id]
      );

      if (rows.length === 0) return null;

      const syllabus = db.camelize(rows)[0];
      
      // If we have course data, structure it properly
      if (syllabus.courseCode) {
        syllabus.course = {
          id: syllabus.courseId,
          code: syllabus.courseCode,
          title: syllabus.courseTitle,
          department: syllabus.courseDepartment,
          credits: syllabus.courseCredits
        };
        
        // Remove the flat course fields
        delete syllabus.courseCode;
        delete syllabus.courseTitle;
        delete syllabus.courseDepartment;
        delete syllabus.courseCredits;
      }

      // Convert learning objectives to array if it's a string
      if (syllabus.learningObjectives) {
        try {
          syllabus.learningObjectives = typeof syllabus.learningObjectives === 'string' 
            ? JSON.parse(syllabus.learningObjectives)
            : syllabus.learningObjectives;
        } catch (e) {
          console.error('Error parsing learning objectives:', e);
          syllabus.learningObjectives = [syllabus.learningObjectives];
        }
      }

      // Format weekly schedule if it exists
      if (syllabus.weeklySchedule) {
        syllabus.weeklySchedule = syllabus.weeklySchedule
          .split('\n')
          .map(week => week.trim())
          .filter(week => week.length > 0);
      }

      // Ensure URL link is properly formatted
      if (syllabus.urlLink) {
        syllabus.urlLink = syllabus.urlLink.trim();
      }

      // Handle empty strings for optional fields
      ['courseDescription', 'requiredMaterials', 'gradingPolicy', 'officeHours'].forEach(field => {
        if (syllabus[field] === '') {
          syllabus[field] = null;
        }
      });

      return syllabus;
    } catch (error) {
      console.error('Error getting syllabus:', error);
      throw error;
    }
  }

  // Create new syllabus
  static async add(syllabus) {
    const { rows } = await db.getPool().query(
      `INSERT INTO syllabi (
        semester,
        year,
        instructor,
        course_id,
        url_link
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        syllabus.semester,
        syllabus.year,
        syllabus.instructor,
        syllabus.courseId,
        syllabus.urlLink
      ]
    );
    return db.camelize(rows)[0];
  }

  // Update syllabus
  static async update(syllabus) {
    const pool = db.getPool();
    
    try {
      // Validate required fields
      if (!syllabus.id) throw new Error("Syllabus ID is required for update");
      if (!syllabus.semester) throw new Error("Semester is required");
      if (!syllabus.year) throw new Error("Year is required");
      if (!syllabus.instructor) throw new Error("Instructor is required");
      
      // Verify database connection first
      await pool.query('SELECT 1');
      
      const queryParams = [
        syllabus.semester,
        syllabus.year,
        syllabus.instructor,
        syllabus.courseId,
        syllabus.urlLink,
        syllabus.id
      ];
      
      const { rows } = await pool.query(
        `UPDATE syllabi SET 
          semester = $1,
          year = $2,
          instructor = $3,
          course_id = $4,
          url_link = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *`,
        [
          syllabus.semester,
          syllabus.year,
          syllabus.instructor,
          syllabus.courseId,
          syllabus.urlLink,
          syllabus.id
        ]
      );
      
      // Verify update success
      if (!rows || rows.length === 0) {
        throw new Error(`No syllabus found with ID ${syllabus.id} or update operation failed`);
      }
      
      const result = db.camelize(rows)[0];
      return result;
    } catch (error) {
      console.error("Error updating syllabus:", error.message);
      throw error;
    }
  }

  // Delete syllabus
  static async delete(id) {
    const { rowCount } = await db.getPool().query(
      "DELETE FROM syllabi WHERE id = $1",
      [id]
    );
    return rowCount > 0;
  }

  // Get syllabi by course
  static async getByCourse(courseId) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       WHERE s.course_id = $1 
       ORDER BY s.year DESC, 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC`,
      [courseId]
    );
    return db.camelize(rows);
  }

  // Get syllabi by semester
  static async getBySemester(semester) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       WHERE s.semester ILIKE $1 
       ORDER BY s.year DESC, 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC,
                c.code`,
      [`%${semester}%`]
    );
    return db.camelize(rows);
  }

  // Get syllabi by instructor
  static async getByInstructor(instructor) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       WHERE s.instructor ILIKE $1 
       ORDER BY s.year DESC, 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC,
                c.code`,
      [`%${instructor}%`]
    );
    return db.camelize(rows);
  }

  // Get unlinked syllabi
  static async getUnlinked() {
    const { rows } = await db.getPool().query(
      `SELECT * FROM syllabi 
       WHERE course_id IS NULL 
       ORDER BY year DESC, 
                CASE semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC`
    );
    return db.camelize(rows);
  }

  // Link document to syllabus
  static async linkDocument(syllabusId, documentId) {
    try {
      // First, get the document type from the documents table
      const documentQuery = await db.getPool().query(
        'SELECT document_type FROM documents WHERE id = $1',
        [documentId]
      );
      
      if (!documentQuery.rows.length) {
        throw new Error('Document not found');
      }
      
      let documentType = documentQuery.rows[0].document_type;
      
      // Validate that document_type exists
      if (!documentType) {
        throw new Error('Document type is missing');
      }
      
      // Validate document type is one of the allowed types
      const validTypes = ['PDF', 'EPUB', 'MOBI', 'DOCX', 'TXT'];
      // Convert to uppercase for consistent validation
      let upperDocType = documentType.toUpperCase();
      if (!validTypes.includes(upperDocType)) {
        // Use PDF as default if the document type is invalid
        upperDocType = 'PDF';
        console.warn(`Invalid document type "${documentType}" converted to PDF. Valid types are: ${validTypes.join(', ')}`);
      }
      
      // Now insert with the validated uppercase document_type
      const { rows } = await db.getPool().query(
        `INSERT INTO syllabi_documents (syllabus_id, document_id, document_type) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (syllabus_id, document_id) DO NOTHING 
         RETURNING *`,
        [syllabusId, documentId, upperDocType]
      );
      
      // If no rows were inserted (due to conflict), the document is already linked
      if (rows.length === 0) {
        // Return existing link instead of throwing an error
        return { syllabusId, documentId, alreadyLinked: true };
      }
      
      return db.camelize(rows)[0];
    } catch (error) {
      console.error("Error linking document to syllabus:", error);
      throw error;
    }
  }

  // Unlink document from syllabus
  static async unlinkDocument(syllabusId, documentId) {
    try {
      const { rowCount } = await db.getPool().query(
        "DELETE FROM syllabi_documents WHERE syllabus_id = $1 AND document_id = $2",
        [syllabusId, documentId]
      );
      return rowCount > 0;
    } catch (error) {
      console.error("Error unlinking document from syllabus:", error);
      throw error;
    }
  }

  // Get documents for a syllabus
  static async getDocuments(syllabusId) {
    try {
      const { rows } = await db.getPool().query(
        `SELECT d.* 
         FROM documents d 
         INNER JOIN syllabi_documents sd ON d.id = sd.document_id 
         WHERE sd.syllabus_id = $1 
         ORDER BY d.created_at DESC`,
        [syllabusId]
      );
      return db.camelize(rows);
    } catch (error) {
      console.error("Error getting syllabus documents:", error);
      return [];
    }
  }

  // Get course statistics (number of syllabi per course)
  static async getCourseStats() {
    const { rows } = await db.getPool().query(
      `SELECT c.id, c.code, c.title, c.department, c.credits,
              COUNT(s.id) as syllabi_count,
              MIN(s.year) as first_year,
              MAX(s.year) as last_year,
              array_agg(DISTINCT s.instructor) as instructors
       FROM courses c
       LEFT JOIN syllabi s ON c.id = s.course_id
       GROUP BY c.id, c.code, c.title, c.department, c.credits
       ORDER BY c.code`
    );
    return db.camelize(rows);
  }

  // Get available years
  static async getYears() {
    const { rows } = await db.getPool().query(
      `SELECT DISTINCT year 
       FROM syllabi 
       ORDER BY year DESC`
    );
    return rows.map(row => row.year);
  }

  // Get syllabi by year
  static async getByYear(year) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       WHERE s.year = $1
       ORDER BY 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC,
                c.code`,
      [year]
    );
    return db.camelize(rows);
  }

  // Get syllabi by semester and year
  static async getBySemesterAndYear(semester, year) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       WHERE s.semester = $1 AND s.year = $2
       ORDER BY c.code`,
      [semester, year]
    );
    return db.camelize(rows);
  }

  // Get syllabi by document ID
  static async getByDocumentId(documentId) {
    const { rows } = await db.getPool().query(
      `SELECT s.*, c.code as course_code_ref, c.title as course_title_ref,
              c.department as course_department_ref, c.credits as course_credits_ref
       FROM syllabi s 
       LEFT JOIN courses c ON s.course_id = c.id 
       INNER JOIN syllabi_documents sd ON s.id = sd.syllabus_id 
       WHERE sd.document_id = $1 
       ORDER BY s.year DESC, 
                CASE s.semester 
                  WHEN 'Spring' THEN 1 
                  WHEN 'Summer' THEN 2 
                  WHEN 'Fall' THEN 3 
                  WHEN 'Winter' THEN 4 
                  ELSE 5 
                END DESC`,
      [documentId]
    );
    return db.camelize(rows);
  }
}

module.exports = SyllabiModel;
