const db = require("../database");

exports.all = async () => {
  const { rows } = await db.getPool().query("select * from tags order by id");
  return db.camelize(rows);
};

exports.add = async (tag) => {
  return await db
    .getPool()
    .query("INSERT INTO tags(name) VALUES($1) RETURNING *", [tag.name]);
};

exports.get = async (id) => {
  const { rows } = await db
    .getPool()
    .query("select * from tags where id = $1", [id]);
  return db.camelize(rows)[0];
};

exports.update = async (tag) => {
  return await db
    .getPool()
    .query("UPDATE tags SET name = $1 where id = $2 RETURNING *", [
      tag.name,
      tag.id,
    ]);
};

exports.upsert = async (tag) => {
  if (tag.id) {
    exports.update(tag);
  } else {
    exports.add(tag);
  }
};
