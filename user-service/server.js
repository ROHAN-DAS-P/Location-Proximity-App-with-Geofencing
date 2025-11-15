// --- 1. Import Dependencies ---
const express = require('express');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For authentication tokens

// --- 2. Initialize Express App ---
const app = express();
const PORT = 3001; // We'll run this service on port 3001

// --- 3. Set Up Middleware ---
// This middleware allows our app to parse incoming JSON data (like from a POST request)
app.use(express.json());

// --- 4. In-Memory "Database" ---
// In a real app, this would be a real database (e.g., PostgreSQL, MongoDB).
// For this example, we'll just use an array.
const users = [];

// This is our "secret key" for signing JWTs.
// In a real app, this MUST be stored securely in an environment variable.
const JWT_SECRET = 'REPLACE_THIS_WITH_A_REAL_SECRET_KEY';

// --- 5. Define API Endpoints (Routes) ---

/**
 * @route   POST /register
 * @desc    Register a new user
 * @access  Public
 */
app.post('/register', async (req, res) => {
    try {
        // Get username and password from the request body
        const { username, password } = req.body;

        // Basic validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Please provide username and password' });
        }

        // Check if user already exists
        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        // Hash the password
        // '10' is the "salt round" - a measure of hashing strength
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create the new user object
        const newUser = {
            id: users.length + 1, // Simple ID generation
            username: username,
            password: hashedPassword,
        };

        // "Save" the user to our in-memory DB
        users.push(newUser);

        console.log('User registered:', newUser);
        console.log('All users:', users);

        // Send a success response (don't send the password back)
        res.status(201).json({
            id: newUser.id,
            username: newUser.username,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   POST /login
 * @desc    Log in an existing user
 * @access  Public
 */
app.post('/login', async (req, res) => {
    try {
        // Get username and password from the request body
        const { username, password } = req.body;

        // Find the user in our "database"
        const user = users.find(u => u.username === username);
        if (!user) {
            // Use a generic message to avoid telling attackers which field was wrong
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Compare the provided password with the stored hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // If credentials are correct, create a JSON Web Token (JWT)
        const payload = {
            user: {
                id: user.id,
                username: user.username,
            },
        };

        // Sign the token with our secret key
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '1h' }, // Token expires in 1 hour
            (err, token) => {
                if (err) throw err;
                // Send the token back to the client
                res.status(200).json({ token });
            }
        );

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- 6. Start The Server ---
app.listen(PORT, () => {
    console.log(`User Service listening on http://localhost:${PORT}`);
});