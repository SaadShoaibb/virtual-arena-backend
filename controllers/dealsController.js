const db = require('../config/db'); // Import your database connection

// // Create Deals table if it doesn't exist
// const createDealsTable = async () => {
//     try {
//         // Create Deals Table
//         await db.query(`
//             CREATE TABLE IF NOT EXISTS Deals (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 title VARCHAR(255) NOT NULL,
//                 description TEXT NOT NULL,
//                 original_price DECIMAL(10,2) NOT NULL,
//                 discounted_price DECIMAL(10,2) NOT NULL,
//                 discount_percentage INT NOT NULL,
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         // Create DealImages Table
//         await db.query(`
//             CREATE TABLE IF NOT EXISTS DealImages (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 deal_id INT NOT NULL,
//                 image_url VARCHAR(255) NOT NULL,
//                 FOREIGN KEY (deal_id) REFERENCES Deals(id) ON DELETE CASCADE
//             );
//         `);

//         //create add to cart table
//         // Create Cart Table (Fix User Reference)
//         await db.query(`
//     CREATE TABLE IF NOT EXISTS Cart (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         userId INT NOT NULL,
//         dealId INT NOT NULL,
//         quantity INT NOT NULL DEFAULT 1,
//         createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
//         FOREIGN KEY (dealId) REFERENCES Deals(id) ON DELETE CASCADE
//     );
// `);
//         console.log('Deals and DealImages tables created or exist.');
//     } catch (error) {
//         console.error('Error creating tables:', error);
//     }
// };


// Function to add a new deal
const addDeal = async (req, res) => {
    try {
        // Create Deals Table

        const { title, description, original_price, discounted_price, discount_percentage } = req.body;
        const imageFiles = req.files; // Get uploaded images

        if (!title || !description || !original_price || !discounted_price || !discount_percentage || !imageFiles) {
            return res.status(400).json({ success: false, message: 'All fields & images are required' });
        }

        // Insert the deal into the Deals table
        const insertDealQuery = `
                            INSERT INTO Deals (title, description, original_price, discounted_price, discount_percentage)
                            VALUES (?, ?, ?, ?, ?);
                        `;
        const [result] = await db.query(insertDealQuery, [title, description, original_price, discounted_price, discount_percentage]);
        const dealId = result.insertId; // Get the newly inserted deal's ID

        // Insert images into DealImages table
        for (let file of imageFiles) {
            const insertImageQuery = `
                                INSERT INTO DealImages (deal_id, image_url) VALUES (?, ?);
                            `;
            await db.query(insertImageQuery, [dealId, `/uploads/${file.filename}`]);
        }

        res.status(201).json({ success: true, message: 'Deal added successfully' });
    } catch (error) {
        console.error('Error adding deal:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// Function to get all deals
const getDeals = async (req, res) => {
    try {
        // Fetch all deals
        const [deals] = await db.query('SELECT * FROM Deals ORDER BY created_at DESC');

        // Fetch images for each deal
        for (let deal of deals) {
            const [images] = await db.query('SELECT image_url FROM DealImages WHERE deal_id = ?', [deal.id]);
            deal.images = images.map(img => img.image_url); // Attach images to deal
        }

        res.status(200).json({ success: true, deals });
    } catch (error) {
        console.error('Error fetching deals:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

/** 🛒 Add to Cart */
const addToCart = async (req, res) => {
    try {
        const { dealId, quantity } = req.body;
        const userId = req.user.id;
        // Check if the deal exists
        const dealExists = await db.query(`SELECT * FROM Deals WHERE id = ?`, [dealId]);
        if (dealExists.length === 0) {
            return res.status(404).json({ message: 'Deal not found' });
        }

        // Insert into Cart
        await db.query(
            `INSERT INTO Cart (userId, dealId, quantity) VALUES (?, ?, ?)`,
            [userId, dealId, quantity]
        );

        res.status(201).json({ message: 'Added to cart' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** 🛒 Get All Carts */
const getCarts = async (req, res) => {
    try {
        const userId = req.user.id; // Get authenticated user's ID

        const [carts] = await db.query(
            `SELECT Cart.id, Cart.userId, Cart.dealId, Cart.quantity, 
                    Deals.title AS dealTitle, Deals.discounted_price AS dealPrice 
             FROM Cart 
             JOIN Deals ON Cart.dealId = Deals.id
             WHERE Cart.userId = ?`,
            [userId]
        );

        res.status(200).json(carts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** ✏️ Update Deal by ID */
const updateDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, original_price, description } = req.body;

        const result = await db.query(
            `UPDATE Deals SET title = ?, original_price = ?, description = ? WHERE id = ?`,
            [title, original_price, description, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Deal not found' });
        }

        res.status(200).json({ message: 'Deal updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** 🔍 Get One Deal by ID */
const getOneDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const deal = await db.query(`SELECT * FROM Deals WHERE id = ?`, [id]);

        if (deal.length === 0) {
            return res.status(404).json({ message: 'Deal not found' });
        }

        res.status(200).json(deal[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** 🗑 Delete Deal */
const deleteDeal = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`DELETE FROM Deals WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Deal not found' });
        }

        res.status(200).json({ message: 'Deal deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/** 🗑 Delete Multiple Cart Items */
const deleteMultipleCarts = async (req, res) => {
    try {
        const { cartIds } = req.body; // Expecting an array of cart IDs

        if (!cartIds || cartIds.length === 0) {
            return res.status(400).json({ message: "No cart IDs provided" });
        }

        // Convert array into a format usable in SQL query
        const placeholders = cartIds.map(() => '?').join(',');
        const query = `DELETE FROM Cart WHERE id IN (${placeholders})`;

        const result = await db.query(query, cartIds);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "No cart items found for the provided IDs" });
        }

        res.status(200).json({ message: "Selected cart items deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// Initialize the table when the server starts
// createDealsTable();

module.exports = { addDeal, getDeals, addToCart, getCarts, updateDeal, getOneDeal, deleteDeal, deleteMultipleCarts };
