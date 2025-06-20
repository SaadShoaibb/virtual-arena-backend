const db = require('../config/db'); // Database connection
const fs = require('fs'); // For file system operations (e.g., deleting files)
const path = require('path'); // For handling file paths

// Add a Product
const addProduct = async (req, res) => {
    try {
        const { name, description, original_price, discount_price, stock, color, size, shipping_info, is_active, discount, category } = req.body;
        const imageFiles = req.files; // Get uploaded images

        // Validate required fields
        if (!name || !description || !original_price || !discount_price || !stock || !color || !size || !shipping_info || !discount || !imageFiles || !category) {
            return res.status(400).json({ success: false, message: 'All fields, images, and category are required' });
        }

        // Insert the product into the Products table
        const insertProductQuery = `
            INSERT INTO Products (name, description, original_price, discount_price, stock, color, size, shipping_info, is_active, discount, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const [result] = await db.query(insertProductQuery, [
            name,
            description,
            original_price,
            discount_price,
            stock,
            color, // Store colors as JSON array
            size,   // Store sizes as JSON array
            shipping_info,
            is_active,
            discount,
            category
        ]);
        const productId = result.insertId; // Get the newly inserted product's ID

        // Insert images into ProductImages table
        for (let file of imageFiles) {
            const insertImageQuery = `
                INSERT INTO ProductImages (product_id, image_url)
                VALUES (?, ?);
            `;
            await db.query(insertImageQuery, [productId, `/uploads/${file.filename}`]);
        }

        res.status(201).json({ success: true, message: 'Product added successfully', productId });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// Get All Products
const getAllProducts = async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT p.*, GROUP_CONCAT(pi.image_url) AS images 
            FROM Products p 
            LEFT JOIN ProductImages pi ON p.product_id = pi.product_id 
            GROUP BY p.product_id`
        );
        products.forEach(product => {
            product.images = product.images ? product.images.split(',') : [];
        });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get One Product
const getProductById = async (req, res) => {
    const { id } = req.params;
    try {
        const [product] = await db.query(`
            SELECT p.*, GROUP_CONCAT(pi.image_url) AS images 
            FROM Products p 
            LEFT JOIN ProductImages pi ON p.product_id = pi.product_id 
            WHERE p.product_id = ? 
            GROUP BY p.product_id`, [id]
        );
        if (product.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }
        product[0].images = product[0].images ? product[0].images.split(',') : [];

        res.status(200).json(product[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update a Product
const updateProduct = async (req, res) => {
    const { id } = req.params;
    const { name, description, original_price, discount_price, stock, color, size, shipping_info, category } = req.body;
    const imageFiles = req.files; // Get uploaded images

    try {
        // Build the update query dynamically
        let updateFields = [];
        let updateValues = [];

        if (name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(name);
        }
        if (description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(description);
        }
        if (original_price !== undefined) {
            updateFields.push('original_price = ?');
            updateValues.push(original_price);
        }
        if (discount_price !== undefined) {
            updateFields.push('discount_price = ?');
            updateValues.push(discount_price);
        }
        if (stock !== undefined) {
            updateFields.push('stock = ?');
            updateValues.push(stock);
        }
        if (color !== undefined) {
            updateFields.push('color = ?');
            updateValues.push(color);
        }
        if (size !== undefined) {
            updateFields.push('size = ?');
            updateValues.push(size);
        }
        if (shipping_info !== undefined) {
            updateFields.push('shipping_info = ?');
            updateValues.push(shipping_info);
        }
        if (category !== undefined) {
            updateFields.push('category = ?');
            updateValues.push(category);
        }

        // If no fields are provided to update, return an error
        if (updateFields.length === 0 && !imageFiles) {
            return res.status(400).json({ success: false, message: 'No fields or images provided to update' });
        }

        // Add the product_id to the update values
        updateValues.push(id);

        // Construct the update query
        if (updateFields.length > 0) {
            const updateQuery = `
                UPDATE Products 
                SET ${updateFields.join(', ')} 
                WHERE product_id = ?;
            `;
            await db.query(updateQuery, updateValues);
        }

        // Handle image updates
        if (imageFiles && imageFiles.length > 0) {
            // Delete old images from the server
            const [oldImages] = await db.query('SELECT image_url FROM ProductImages WHERE product_id = ?', [id]);
            for (let image of oldImages) {
                const filePath = path.join(__dirname, '..', image.image_url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath); // Delete the file
                }
            }

            // Delete old images from the database
            await db.query('DELETE FROM ProductImages WHERE product_id = ?', [id]);

            // Insert new images
            for (let file of imageFiles) {
                const insertImageQuery = `
                    INSERT INTO ProductImages (product_id, image_url)
                    VALUES (?, ?);
                `;
                await db.query(insertImageQuery, [id, `/uploads/${file.filename}`]);
            }
        }

        res.status(200).json({ success: true, message: 'Product updated successfully' });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// Delete a Product
const deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        // Delete images from the server
        const [images] = await db.query('SELECT image_url FROM ProductImages WHERE product_id = ?', [id]);
        for (let image of images) {
            const filePath = path.join(__dirname, '..', image.image_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // Delete the file
            }
        }

        // Delete the product and its images from the database
        await db.query('DELETE FROM Products WHERE product_id = ?', [id]);

        res.status(200).json({ success: true, message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

module.exports = {
    addProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct
}