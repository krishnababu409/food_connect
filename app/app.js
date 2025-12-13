// Import express.js
const express = require("express");
const { User } = require("./models/user");
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const session = require('express-session');
const db = require('./services/db');
// Create express app
var app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("app/static"));

// pug engine
app.set('view engine', 'pug');
app.set('views', './app/views');

//sessions and cookies
app.use(cookieParser());

const oneDay = 1000 * 60 * 60 * 24;
const sessionMiddleware = session({
    secret: "secretkeysdfjsflyoifasd",
    saveUninitialized: true,
    cookie: { maxAge: oneDay },
    resave: false
});
app.use(sessionMiddleware);

app.post('/set-password', async function (req, res) {
    params = req.body;
    var user = new User(params.email);
    try {
        uId = await user.getIdFromEmail();
        if (uId) {
            // If a valid, existing user is found, set the password and redirect to the users single-student page
            await user.setUserPassword(params.password);
            console.log(req.session.id);
            res.send('Password set successfully');
        }
        else {
            // If no existing user is found, add a new one
            newId = await user.addUser(params.email);
            res.send('Perhaps a page where a new user sets a programme would be good here');
        }
    } catch (err) {
        console.error(`Error while adding password `, err.message);
    }
});

// Check submitted email and password pair
app.post('/authenticate', async function (req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).send('Email and password are required.');
        }

        var user = new User(email);
        const uId = await user.getIdFromEmail();
        if (!uId) {
            return res.status(401).send('Invalid email');
        }

        const match = await user.authenticate(password);
        if (!match) {
            return res.status(401).send('Invalid password');
        }

        req.session.uid = uId;
        req.session.loggedIn = true;
        console.log(req.session.id);
        res.redirect('/');
    } catch (err) {
        console.error(`Error while authenticating user:`, err.message);
        res.status(500).send('Internal Server Error');
    }
});

app.get("/", function (req, res) {
    try {
        if (req.session.uid) {
            res.render('dashboard')
        } else {
            res.render('home');
        }
        res.end();
    } catch (err) {
        console.error("Error accessing root route:", err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/logout', function (req, res) {
    try {
        req.session.destroy();
        res.redirect('/');
    } catch (err) {
        console.error("Error logging out:", err);
        res.status(500).send('Internal Server Error');
    }
});


// Auth pages (UI only for now)
app.get("/login", function(req, res) {
    res.render("login", { activePath: req.path });
});

app.get("/register", function(req, res) {
    res.render("register", { activePath: req.path });
});

// About page
app.get("/about", function(req, res) {
    res.render("about", { activePath: req.path });
});

// Contact page
app.get("/contact", function(req, res) {
    res.render("contact", { activePath: req.path });
});

// Dashboard route for donors to land on
app.get("/dashboard", async function(req, res) {
    const { status, q } = req.query;
    const filters = [];
    const params = [];

    if (status && status !== 'all') {
        filters.push('status = ?');
        params.push(status);
    }

    if (q) {
        filters.push('(donor_name LIKE ? OR food_item LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    try {
        const rows = await db.query(
            `SELECT id, donor_name, food_item, quantity, pickup_time, status, created_at
             FROM donations
             ${whereClause}
             ORDER BY pickup_time ASC`,
            params
        );

        // Format dates for display while keeping data simple
        const donations = rows.map((row) => ({
            ...row,
            pickup_time: new Date(row.pickup_time).toLocaleString(),
            created_at: new Date(row.created_at).toLocaleString(),
        }));

        const statusCounts = rows.reduce(
            (acc, row) => {
                acc[row.status] = (acc[row.status] || 0) + 1;
                return acc;
            },
            { Available: 0, Claimed: 0, Completed: 0 }
        );

        const stats = {
            total: rows.length,
            available: statusCounts.Available,
            claimed: statusCounts.Claimed,
            completed: statusCounts.Completed,
        };

        res.render("dashboard", {
            donations,
            stats,
            activePath: req.path,
            statusFilter: status || 'all',
            searchQuery: q || '',
        });
    } catch (err) {
        console.error("Failed to load dashboard", err);
        res.status(500).send("Unable to load dashboard right now.");
    }
});

// Detail view for a single donation
app.get("/donations/:id", async function(req, res) {
    const { id } = req.params;

    try {
        const rows = await db.query(
            `SELECT id, donor_name, food_item, quantity, pickup_time, status, created_at
             FROM donations
             WHERE id = ?`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).render("donation-detail", {
                donation: null,
                notFound: true,
                activePath: req.path,
            });
        }

        const donation = rows[0];
        const formattedDonation = {
            ...donation,
            pickup_time: new Date(donation.pickup_time).toLocaleString(),
            created_at: new Date(donation.created_at).toLocaleString(),
        };

        res.render("donation-detail", {
            donation: formattedDonation,
            activePath: req.path,
        });
    } catch (err) {
        console.error(`Failed to load donation ${id}`, err);
        res.status(500).send("Unable to load donation details right now.");
    }
});

// Create a route for testing the db
app.get("/db_test", function(req, res) {
    // Assumes a table called test_table exists in your database
    sql = 'select * from test_table';
    db.query(sql).then(results => {
        console.log(results);
        res.send(results)
    });
});

// Create a route for /goodbye
// Responds to a 'GET' request
app.get("/goodbye", function(req, res) {
    res.send("Goodbye world!");
});

// Create a dynamic route for /hello/<name>, where name is any value provided by user
// At the end of the URL
// Responds to a 'GET' request
app.get("/hello/:name", function(req, res) {
    // req.params contains any parameters in the request
    // We can examine it in the console for debugging purposes
    console.log(req.params);
    //  Retrieve the 'name' parameter and use it in a dynamically generated page
    res.send("Hello " + req.params.name);
});

// Start server on port 3000
app.listen(3000,function(){
    console.log(`Server running at http://127.0.0.1:3000/`);
});
