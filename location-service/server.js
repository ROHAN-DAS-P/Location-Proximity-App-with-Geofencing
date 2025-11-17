// --- 1. Import Dependencies ---
const express = require('express');
const jwt = require('jsonwebtoken');
const bearerToken = require('express-bearer-token');
const axios = require('axios'); // To make HTTP requests
const turf = require('@turf/turf'); // For geofence math

// --- 2. Initialize Express App ---
const app = express();
const PORT = 3003; // We'll run this service on port 3003

// --- 3. Configuration ---
// !! CRITICAL !! This MUST be the exact same secret as your User Service.
const JWT_SECRET = process.env.JWT_SECRET;

// This is the URL of our other microservice
const GEOFENCE_SERVICE_URL = 'http://localhost:3002';

// --- 4. In-Memory "Database" for State ---
// This is critical for notifications. We need to know the user's *previous* state
// to know if they just "entered" or "exited".
// In a real app, this would be a database like Redis.
// Format: { userId: "inside" | "outside" | "unknown" }
const userStates = {};

// --- 5. Set Up Middleware ---
app.use(express.json()); // To parse JSON bodies
app.use(bearerToken()); // To find the "Bearer <token>"

// --- 6. Authentication Middleware ---
// This is identical to the middleware in the Geofence Service
const authMiddleware = (req, res, next) => {
    const token = req.token;
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

// --- 7. Define API Endpoints (Routes) ---

/**
 * @route   POST /location
 * @desc    Receive a location update and check against geofences
 * @access  Private (Requires auth)
 */
app.post('/location', authMiddleware, async (req, res) => {
    // 1. Get user info and location from request
    const userId = req.user.id;
    const token = req.token; // We need this to talk to the Geofence Service
    const { location } = req.body; // e.g., { "location": [51.505, -0.09] }

    if (!location || !Array.isArray(location) || location.length !== 2) {
        return res.status(400).json({ message: 'Invalid location format. Expected [latitude, longitude].' });
    }

    try {
        // 2. --- Inter-Service Communication ---
        // Ask the Geofence Service for this user's fences.
        // We must pass the user's token so the Geofence Service knows who they are.
        const fenceResponse = await axios.get(
            `${GEOFENCE_SERVICE_URL}/geofences`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        const geofences = fenceResponse.data; // This is the array of fences

        // 3. --- Geofence Logic (Turf.js) ---
        // Convert the user's location to a Turf.js 'point'
        // Note: Turf.js expects [longitude, latitude]
        const userPoint = turf.point([location[1], location[0]]);
        
        let isInsideAnyFence = false;
        let fenceId = null;

        for (const fence of geofences) {
            // Create a Turf.js 'point' for the fence center
            const fenceCenter = turf.point([fence.center[1], fence.center[0]]);
            
            // Calculate distance in meters
            const distance = turf.distance(userPoint, fenceCenter, { units: 'meters' });

            if (distance <= fence.radius) {
                isInsideAnyFence = true;
                fenceId = fence.id;
                break; // Found a match, stop checking
            }
        }
        
        // 4. --- State Change Detection ---
        const currentStatus = isInsideAnyFence ? "inside" : "outside";
        const previousStatus = userStates[userId] || "unknown"; // Get last known state

        let trigger = "none";
        
        if (currentStatus === "inside" && previousStatus !== "inside") {
            trigger = "enter";
            // In a real app, you'd now call the Notification Service!
            console.log(`EVENT: User ${userId} ENTERED fence ${fenceId}`);
        } else if (currentStatus === "outside" && previousStatus === "inside") {
            trigger = "exit";
            // In a real app, you'd now call the Notification Service!
            console.log(`EVENT: User ${userId} EXITED fence`);
        }
        
        // 5. Update the user's state in our "database"
        userStates[userId] = currentStatus;

        // 6. Send the result back
        res.status(200).json({
            trigger: trigger,
            status: currentStatus,
            fenceId: trigger === "enter" ? fenceId : null
        });

    } catch (err) {
        // This will catch errors from the axios request (e.g., Geofence service is down)
        // or any other internal errors.
        console.error("Error in location service:", err.message);
        res.status(500).json({ message: "Error processing location" });
    }
});

// --- 8. Start The Server ---
app.listen(PORT, () => {
    console.log(`Location Service listening on http://localhost:${PORT}`);
});