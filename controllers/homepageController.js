const db = require('../config/db');

// Get all FAQs
const getFAQs = async (req, res) => {
    try {
        const { locale = 'en' } = req.query;
        const [faqs] = await db.query(
            'SELECT * FROM faqs WHERE locale = ? AND is_active = TRUE ORDER BY display_order ASC',
            [locale]
        );
        res.status(200).json({ success: true, faqs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching FAQs', error: error.message });
    }
};

// Create FAQ
const createFAQ = async (req, res) => {
    try {
        const { locale, question, answer, display_order } = req.body;
        const [result] = await db.query(
            'INSERT INTO faqs (locale, question, answer, display_order) VALUES (?, ?, ?, ?)',
            [locale, question, answer, display_order || 0]
        );
        res.status(201).json({ success: true, message: 'FAQ created', id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating FAQ', error: error.message });
    }
};

// Update FAQ
const updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, display_order, is_active } = req.body;
        const [result] = await db.query(
            'UPDATE faqs SET question = ?, answer = ?, display_order = ?, is_active = ? WHERE id = ?',
            [question, answer, display_order, is_active, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.status(200).json({ success: true, message: 'FAQ updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating FAQ', error: error.message });
    }
};

// Delete FAQ
const deleteFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM faqs WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.status(200).json({ success: true, message: 'FAQ deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting FAQ', error: error.message });
    }
};

// Get all Testimonials
const getTestimonials = async (req, res) => {
    try {
        const { locale = 'en' } = req.query;
        const [testimonials] = await db.query(
            'SELECT * FROM testimonials WHERE locale = ? AND is_active = TRUE ORDER BY display_order ASC',
            [locale]
        );
        res.status(200).json({ success: true, testimonials });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching testimonials', error: error.message });
    }
};

// Create Testimonial
const createTestimonial = async (req, res) => {
    try {
        const { locale, name, role, feedback, rating, image_url, display_order } = req.body;
        const [result] = await db.query(
            'INSERT INTO testimonials (locale, name, role, feedback, rating, image_url, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [locale, name, role, feedback, rating || 5, image_url, display_order || 0]
        );
        res.status(201).json({ success: true, message: 'Testimonial created', id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating testimonial', error: error.message });
    }
};

// Update Testimonial
const updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, feedback, rating, image_url, display_order, is_active } = req.body;
        const [result] = await db.query(
            'UPDATE testimonials SET name = ?, role = ?, feedback = ?, rating = ?, image_url = ?, display_order = ?, is_active = ? WHERE id = ?',
            [name, role, feedback, rating, image_url, display_order, is_active, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Testimonial not found' });
        res.status(200).json({ success: true, message: 'Testimonial updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating testimonial', error: error.message });
    }
};

// Delete Testimonial
const deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM testimonials WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Testimonial not found' });
        res.status(200).json({ success: true, message: 'Testimonial deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting testimonial', error: error.message });
    }
};

module.exports = {
    getFAQs,
    createFAQ,
    updateFAQ,
    deleteFAQ,
    getTestimonials,
    createTestimonial,
    updateTestimonial,
    deleteTestimonial
};
