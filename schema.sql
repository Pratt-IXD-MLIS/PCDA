-- Drop tables in reverse order of dependencies to avoid constraint violations
DROP TABLE IF EXISTS documents_users CASCADE;
DROP TABLE IF EXISTS syllabi_documents CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS syllabi CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS users CASCADE;

create table tags (
  id serial primary key,
  name text
);

insert into tags (name) values ('Psychological Thriller');
insert into tags (name) values ('Romance');
insert into tags (name) values ('Fantasy');
insert into tags (name) values ('Science Fiction');
insert into tags (name) values ('Dystopian Fiction');

create table documents (
  id serial primary key,
  title text,
  publishing_year int,
  genre_id int references tags(id),
  filepath text, -- Changed file_path to filepath to match the database
  document_type text,
  created_at timestamp default current_timestamp,
  url text,
  description text,
  updated_at timestamp default current_timestamp
);

-- Sample documents with various document types
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Verity', 2022, 1, '/documents/verity.pdf', 'PDF');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('The Fault in Our Stars', 2012, 2, '/documents/tfios.epub', 'EPUB');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Twilight', 2005, 3, '/documents/twilight.mobi', 'MOBI');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Dune', 1965, 4, '/documents/dune.pdf', 'PDF');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Harry Potter and the Philosophers Stone', 1997, 3, '/documents/harry_potter.epub', 'EPUB');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Programming in Go', 2020, 4, '/documents/go_programming.docx', 'DOCX');
insert into documents (title, publishing_year, genre_id, filepath, document_type) values ('Web Development Basics', 2021, 4, '/documents/web_dev.txt', 'TXT');


-- Create documents_users table for reading status
create table documents_users (
  id serial primary key,
  document_id int references documents(id),
  user_id text,
  read_status text
);


-- Create courses table
create table courses (
  id serial primary key,
  code text not null,
  title text not null,
  description text,
  department text,
  created_at timestamp default current_timestamp
);

-- Insert sample courses
insert into courses (code, title, department) values
  ('INFO 101', 'Introduction to Information Science', 'Information Science'),
  ('INFO 202', 'Web Development Fundamentals', 'Information Science'),
  ('INFO 303', 'Database Management Systems', 'Information Science'),
  ('INFO 405', 'Digital Libraries', 'Information Science'),
  ('INFO 287', 'Information Architecture', 'Information Science');

  -- Create syllabi table
  create table syllabi (
    id serial primary key,
    semester varchar not null,
    year int not null,
    instructor varchar not null,
    course_id int references courses(id),
    url_link text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  -- Create syllabi_documents junction table
  create table syllabi_documents (
    id serial primary key,
    syllabus_id int references syllabi(id) on delete cascade,
    document_id int references documents(id) on delete cascade,
    created_at timestamp default current_timestamp,
    unique (syllabus_id, document_id)
  );

  -- Sample syllabi data
  insert into syllabi (
    course_id,
    semester,
    year,
    instructor,
    url_link
  ) values 
  (1, 'Fall', 2025, 'Dr. Jane Smith', 'https://drive.google.com/file/d/abc123/view'),
  (2, 'Spring', 2025, 'Dr. John Doe', 'https://drive.google.com/file/d/def456/view'),
  (3, 'Fall', 2025, 'Prof. Maria Garcia', 'https://drive.google.com/file/d/ghi789/view'),
  (4, 'Spring', 2026, 'Dr. Robert Chen', 'https://drive.google.com/file/d/jkl012/view'),
  (5, 'Summer', 2025, 'Dr. Sarah Johnson', 'https://drive.google.com/file/d/mno345/view');

-- Create users table (exists in the database)
create table users (
  id serial primary key,
  name text,
  email text,
  password text,
  salt text
);

-- Add indexes for better performance
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_publishing_year ON documents(publishing_year);
CREATE INDEX idx_documents_genre_id ON documents(genre_id);
CREATE INDEX idx_documents_users_document_id ON documents_users(document_id);
CREATE INDEX idx_documents_users_user_id ON documents_users(user_id);
CREATE INDEX idx_documents_users_read_status ON documents_users(read_status);
CREATE INDEX idx_syllabi_course_id ON syllabi(course_id);
CREATE INDEX idx_syllabi_semester_year ON syllabi(semester, year);
CREATE INDEX idx_syllabi_instructor ON syllabi(instructor);
CREATE INDEX idx_courses_code ON courses(code);
CREATE INDEX idx_courses_department ON courses(department);
CREATE INDEX idx_documents_url ON documents(url);
