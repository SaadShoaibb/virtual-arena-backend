const isStaff = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'staff')) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Staff only'
        });
    }
    next();
};

module.exports = isStaff;
