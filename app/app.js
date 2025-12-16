// Import express.js
const express = require("express");
const { User } = require("./models/user");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const db = require("./services/db");
const { Donation } = require("./models/donation");
// Create express app
var app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("app/static"));

// pug engine
app.set("view engine", "pug");
app.set("views", "./app/views");

//sessions and cookies
app.use(cookieParser());

const oneDay = 1000 * 60 * 60 * 24;
const sessionMiddleware = session({
  secret: "secretkeysdfjsflyoifasd",
  saveUninitialized: true,
  cookie: { maxAge: oneDay },
  resave: false,
});
app.use(sessionMiddleware);

app.post("/set-password", async function (req, res) {
  const { email, password, role } = req.body;

  const user = new User(email);

  try {
    const uId = await user.getIdFromEmail();

    if (uId) {
      await user.setUserPassword(password);
      res.redirect("/login");
    } else {
      await user.addUser(password, role);
      res.redirect("/login");
    }
  } catch (err) {
    console.error("Registration error:", err);
    res.render("register", { errorMessage: "Registration failed. Try again." });
  }
});

// Check submitted email and password pair
app.post("/authenticate", async function (req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).render("login", {
        errorMessage: "Email and password are required",
      });
    }

    const user = new User(email);

    // Fetch user + role
    const userData = await user.getUserWithRole();
    if (!userData) {
      return res.status(401).render("login", {
        errorMessage: "Invalid email",
      });
    }

    // Authenticate password
    const match = await user.authenticate(password);
    if (!match) {
      return res.status(401).render("login", {
        errorMessage: "Invalid password",
      });
    }

    // Session values
    req.session.uid = user.id;
    req.session.role = user.role;
    req.session.loggedIn = true;

    // Role-based redirect
    if (user.role === "donor") {
      return res.redirect("/dashboard");
    } else if (user.role === "receiver") {
      return res.redirect("/receiver/dashboard");
    } else {
      return res.redirect("/");
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).render("login", {
      errorMessage: "Something went wrong. Please try again.",
    });
  }
});

app.get("/", function (req, res) {
  try {
    if (req.session.uid) {
      res.render("dashboard");
    } else {
      res.render("home");
    }
    res.end();
  } catch (err) {
    console.error("Error accessing root route:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", function (req, res) {
  try {
    req.session.destroy();
    res.redirect("/");
  } catch (err) {
    console.error("Error logging out:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Auth pages (UI only for now)
app.get("/login", function (req, res) {
  res.render("login", { activePath: req.path });
});

app.get("/register", function (req, res) {
  res.render("register", { activePath: req.path });
});

// About page
app.get("/about", function (req, res) {
  res.render("about", { activePath: req.path });
});

// Contact page
app.get("/contact", function (req, res) {
  res.render("contact", { activePath: req.path });
});

// Contact Us API (POST)
app.post("/contact", async function (req, res) {
  const { name, email, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.render("contact", {
      errorMessage: "All fields are required",
      activePath: req.path,
    });
  }

  try {
    const sql = `
            INSERT INTO contact_messages (name, email, message)
            VALUES (?, ?, ?)
        `;

    await db.query(sql, [name, email, message]);

    res.render("contact", {
      successMessage:
        "Thank you for contacting us. We will get back to you soon.",
      activePath: req.path,
    });
  } catch (err) {
    console.error("Contact API error:", err);
    res.render("contact", {
      errorMessage: "Something went wrong. Please try again later.",
      activePath: req.path,
    });
  }
});

// Donor Dashboard (Only logged-in donor's data)
app.get("/dashboard", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  const donationModel = new Donation(req.session.uid);
  const { status, q } = req.query;

  const rows = await donationModel.getByDonor({ status, q });

  const donations = rows.map((d) => ({
    ...d,
    pickup_time: new Date(d.pickup_time).toLocaleString(),
    created_at: new Date(d.created_at).toLocaleString(),
  }));

  const stats = {
    total: rows.length,
    available: rows.filter((d) => d.status === "Available").length,
    claimed: rows.filter((d) => d.status === "Claimed").length,
    completed: rows.filter((d) => d.status === "Completed").length,
  };

  res.render("dashboard", {
    donations,
    stats,
    statusFilter: status || "all",
    searchQuery: q || "",
    activePath: req.path,
  });
});

// Show create donation form
app.get("/donations/create", function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  res.render("donation-create", {
    activePath: req.path,
  });
});

// Create donation (INSERT)
app.post("/donations/create", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  const donationModel = new Donation(req.session.uid);
  const { food_item, quantity, pickup_time } = req.body;

  await donationModel.create({
    donor_name: "You",
    food_item,
    quantity,
    pickup_time,
  });

  res.redirect("/dashboard");
});

// Detail view for a single donation
app.get("/donations/:id", async function (req, res) {
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
app.get("/db_test", function (req, res) {
  // Assumes a table called test_table exists in your database
  sql = "select * from test_table";
  db.query(sql).then((results) => {
    console.log(results);
    res.send(results);
  });
});

// Show edit donation form
app.get("/donations/:id/edit", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  const { id } = req.params;
  const donorId = req.session.uid;

  try {
    const rows = await db.query(
      `SELECT id, food_item, quantity, pickup_time
             FROM donations
             WHERE id = ? AND donor_id = ?`,
      [id, donorId]
    );

    if (!rows.length) {
      return res.redirect("/dashboard");
    }

    res.render("donation-edit", {
      donation: rows[0],
      activePath: req.path,
    });
  } catch (err) {
    console.error("Edit donation error:", err);
    res.status(500).send("Unable to load edit page");
  }
});

// Update donation
app.post("/donations/:id/edit", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  const donationModel = new Donation(req.session.uid);
  await donationModel.update(req.params.id, req.body);

  res.redirect(`/donations/${req.params.id}`);
});

// Delete donation
app.post("/donations/:id/delete", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "donor") {
    return res.redirect("/login");
  }

  const donationModel = new Donation(req.session.uid);
  await donationModel.delete(req.params.id);

  res.redirect("/dashboard");
});

// Create a route for /goodbye
// Responds to a 'GET' request
app.get("/goodbye", function (req, res) {
  res.send("Goodbye world!");
});

// Create a dynamic route for /hello/<name>, where name is any value provided by user
// At the end of the URL
// Responds to a 'GET' request
app.get("/hello/:name", function (req, res) {
  // req.params contains any parameters in the request
  // We can examine it in the console for debugging purposes
  console.log(req.params);
  //  Retrieve the 'name' parameter and use it in a dynamically generated page
  res.send("Hello " + req.params.name);
});

app.get("/receiver/dashboard", async function (req, res) {
  if (!req.session.loggedIn || req.session.role !== "receiver") {
    return res.redirect("/login");
  }

  const rows = await Donation.getAvailable();

  const donations = rows.map((d) => ({
    ...d,
    pickup_time: new Date(d.pickup_time).toLocaleString(),
    created_at: new Date(d.created_at).toLocaleString(),
  }));

  res.render("receiver-dashboard", {
    donations,
    activePath: req.path,
  });
});

// Profile page
app.get("/profile", async function (req, res) {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }

  try {
    const user = new User();
    const profile = await user.getProfileById(req.session.uid);

    if (!profile) {
      return res.redirect("/");
    }

    res.render("profile", {
      profile,
      activePath: req.path,
    });
  } catch (err) {
    console.error("Profile load error:", err);
    res.status(500).send("Unable to load profile");
  }
});

// Update profile
app.post("/profile", async function (req, res) {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }

  const { email } = req.body;

  if (!email) {
    return res.render("profile", {
      errorMessage: "Email is required",
    });
  }

  try {
    const user = new User();
    await user.updateEmail(req.session.uid, email);

    res.render("profile", {
      successMessage: "Profile updated successfully",
      profile: {
        email,
        role: req.session.role,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.render("profile", {
      errorMessage: "Failed to update profile",
    });
  }
});

// Receiver requests a donation
app.post('/requests/:donationId', async function (req, res) {

    if (!req.session.loggedIn || req.session.role !== 'receiver') {
        return res.redirect('/login');
    }

    const donationId = req.params.donationId;
    const receiverId = req.session.uid;

    try {
        // Prevent duplicate requests
        const existing = await db.query(
            `SELECT id FROM food_requests
             WHERE donation_id = ? AND receiver_id = ?`,
            [donationId, receiverId]
        );

        if (existing.length) {
            return res.redirect('/receiver/dashboard');
        }

        // Insert request
        await db.query(
            `INSERT INTO food_requests (donation_id, receiver_id)
             VALUES (?, ?)`,
            [donationId, receiverId]
        );

        // Mark donation as claimed
        await db.query(
            `UPDATE donations
             SET status = 'Claimed'
             WHERE id = ?`,
            [donationId]
        );

        res.redirect('/receiver/dashboard');

    } catch (err) {
        console.error('Request donation error:', err);
        res.status(500).send('Unable to request donation');
    }
});

// Receiver - My Requested Donations
app.get('/receiver/requests', async function (req, res) {

    if (!req.session.loggedIn || req.session.role !== 'receiver') {
        return res.redirect('/login');
    }

    const receiverId = req.session.uid;

    try {
        const rows = await db.query(
            `
            SELECT 
                fr.id AS request_id,
                fr.status AS request_status,
                fr.requested_at,
                d.food_item,
                d.quantity,
                d.pickup_time,
                d.donor_name
            FROM food_requests fr
            JOIN donations d ON fr.donation_id = d.id
            WHERE fr.receiver_id = ?
            ORDER BY fr.requested_at DESC
            `,
            [receiverId]
        );

        const requests = rows.map(r => ({
            ...r,
            pickup_time: new Date(r.pickup_time).toLocaleString(),
            requested_at: new Date(r.requested_at).toLocaleString()
        }));

        res.render('receiver-requests', {
            requests,
            activePath: req.path
        });

    } catch (err) {
        console.error('Receiver requests error:', err);
        res.status(500).send('Unable to load requested donations');
    }
});


// Donor - View incoming requests
app.get('/donor/requests', async function (req, res) {

    if (!req.session.loggedIn || req.session.role !== 'donor') {
        return res.redirect('/login');
    }

    const donorId = req.session.uid;

    try {
        const rows = await db.query(
            `
            SELECT 
                fr.id AS request_id,
                fr.status AS request_status,
                fr.requested_at,
                u.email AS receiver_email,
                d.food_item,
                d.quantity,
                d.id AS donation_id
            FROM food_requests fr
            JOIN donations d ON fr.donation_id = d.id
            JOIN users u ON fr.receiver_id = u.id
            WHERE d.donor_id = ?
            ORDER BY fr.requested_at DESC
            `,
            [donorId]
        );

        const requests = rows.map(r => ({
            ...r,
            requested_at: new Date(r.requested_at).toLocaleString()
        }));

        res.render('donor-requests', {
            requests,
            activePath: req.path
        });

    } catch (err) {
        console.error('Donor requests error:', err);
        res.status(500).send('Unable to load requests');
    }
});

// Donor approves request
app.post('/requests/:id/approve', async function (req, res) {

    if (!req.session.loggedIn || req.session.role !== 'donor') {
        return res.redirect('/login');
    }

    const requestId = req.params.id;

    try {
        // Approve request
        await db.query(
            `UPDATE food_requests SET status = 'Approved' WHERE id = ?`,
            [requestId]
        );

        res.redirect('/donor/requests');

    } catch (err) {
        console.error('Approve request error:', err);
        res.status(500).send('Unable to approve request');
    }
});

// Donor rejects request
app.post('/requests/:id/reject', async function (req, res) {

    if (!req.session.loggedIn || req.session.role !== 'donor') {
        return res.redirect('/login');
    }

    const requestId = req.params.id;

    try {
        // Reject request
        await db.query(
            `UPDATE food_requests SET status = 'Rejected' WHERE id = ?`,
            [requestId]
        );

        // Optional: make donation available again
        await db.query(
            `
            UPDATE donations d
            JOIN food_requests fr ON d.id = fr.donation_id
            SET d.status = 'Available'
            WHERE fr.id = ?
            `,
            [requestId]
        );

        res.redirect('/donor/requests');

    } catch (err) {
        console.error('Reject request error:', err);
        res.status(500).send('Unable to reject request');
    }
});


// Start server on port 3000
app.listen(3000, function () {
  console.log(`Server running at http://127.0.0.1:3000/`);
});
