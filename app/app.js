// Import express.js
const express = require("express");

// Create express app
var app = express();

// Set the view engine to pug
app.set('view engine', 'pug');
app.set('views', './app/views');

// Add static files location
app.use(express.static("static"));

// Get the functions in the db.js file to use
const db = require('./services/db');

// Create a route for root - /
app.get("/", function(req, res) {
    // render the home.pug file
    res.render("home");
});

// Dashboard route for donors to land on
app.get("/dashboard", async function(req, res) {
    try {
        const rows = await db.query(
            `SELECT donor_name, food_item, quantity, pickup_time, status, created_at
             FROM donations
             ORDER BY pickup_time ASC`
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

        res.render("dashboard", { donations, stats, activePath: req.path });
    } catch (err) {
        console.error("Failed to load dashboard", err);
        res.status(500).send("Unable to load dashboard right now.");
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
