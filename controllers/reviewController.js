const db = require("../config/db");
// Add a new review
const addReview = async (req, res) => {
    const { user_id, entity_type, entity_id, rating, comment } = req.body;

    if (!user_id || !entity_type || !entity_id || !rating) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const query = `
            INSERT INTO Reviews (user_id, entity_type, entity_id, rating, comment)
            VALUES (?, ?, ?, ?, ?);
        `;
        const [result] = await db.query(query, [user_id, entity_type, entity_id, rating, comment]);

        res.status(201).json({
            message: 'Review added successfully',
            review_id: result.insertId,
        });
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ message: 'Failed to add review' });
    }
};

// Get all reviews for a specific entity
const getReviewsByEntity = async (req, res) => {
    const { entity_type, entity_id } = req.params;

    if (!entity_type || !entity_id) {
        return res.status(400).json({ message: 'Missing entity type or entity ID' });
    }

    try {
        const query = `
            SELECT * FROM Reviews
            WHERE entity_type = ? AND entity_id = ?;
        `;
        const [reviews] = await db.query(query, [entity_type, entity_id]);

        res.status(200).json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ message: 'Failed to fetch reviews' });
    }
};

// Get a single review by review_id
const getReviewById = async (req, res) => {
    const { review_id } = req.params;

    if (!review_id) {
        return res.status(400).json({ message: 'Missing review ID' });
    }

    try {
        const query = `
            SELECT * FROM Reviews
            WHERE review_id = ?;
        `;
        const [review] = await db.query(query, [review_id]);

        if (review.length === 0) {
            return res.status(404).json({ message: 'Review not found' });
        }

        res.status(200).json(review[0]);
    } catch (error) {
        console.error('Error fetching review:', error);
        res.status(500).json({ message: 'Failed to fetch review' });
    }
};

module.exports = {
    addReview,
    getReviewsByEntity,
    getReviewById,
};