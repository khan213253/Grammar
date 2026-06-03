const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT DEFAULT '',
        content TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS examples (
        id SERIAL PRIMARY KEY,
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        phrase TEXT DEFAULT '',
        explanation TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        prompt TEXT DEFAULT '',
        answer TEXT DEFAULT ''
      );
    `);
    console.log("Database tables ready");
  } finally {
    client.release();
  }
}

async function getAllLessons() {
  const { rows } = await pool.query(
    `SELECT id, title, category, content, created_at, updated_at
     FROM lessons ORDER BY created_at DESC`
  );
  return rows.map(rowToLesson);
}

async function getLessonById(id) {
  const { rows } = await pool.query(
    `SELECT id, title, category, content, created_at, updated_at
     FROM lessons WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const lesson = rowToLesson(rows[0]);
  lesson.examples = await getExamples(id);
  lesson.questions = await getQuestions(id);
  return lesson;
}

async function createLesson(lesson) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO lessons (id, title, category, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [lesson.id, lesson.title, lesson.category, lesson.content, lesson.createdAt, lesson.updatedAt]
    );
    for (const ex of lesson.examples) {
      await client.query(
        `INSERT INTO examples (lesson_id, phrase, explanation) VALUES ($1, $2, $3)`,
        [lesson.id, ex.phrase, ex.explanation]
      );
    }
    for (const q of lesson.questions) {
      await client.query(
        `INSERT INTO questions (lesson_id, prompt, answer) VALUES ($1, $2, $3)`,
        [lesson.id, q.prompt, q.answer]
      );
    }
    await client.query("COMMIT");
    return lesson;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateLesson(id, lesson) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE lessons SET title = $1, category = $2, content = $3, updated_at = $4 WHERE id = $5`,
      [lesson.title, lesson.category, lesson.content, lesson.updatedAt, id]
    );
    await client.query("DELETE FROM examples WHERE lesson_id = $1", [id]);
    await client.query("DELETE FROM questions WHERE lesson_id = $1", [id]);
    for (const ex of lesson.examples) {
      await client.query(
        `INSERT INTO examples (lesson_id, phrase, explanation) VALUES ($1, $2, $3)`,
        [id, ex.phrase, ex.explanation]
      );
    }
    for (const q of lesson.questions) {
      await client.query(
        `INSERT INTO questions (lesson_id, prompt, answer) VALUES ($1, $2, $3)`,
        [id, q.prompt, q.answer]
      );
    }
    await client.query("COMMIT");
    return lesson;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deleteLesson(id) {
  const { rowCount } = await pool.query("DELETE FROM lessons WHERE id = $1", [id]);
  return rowCount > 0;
}

async function getExamples(lessonId) {
  const { rows } = await pool.query(
    `SELECT phrase, explanation FROM examples WHERE lesson_id = $1 ORDER BY id`,
    [lessonId]
  );
  return rows;
}

async function getQuestions(lessonId) {
  const { rows } = await pool.query(
    `SELECT prompt, answer FROM questions WHERE lesson_id = $1 ORDER BY id`,
    [lessonId]
  );
  return rows;
}

function rowToLesson(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content,
    examples: [],
    questions: [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

module.exports = { initDb, getAllLessons, getLessonById, createLesson, updateLesson, deleteLesson };
