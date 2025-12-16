// Get the functions in the db.js file to use
const db = require("../services/db");
const bcrypt = require("bcryptjs");

class User {
  // Id of the user
  id;

  // Email of the user
  email;

  constructor(email) {
    this.email = email;
  }

  // Get an existing user id from an email address, or return false if not found
  // Checks to see if the submitted email address exists in the Users table
  async getIdFromEmail() {
    var sql = "SELECT id FROM Users WHERE Users.email = ?";
    const result = await db.query(sql, [this.email]);
    // TODO LOTS OF ERROR CHECKS HERE..
    if (JSON.stringify(result) != "[]") {
      this.id = result[0].id;
      return this.id;
    } else {
      return false;
    }
  }

  // Add a password to an existing user
  async setUserPassword(password) {
    const pw = await bcrypt.hash(password, 10);
    var sql = "UPDATE Users SET password = ? WHERE Users.id = ?";
    const result = await db.query(sql, [pw, this.id]);
    return true;
  }

  async getUserWithRole() {
    const sql = "SELECT id, role FROM users WHERE email = ?";
    const result = await db.query(sql, [this.email]);

    if (result.length > 0) {
      this.id = result[0].id;
      this.role = result[0].role;
      return result[0];
    }
    return null;
  }

  // Add a new record to the users table
  async addUser(password, role = "donor") {
    const pw = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (email, password, role) VALUES (?, ?, ?)";
    const result = await db.query(sql, [this.email, pw, role]);
    this.id = result.insertId;
    return true;
  }

  // Test a submitted password against a stored password
  // Test a submitted password against a stored password
  async authenticate(submitted) {
    // Get the stored, hashed password for the user
    var sql = "SELECT password FROM Users WHERE id = ?";
    const result = await db.query(sql, [this.id]);
    const match = await bcrypt.compare(submitted, result[0].password);
    if (match == true) {
      return true;
    } else {
      return false;
    }
  }
  // Get user profile by ID
  async getProfileById(id) {
    const sql = `
        SELECT id, email, role, created_at
        FROM users
        WHERE id = ?
    `;
    const rows = await db.query(sql, [id]);
    return rows[0] || null;
  }

  // Update user email
  async updateEmail(id, email) {
    const sql = `
        UPDATE users
        SET email = ?
        WHERE id = ?
    `;
    return db.query(sql, [email, id]);
  }
}

module.exports = {
  User,
};
