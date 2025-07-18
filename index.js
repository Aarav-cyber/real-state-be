// require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3001;

// Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173/",
//     credentials: true,
//   })
// );
// app.use(express.json());

// app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: ["http://localhost:5173"],
    // methods: ["POST", "GET"],
    credentials: true,
  })
);
app.use(express.json()); // pass json that coming any from requests
// app.use(cookieParser())

// PostgreSQL connection pool
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "realestate",
  password: "Aarav789",
  port: 5432,
});

// Set up Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); // create folder if not exists
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Insert user route
app.post("/api/login", async (req, res) => {
  const { full_name, email, google_id, is_guest } = req.body;

  if (!full_name || !email) {
    return res.status(400).send("Invalid input.");
  }

  try {
    await pool.query(
      `INSERT INTO users (full_name, email, google_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (email) DO NOTHING`, // Avoid duplicates
      [full_name, email, google_id]
    );

    const result = await pool.query(
      `SELECT user_id FROM users WHERE google_id = $1`,
      [google_id]
    );
    const user_id = result.rows[0]?.user_id;
    res.status(200).json({ message: "User inserted successfully!", user_id });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).send("Insert failed.");
  }
});

// POST /api/add-property
app.post("/api/sell", upload.array("images"), async (req, res) => {
  console.log(req.body);

  const {
    seller_id,
    title,
    description,
    price,
    status,
    location,
    latitude,
    longitude,
    bedrooms,
    bathrooms,
    kitchen,
    size_sqft,
    phone,
  } = req.body;

  const image_urls =
    req?.files?.map((file) => `/uploads/${file.filename}`) ?? [];

  try {
    await pool.query(
      `INSERT INTO properties (
        seller_id, title, description, price, status, location,
        latitude, longitude, bedrooms, bathrooms, kitchen,
        size_sqft, phone, image_urls
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14
      ) RETURNING *`,
      [
        seller_id,
        title,
        description,
        price,
        status,
        location,
        latitude,
        longitude,
        bedrooms,
        bathrooms,
        kitchen,
        size_sqft,
        phone,
        image_urls,
      ]
    );

    res.status(200).send("Property added successfully!");
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).send("Failed to add property.");
  }
});
// Serve uploaded images
app.use("/uploads", express.static("uploads"));

app.get("/api/properties", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM properties ");
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).send("Failed to fetch properties.");
  }
});

//this is to get the details about the property in the details page
app.get("/api/properties/:id/:user_id", async (req, res) => {
  const { id, user_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM properties WHERE property_id = $1",
      [id]
    );

    const favorite = await pool.query(
      `Select * from favorites where property_id=$1 and user_id = $2`,
      [id, user_id]
    );

    if (result.rows.length === 0) return res.status(404).send("Not found");
    const response = {
      ...result.rows[0],
      favorite: favorite.rows.length > 0,
    };

    res.json(response);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).send("Failed to fetch property.");
  }
});

/// this is all the changes for the favorites function

// Add a favorite
app.post("/api/favorites", async (req, res) => {
  const { user_id, property_id } = req.body;

  // first fetch favourite whose id matches the property id from req.
  // if present, delete it,
  // else add it

  // this is for if any favorites exists
  const results = await pool.query(
    `Select property_id from favorites where property_id= $1 and user_id = $2`,
    [property_id, user_id]
  );

  if (results.rows.length === 0) {// if there is not that property_id then add it 
    try {
      await pool.query(
        "INSERT INTO favorites (user_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user_id, property_id]
      );
      res.status(200).send({
        status: true,
        message: "Added to favorites",
      });
    } catch (err) {
      console.error("Favorite error:", err);
      res.status(500).send({
        status: false,
        message: "Failed to add favorite",
      });
    }
  } else {
    try { 
      await pool.query(
        "DELETE FROM favorites WHERE user_id = $1 AND property_id = $2",
        [user_id, property_id]
      );

      res.status(200).send({
        status: false,
        message: "Removed from favorites",
      });
    } catch (err) {
      console.error("Favorite error:", err);
      res.status(500).send({
        status: false,
        message: "Failed to remove favorite",
      });
    }
  }
});

// Remove a favorite
// app.delete("/api/favorites", async (req, res) => {
//   const { user_id, property_id } = req.body;
//   try {
//     await pool.query(
//       "DELETE FROM favorites WHERE user_id = $1 AND property_id = $2",
//       [user_id, property_id]
//     );
//     res.status(200).send("Removed from favorites");
//   } catch (err) {
//     console.error("Favorite error:", err);
//     res.status(500).send("Failed to remove favorite");
//   }
// });

// Get all favorite properties for a user
app.get("/api/favorites/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT p.* FROM properties p
       JOIN favorites f ON p.property_id = f.property_id
       WHERE f.user_id = $1`,
      [user_id]
    );
    res.json(result.rows);
    console.log(json(result.rows));
  } catch (err) {
    console.error("Fetch favorites error:", err);
    res.status(500).send("Failed to fetch favorites");
  }
});

//till here

//this is for the comments

app.post("/api/comments", async (req, res) => {
  // post route
  const { property_id, user_id, content, parent_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO comments (property_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)`,
      [property_id, user_id, content, parent_id || null]
    );
    res.status(200).send({ status: true, message: "Comment added" });
  } catch (err) {
    console.error("Comment error:", err);
    res.status(500).send({ status: false, message: "Failed to add comment" });
  }
});

app.get("/api/comments/:property_id", async (req, res) => {
  //get route
  const { property_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM comments WHERE property_id = $1 ORDER BY created_at ASC`,
      [property_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch comments error:", err);
    res.status(500).send("Failed to fetch comments");
  }
});

//update comment
app.put("/api/comments/:comment_id", async (req, res) => {
  //to update the comment
  const { comment_id } = req.params;
  const { user_id, content } = req.body;

  console.log(comment_id, "comment_id");
  console.log(user_id, "userid");
  console.log(content, "content");
  try {
    //only works if the user_id matches
    const result = await pool.query(
      `UPDATE comments set content = $1 WHERE comment_id= $2 AND user_id=$3 RETURNING *`,[
        content, comment_id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(403).send({ status: false, message: "Not allowed" });
    }
    res.send({ status: true, message: "Comment updated" });
  } catch (err) {
    console.error("Edit comment error:", err);
    res
      .status(500)
      .send({ status: false, message: "Failed to edit the content" });
  }
});

//Delete comment
app.delete("/api/comments/:comment_id", async (req, res) => {
  const { comment_id } = req.params;
  const { user_id } = req.body;
  try {
    //delete if and only if the user_id matches
    const result = await pool.query(
      `DELETE from comments WHERE comment_id=$1 AND user_id = $2`,
      [comment_id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(403).send({ status: false, message: "Not allowed" });
    }
    res.send({ status: true, message: "Comment deleted" });
  } catch (err) {
    console.log("Delete comment error:", err);
    res
      .status(500)
      .send({ status: false, message: "Failed to Delete the comment" });
  }
});

//till here for comments
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
