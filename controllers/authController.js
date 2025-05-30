const db = require("../config/db")
const bcrypt = require('bcryptjs');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { createTables } = require("./tablesController");
const { sendNotification, sendAdminNotification } = require("../services/services");


const getAllUsers = async (req, res) => {
    try {
        const [records] = await db.query('SELECT * FROM users')
        if (!records) {
            return res.send(404).send({
                success: false,
                message: 'No user found',
            })
        }

        res.status(200).send({
            success: true,
            message: 'All User Fetched',
            users: records
        })

    } catch (error) {
        console.log(error)
        req.status(500).send({
            success: false,
            message: 'Server error in server',
            error
        })
    }
}

const signupUser = async (req, res) => {
    try {
        const { name, email, password, phone, birthday, role } = req.body;
        // Check if the 'user' table exists, if not, create it

        // Check if user already exists
        const [existingUser] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await db.query('INSERT INTO Users (name, email, password,phone,birthday ,role) VALUES (?, ?, ?, ?,?,?)', [name, email, hashedPassword, phone, birthday, role || 'customer']);

        res.status(201).json({
            success: true,
            message: 'User registered successfully'
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: 'Server error in signup',
            error
        });
    }
};

// Login Controller (with JWT Token)
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const [user] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (user.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user[0].password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user[0].user_id, email: user[0].email, role: user[0].role, phone: user[0].phone, birthday: user[0].birthday },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            id: user[0].user_id,
            name: user[0].name,
            email: user[0].email,
            role: user[0].role

        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: 'Server error in login',
            error
        });
    }
};


const getUserById = async (req, res) => {
    try {
        const userId = req.user.id; // Extract user ID from the token

        // Fetch user details
        const [user] = await db.query(
            'SELECT user_id, name, email, role, phone, birthday FROM Users WHERE user_id = ?',
            [userId]
        );

        if (!user.length) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Fetch user bookings (session_id and session_status)
        const [bookings] = await db.query(
            `SELECT b.session_id, b.session_status 
             FROM Bookings b
             WHERE b.user_id = ?`,
            [userId]
        );

        // Fetch user tournament registrations (only tournament_id)
        const [registrations] = await db.query(
            `SELECT r.tournament_id 
             FROM TournamentRegistrations r
             WHERE r.user_id = ?`,
            [userId]
        );

        // Extract session IDs, session statuses, and tournament IDs into arrays
        const sessionIds = bookings.map(booking => ({
            session_id: booking.session_id,
            session_status: booking.session_status,
        }));
        const tournamentIds = registrations.map(registration => registration.tournament_id);

        res.status(200).json({
            success: true,
            message: 'User details fetched successfully',
            user: user[0],
            sessionIds, // Include session_id and session_status
            tournamentIds,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user profile',
            error,
        });
    }
};
// Get all wishlist products for a user
const getWishlistProducts = async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user_id = req.user.id;

    try {
        const [wishlistItems] = await db.query(
            `SELECT p.product_id, p.name, p.original_price, p.discount_price,p.discount, p.stock, p.is_active,
                    (SELECT image_url FROM ProductImages WHERE product_id = p.product_id LIMIT 1) AS image_url
             FROM Wishlist w
             JOIN Products p ON w.product_id = p.product_id
             WHERE w.user_id = ?`,
            [user_id]
        );

        res.status(200).json({ success: true, data: wishlistItems });
    } catch (err) {
        console.error('Error fetching wishlist:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch wishlist' });
    }
};


// Remove a product from the wishlist
const removeFromWishlist = async (req, res) => {
    const user_id = req.user.id;
    const { product_id } = req.params;

    try {
        const [result] = await db.query(
            `DELETE FROM Wishlist 
         WHERE user_id = ? AND product_id = ?`,
            [user_id, product_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Product not found in wishlist' });
        }

        res.status(200).json({ success: true, message: 'Product removed from wishlist' });
    } catch (err) {
        console.error('Error removing product from wishlist:', err);
        res.status(500).json({ success: false, message: 'Failed to remove product from wishlist' });
    }
};

// Add a product to the wishlist
const addToWishlist = async (req, res) => {
    const user_id = req.user.id;
    const { product_id } = req.params;

    // Validate input
    if (!user_id || !product_id) {
        return res.status(400).json({ success: false, message: 'User ID and Product ID are required' });
    }

    try {
        // Check if the product is already in the wishlist
        const [existingItem] = await db.query(
            `SELECT * FROM Wishlist 
         WHERE user_id = ? AND product_id = ?`,
            [user_id, product_id]
        );

        if (existingItem.length > 0) {
            return res.status(400).json({ success: false, message: 'Product is already in the wishlist' });
        }

        // Add the product to the wishlist
        await db.query(
            `INSERT INTO Wishlist (user_id, product_id) 
         VALUES (?, ?)`,
            [user_id, product_id]
        );

        res.status(201).json({ success: true, message: 'Product added to wishlist' });
    } catch (err) {
        console.error('Error adding product to wishlist:', err);
        res.status(500).json({ success: false, message: 'Failed to add product to wishlist' });
    }
};


const updateUserByAdmin = async (req, res) => {
    const { user_id } = req.params; // Extract user_id from URL parameters
    const { name, email, phone, birthday, is_active, is_blocked, role } = req.body; // Extract fields to update from request body

    try {
        // Check if the user exists
        const [user] = await db.query('SELECT * FROM Users WHERE user_id = ?', [user_id]);
        if (!user.length) {
            return res.status(404).send({
                success: false,
                message: 'User not found',
            });
        }

        // Construct the SQL query dynamically based on the fields provided in the request body
        let updateQuery = 'UPDATE Users SET ';
        const updateValues = [];
        const updates = [];

        if (name !== undefined) {
            updates.push('name = ?');
            updateValues.push(name);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            updateValues.push(email);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            updateValues.push(phone);
        }
        if (birthday !== undefined) {
            updates.push('birthday = ?');
            updateValues.push(birthday);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            updateValues.push(is_active);
        }
        if (is_blocked !== undefined) {
            updates.push('is_blocked = ?');
            updateValues.push(is_blocked);
        }
        if (role !== undefined) {
            updates.push('role = ?');
            updateValues.push(role);
        }

        // If no fields are provided to update, return an error
        if (updates.length === 0) {
            return res.status(400).send({
                success: false,
                message: 'No fields provided to update',
            });
        }

        // Add the WHERE clause to the query
        updateQuery += updates.join(', ') + ' WHERE user_id = ?';
        updateValues.push(user_id);

        // Execute the update query
        await db.query(updateQuery, updateValues);

        // Fetch the updated user record
        const [updatedUser] = await db.query('SELECT * FROM Users WHERE user_id = ?', [user_id]);

        // Send notification to the user about the profile update
        await sendNotification(
            user_id,
            'updation',
            'Profile Updated',
            'Your profile has been updated.',
            'push',
            `/profile/${user_id}`
        );

        // Send notification to the admin if the role was changed
        if (role !== undefined) {
            await sendAdminNotification(
                'updation',
                'User Role Changed',
                `User ${user_id} role has been changed to ${role}.`,
                'push',
                `/admin/users/${user_id}`
            );
        }

        // Send the response
        res.status(200).send({
            success: true,
            message: 'User updated successfully',
            user: updatedUser[0],
        });

    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            message: 'Server error while updating user',
            error,
        });
    }
};


//delete user with id
const deleteUser = async (req, res) => {
    const { user_id } = req.params; // Extract user_id from the request parameters

    try {
        // Check if the user exists
        const [user] = await db.query('SELECT * FROM Users WHERE user_id = ?', [user_id]);
        if (!user.length) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Delete the user from the database
        await db.query('DELETE FROM Users WHERE user_id = ?', [user_id]);

        // Send success response
        res.status(200).json({
            success: true,
            message: 'User deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting user',
            error: error.message,
        });
    }
};

const getUserAddress = async (req, res) => {
    const user_id = req.user.id; // Get user_id from the token

    try {
        // Fetch the user's shipping address
        const [addresses] = await db.query(
            `SELECT * FROM ShippingAddresses WHERE user_id = ?`,
            [user_id]
        );

        if (addresses.length === 0) {
            return res.status(404).json({ success: false, message: 'No address found for this user' });
        }

        res.status(200).json({ success: true, addresses });
    } catch (err) {
        console.error('Error fetching user address:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const updateUserAddress = async (req, res) => {
    const user_id = req.user.id; // Get user_id from the token
    const { shipping_address_id, full_name, address, city, state, zip_code, country } = req.body;

    // Validate required fields
    if (!shipping_address_id || !full_name || !address || !city || !state || !zip_code || !country) {
        return res.status(400).json({ success: false, message: 'Missing or invalid fields' });
    }

    try {
        // Update the shipping address
        const [result] = await db.query(
            `UPDATE ShippingAddresses 
             SET full_name = ?, address = ?, city = ?, state = ?, zip_code = ?, country = ?
             WHERE shipping_address_id = ? AND user_id = ?`,
            [full_name, address, city, state, zip_code, country, shipping_address_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Address not found or user mismatch' });
        }

        res.status(200).json({ success: true, message: 'Address updated successfully' });
    } catch (err) {
        console.error('Error updating user address:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
createTables()

module.exports = { getAllUsers, signupUser, loginUser, getUserById, getWishlistProducts, removeFromWishlist, addToWishlist, updateUserByAdmin, deleteUser, getUserAddress, updateUserAddress }