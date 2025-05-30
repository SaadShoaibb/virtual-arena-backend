const express = require('express')
const { getAllUsers, signupUser, loginUser, getUserById } = require('../controllers/authController')
const isAuthenticated = require('../middlewares/authMiddleware')

const router = express.Router()
// routes


router.get('/get-all-users',getAllUsers)

router.post('/signup',signupUser)
router.post('/login', loginUser);
router.get('/', isAuthenticated,getUserById);



module.exports = router