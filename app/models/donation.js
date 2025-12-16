const db = require("../services/db");

class Donation {

    id;
    donor_id;

    constructor(donor_id) {
        this.donor_id = donor_id;
    }

    // Get all donations for logged-in donor
    async getByDonor({ status, q }) {
        const filters = ['donor_id = ?'];
        const params = [this.donor_id];

        if (status && status !== 'all') {
            filters.push('status = ?');
            params.push(status);
        }

        if (q) {
            filters.push('food_item LIKE ?');
            params.push(`%${q}%`);
        }

        const sql = `
            SELECT id, donor_name, food_item, quantity, pickup_time, status, created_at
            FROM donations
            WHERE ${filters.join(' AND ')}
            ORDER BY pickup_time ASC
        `;

        return db.query(sql, params);
    }

    // Get one donation (donor only)
    async getById(id) {
        const sql = `
            SELECT id, donor_name, food_item, quantity, pickup_time, status, created_at
            FROM donations
            WHERE id = ? AND donor_id = ?
        `;
        const rows = await db.query(sql, [id, this.donor_id]);
        return rows[0] || null;
    }

    // Create donation
    async create({ donor_name, food_item, quantity, pickup_time }) {
        const sql = `
            INSERT INTO donations (donor_id, donor_name, food_item, quantity, pickup_time)
            VALUES (?, ?, ?, ?, ?)
        `;
        return db.query(sql, [
            this.donor_id,
            donor_name,
            food_item,
            quantity,
            pickup_time
        ]);
    }

    // Update donation
    async update(id, { food_item, quantity, pickup_time }) {
        const sql = `
            UPDATE donations
            SET food_item = ?, quantity = ?, pickup_time = ?
            WHERE id = ? AND donor_id = ?
        `;
        return db.query(sql, [
            food_item,
            quantity,
            pickup_time,
            id,
            this.donor_id
        ]);
    }

    // Delete donation
    async delete(id) {
        const sql = `
            DELETE FROM donations
            WHERE id = ? AND donor_id = ?
        `;
        return db.query(sql, [id, this.donor_id]);
    }

    // Receiver: get all available donations
    static async getAvailable() {
        const sql = `
            SELECT id, donor_name, food_item, quantity, pickup_time, created_at
            FROM donations
            WHERE status = 'Available'
            ORDER BY pickup_time ASC
        `;
        return db.query(sql);
    }
}

module.exports = { Donation };
