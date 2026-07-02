require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDb() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  await connection.end();

  const db = await pool.getConnection();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      role ENUM('admin','employee') NOT NULL,
      employee_id VARCHAR(64) UNIQUE,
      name VARCHAR(255) NOT NULL,
      designation VARCHAR(255),
      department VARCHAR(255),
      password VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS colleges (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id VARCHAR(64) PRIMARY KEY,
      college_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      semester_batch VARCHAR(255),
      training_domain TEXT,
      training_dates VARCHAR(255),
      total_hours VARCHAR(64),
      trainer_trainee VARCHAR(255),
      is_archived BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS program_form_entries (
      id VARCHAR(128) PRIMARY KEY,
      program_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64),
      data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY ux_program_user (program_id, user_id),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id VARCHAR(32) PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      role VARCHAR(64) NOT NULL,
      event_type ENUM('login', 'logout') NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Remove all old @atomadmin accounts from database
  await db.query(`DELETE FROM users WHERE id LIKE '%@atomadmin' OR id LIKE '%@Atomadmin'`);

  await db.query(
    `INSERT INTO users (id, role, employee_id, name, designation, department, password) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), name = VALUES(name), designation = VALUES(designation), department = VALUES(department)`,
    ['tech', 'admin', 'TECH', 'TeCh Admin', 'Super Admin', 'Administration', 'TUF@gaming#A15']
  );

  db.release();
}

async function persistNormalizedState(state) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Clean up any @atomadmin accounts from database
    await connection.query(`DELETE FROM users WHERE id LIKE '%@atomadmin' OR id LIKE '%@Atomadmin'`);

    if (Array.isArray(state.employees)) {
      for (const employee of state.employees) {
        if (!employee || !employee.id) continue;
        // Skip old @atomadmin accounts
        if (employee.id.toLowerCase().includes('@atomadmin')) continue;
        const role = (employee.id.toLowerCase().endsWith('@atom.com') || employee.id.toLowerCase() === 'admin' || employee.id.toLowerCase() === 'tech') ? 'admin' : 'employee';
        await connection.query(
          `INSERT INTO users (id, role, employee_id, name, designation, department, password) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), name = VALUES(name), designation = VALUES(designation), department = VALUES(department), employee_id = VALUES(employee_id), password = VALUES(password)`,
          [employee.id, role, employee.id, employee.name || '', employee.designation || '', employee.department || '', employee.password || 'emp123']
        );
      }
    }

    if (state.colleges && typeof state.colleges === 'object') {
      for (const collegeId of Object.keys(state.colleges)) {
        const college = state.colleges[collegeId];
        if (!college) continue;
        await connection.query(
          `INSERT INTO colleges (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [collegeId, college.name || '']
        );

        const programs = college.programs || {};
        for (const programId of Object.keys(programs)) {
          const program = programs[programId];
          if (!program) continue;
          await connection.query(
            `INSERT INTO programs (id, college_id, name, semester_batch, training_domain, training_dates, total_hours, trainer_trainee, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE college_id = VALUES(college_id), name = VALUES(name), semester_batch = VALUES(semester_batch), training_domain = VALUES(training_domain), training_dates = VALUES(training_dates), total_hours = VALUES(total_hours), trainer_trainee = VALUES(trainer_trainee), is_archived = VALUES(is_archived)`,
            [
              programId,
              collegeId,
              program.name || '',
              program.semester || '',
              Array.isArray(program.trainingDomain) ? JSON.stringify(program.trainingDomain) : (program.trainingDomain || ''),
              program.trainingDates || '',
              program.totalHours || '',
              program.trainerTrainee || '',
              program.isArchived ? 1 : 0
            ]
          );

          const entries = [];
          if (program.formData && typeof program.formData === 'object') {
            entries.push({ userId: null, data: program.formData });
          }
          if (program.formDataByEmployee && typeof program.formDataByEmployee === 'object') {
            for (const employeeId of Object.keys(program.formDataByEmployee)) {
              entries.push({ userId: employeeId, data: program.formDataByEmployee[employeeId] });
            }
          }

          for (const entry of entries) {
            const entryId = `${programId}_${entry.userId || 'default'}`;
            await connection.query(
              `INSERT INTO program_form_entries (id, program_id, user_id, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`,
              [entryId, programId, entry.userId, JSON.stringify(entry.data || {})]
            );
          }
        }
      }
    }

    await connection.query(
      'INSERT INTO app_state (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP',
      ['app_state', JSON.stringify(state)]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

app.get('/api/state', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT data FROM app_state WHERE id = ?', ['app_state']);
    if (!rows.length) {
      return res.json({ data: null });
    }
    res.json({ data: rows[0].data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to load state' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users');
    const [colleges] = await pool.query('SELECT * FROM colleges');
    const [programs] = await pool.query('SELECT * FROM programs');
    const [entries] = await pool.query('SELECT * FROM program_form_entries');

    const collegesById = {};
    colleges.forEach(college => {
      collegesById[college.id] = { ...college, programs: {} };
    });

    const programsById = {};
    programs.forEach(program => {
      programsById[program.id] = {
        ...program,
        trainingDomain: program.training_domain || '',
        programs: undefined
      };
      if (collegesById[program.college_id]) {
        collegesById[program.college_id].programs[program.id] = programsById[program.id];
      }
    });

    entries.forEach(entry => {
      const program = programsById[entry.program_id];
      if (!program) return;
      const formData = entry.data ? JSON.parse(entry.data) : {};
      if (entry.user_id) {
        if (!program.formDataByEmployee) program.formDataByEmployee = {};
        program.formDataByEmployee[entry.user_id] = formData;
      } else {
        program.formData = formData;
      }
    });

    res.json({
      users,
      colleges: collegesById,
      programs: programsById,
      entries
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to load normalized data' });
  }
});

app.post('/api/save-state', async (req, res) => {
  try {
    const state = req.body.state;
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ error: 'Invalid state payload' });
    }

    await persistNormalizedState(state);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to save state' });
  }
});

app.post('/api/log-activity', async (req, res) => {
  try {
    const { userId, userName, role, eventType } = req.body;
    if (!userId || !userName || !role || !eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const [result] = await pool.query(
      'INSERT INTO user_activity_logs (user_id, user_name, role, event_type) VALUES (?, ?, ?, ?)',
      [userId, userName, role, eventType]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/log-activity:', err);
    res.status(500).json({ error: 'Unable to log activity' });
  }
});

app.get('/api/activity-logs', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT user_id as userId, user_name as userName, role, event_type as eventType, DATE_FORMAT(timestamp, "%Y-%m-%d %H:%i:%s") as timestamp FROM user_activity_logs ORDER BY timestamp DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/activity-logs:', err);
    res.status(500).json({ error: 'Unable to retrieve logs' });
  }
});

app.post('/api/delete-employee', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/delete-employee:', err);
    res.status(500).json({ error: 'Unable to delete employee' });
  }
});

app.post('/api/delete-college', async (req, res) => {
  try {
    const { collegeId } = req.body;
    if (!collegeId) {
      return res.status(400).json({ error: 'Missing collegeId' });
    }
    await pool.query('DELETE FROM colleges WHERE id = ?', [collegeId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/delete-college:', err);
    res.status(500).json({ error: 'Unable to delete college' });
  }
});

app.post('/api/delete-program', async (req, res) => {
  try {
    const { programId } = req.body;
    if (!programId) {
      return res.status(400).json({ error: 'Missing programId' });
    }
    await pool.query('DELETE FROM programs WHERE id = ?', [programId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/delete-program:', err);
    res.status(500).json({ error: 'Unable to delete program' });
  }
});

async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
      console.log(`Connected to MySQL database ${process.env.DB_NAME} as ${process.env.DB_USER}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
