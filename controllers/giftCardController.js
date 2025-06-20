const db = require('../config/db');
const crypto = require("crypto");
// Admin creates a new gift card
const createGiftCard = async (req, res) => {
    try {
        const { code, amount, category } = req.body;
        const created_by = req.user.id;

        if (!code || !amount || !created_by) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [result] = await db.query(
            "INSERT INTO GiftCards (code, amount, category, created_by) VALUES (?, ?, ?, ?)",
            [code, amount, category || 'Gift Cards', created_by]
        );

        res.status(201).json({ message: "Gift card created successfully", gift_card_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// Fetch all gift cards for users to purchase
const getAllGiftCards = async (req, res) => {
    try {
        const [giftCards] = await db.query("SELECT * FROM GiftCards WHERE status = 'active'");

        res.status(200).json({ success: true, cards: giftCards });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// Fetch a specific gift card by ID
const getGiftCardById = async (req, res) => {
    try {
        const { id } = req.params;
        const [giftCard] = await db.query("SELECT * FROM GiftCards WHERE gift_card_id = ?", [id]);

        if (giftCard.length === 0) {
            return res.status(404).json({ message: "Gift card not found" });
        }

        res.status(200).json(giftCard[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// Admin can update gift card details
const updateGiftCard = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, amount, status, category } = req.body;

        await db.query(
            "UPDATE GiftCards SET code = ?, amount = ?, status = ?, category = ? WHERE gift_card_id = ?",
            [code, amount, status, category || 'Gift Cards', id]
        );

        res.status(200).json({ message: "Gift card updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};




const purchaseGiftCard = async (req, res) => {
    try {
        const { user_id, gift_card_id } = req.body;

        // Check if the gift card exists and is active
        const [giftCard] = await db.query(
            "SELECT * FROM GiftCards WHERE gift_card_id = ? AND status = 'active'",
            [gift_card_id]
        );

        if (giftCard.length === 0) {
            return res.status(404).json({ message: "Gift card not available" });
        }

        const { amount } = giftCard[0];

        // Check if the user already owns this gift card
        const [userGiftCard] = await db.query(
            "SELECT * FROM UserGiftCards WHERE user_id = ? AND gift_card_id = ?",
            [user_id, gift_card_id]
        );

        if (userGiftCard.length > 0) {
            // User already owns the card, update the remaining balance
            const currentBalance = parseFloat(userGiftCard[0].remaining_balance);
            const newAmount = parseFloat(amount);
            const newBalance = currentBalance + newAmount;

            await db.query(
                "UPDATE UserGiftCards SET remaining_balance = ? WHERE user_id = ? AND gift_card_id = ?",
                [newBalance, user_id, gift_card_id]
            );
            return res.status(200).json({ message: "Gift card balance updated successfully" });
        } else {
            // Generate a unique code for the user's gift card
            const uniqueCode = crypto.randomBytes(8).toString("hex").toUpperCase();

            // User does not own the card, insert a new record
            await db.query(
                "INSERT INTO UserGiftCards (user_id, gift_card_id, remaining_balance, code) VALUES (?, ?, ?, ?)",
                [user_id, gift_card_id, amount, uniqueCode]
            );
            return res.status(201).json({ message: "Gift card purchased successfully", code: uniqueCode });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// Get a single gift card by code
const getUserGiftCardByCode = async (req, res) => {
    try {
        const { code } = req.params; // Extract gift card code from request params

        if (!code) {
            return res.status(400).json({ message: "Gift card code is required" });
        }

        // Query the database for the gift card using the provided code
        const [giftCard] = await db.query(
            `SELECT ugc.*, ugc.code AS user_code, gc.amount 
            FROM UserGiftCards ugc 
            JOIN GiftCards gc ON ugc.gift_card_id = gc.gift_card_id 
            WHERE ugc.code = ?`,
            [code]
        );

        if (!giftCard.length) {
            return res.status(404).json({ message: "Gift card not found" });
        }

        res.status(200).json(giftCard[0]); // Return the first matching gift card
    } catch (error) {
        console.error("Error fetching gift card:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// Get all purchased gift cards for a user
const getUserGiftCards = async (req, res) => {
    try {
        const { user_id } = req.params;

        const [userGiftCards] = await db.query(
            `SELECT ugc.*, ugc.code AS user_code, gc.amount 
            FROM UserGiftCards ugc 
            JOIN GiftCards gc ON ugc.gift_card_id = gc.gift_card_id 
            WHERE ugc.user_id = ?`,
            [user_id]
        );

        res.status(200).json(userGiftCards);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};



// Redeem a gift card using the unique user gift card code
const redeemGiftCard = async (req, res) => {
    try {
        const { user_id, user_gift_card_code, amount_used } = req.body;

        // Get current balance based on the unique user gift card code
        const [userGiftCard] = await db.query(
            "SELECT * FROM UserGiftCards WHERE user_id = ? AND code = ?",
            [user_id, user_gift_card_code]
        );

        if (userGiftCard.length === 0) {
            return res.status(404).json({ message: "Gift card not found" });
        }

        let { remaining_balance, gift_card_id } = userGiftCard[0];

        if (amount_used > remaining_balance) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Deduct amount
        remaining_balance -= amount_used;

        // Update balance
        await db.query(
            "UPDATE UserGiftCards SET remaining_balance = ? WHERE user_id = ? AND code = ?",
            [remaining_balance, user_id, user_gift_card_code]
        );

        // If balance reaches zero, mark as redeemed
        if (remaining_balance === 0) {
            await db.query("UPDATE GiftCards SET status = 'redeemed' WHERE gift_card_id = ?", [gift_card_id]);
        }

        res.status(200).json({ message: "Gift card redeemed successfully", remaining_balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const deleteGiftCard = async (req, res) => {
    const { gift_card_id } = req.params;
    try {
        await db.query('DELETE FROM GiftCards WHERE gift_card_id = ?', [gift_card_id]);
        res.status(200).json({ success: true, message: 'Gift card deleted' });
    } catch (err) {
        console.error('Error deleting gift card:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
module.exports ={
    createGiftCard,
    getAllGiftCards,
    getGiftCardById,
    updateGiftCard,
    purchaseGiftCard,
    getUserGiftCards,
    redeemGiftCard,
    deleteGiftCard,
    getUserGiftCardByCode
}