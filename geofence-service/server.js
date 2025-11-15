// --- 1. Import Dependencies ---
const express = require('express');
const jwt = require('jsonwebtoken');
const bearerToken = require('express-bearer-token'); // Helper to find the token

// --- 2. Initialize Express App ---
const app = express();
const PORT = 3002; // We'll run this service on port 3002

// --- 3. Set Up Middleware ---
app.use(express.json()); // To parse JSON bodies
app.use(bearerToken()); // To find the "Bearer <token>" in the Authorization header

// --- 4. Configuration & "Database" ---

// !! CRITICAL !! This MUST be the exact same secret as your User Service.
const JWT_SECRET = 'REPLACE_THIS_WITH_A_REAL_SECRET_KEY';

// In-memory "database" for geofences
// Each geofence object will have an 'id', 'name', 'center', 'radius', and 'userId'
const geofences = [];
let fenceIdCounter = 1; // Simple counter for unique IDs

// --- 5. Authentication Middleware ---
// This function will run before any protected endpoint.
// It checks for a valid token and attaches the user's info to the request.
const authMiddleware = (req, res, next) => {
    const token = req.token; // 'req.token' is provided by the 'express-bearer-token' middleware

    if (!token) {
        // No token was provided
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        // Verify the token using our secret
        const decoded = jwt.verify(token, JWT_SECRET);

        // The token is valid!
        // We add the 'user' payload from the token to the request object
        req.user = decoded.user;
        
        // Pass control to the next function (the actual endpoint)
        next();
    } catch (err) {
        // Token is invalid (expired, wrong signature, etc.)
        res.status(401).json({ message: 'Invalid token.' });
    }
};

// --- 6. Define API Endpoints (Routes) ---

/**
 * @route   POST /geofences
 * @desc    Create a new geofence
 * @access  Private (Requires auth)
 */
// Note: We put our 'authMiddleware' function right before the main (req, res) handler.
// This "protects" the route.
app.post('/geofences', authMiddleware, (req, res) => {
    // If the code reaches this point, authMiddleware has successfully run.
    // We know who the user is from 'req.user'.
    const { name, center, radius } = req.body;
    const userId = req.user.id; // Get the user ID from the token

    // Basic validation
    if (!name || !center || !radius) {
        return res.status(400).json({ message: 'Please provide name, center, and radius' });
    }

    // Create and "save" the new geofence
    const newFence = {
        id: fenceIdCounter++,
        userId: userId, // Link the fence to the user
        name: name,
        center: center, // e.g., [51.505, -0.09]
        radius: radius, // e.g., 500 (in meters)
    };

    geofences.push(newFence);

    console.log('New geofence created:', newFence);
    console.log('All geofences:', geofences);

    // Send the new geofence back to the client
    res.status(201).json(newFence);
});

/**
 * @route   GET /geofences
 * @desc    Get all geofences for the logged-in user
 * @access  Private (Requires auth)
 */
app.get('/geofences', authMiddleware, (req, res) => {
    // We know who the user is from 'req.user'.
    const userId = req.user.id;

    // Filter the main geofences array to find only ones matching this user's ID
    const userFences = geofences.filter(fence => fence.userId === userId);

    res.status(200).json(userFences);
});

// --- 7. Start The Server ---
app.listen(PORT, () => {
    console.log(`Geofence Service listening on http://localhost:${PORT}`);
});