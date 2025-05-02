require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const dns        = require("dns");
const urlParser  = require("url");
const { MongoClient } = require("mongodb");

const app = express();

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(`${process.cwd()}/public`));

// page d'accueil
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/views/index.html");
});

// configuration MongoDB
const client = new MongoClient(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
let urlsCollection;

// connexion à la BDD puis démarrage du serveur
client.connect()
  .then(() => {
    const db = client.db("urlshortener");
    urlsCollection = db.collection("urls");
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Listening on port ${port}`);
    });
  })
  .catch(err => {
    console.error("Erreur de connexion à MongoDB:", err);
  });

// endpoint de création de shorturl
app.post("/api/shorturl", (req, res) => {
  const inputUrl = req.body.url;  // c'est bien la string soumise
  // parse de la string
  const parsed = urlParser.parse(inputUrl);
  if (!parsed.protocol || !/^https?:$/.test(parsed.protocol)) {
    return res.json({ error: "invalid url" });
  }

  dns.lookup(parsed.hostname, async (err, address) => {
    if (err || !address) {
      return res.json({ error: "invalid url" });
    }

    try {
      // si l'URL existe déjà, on la renvoie
      const existing = await urlsCollection.findOne({ original_url: inputUrl });
      if (existing) {
        return res.json({
          original_url: existing.original_url,
          short_url: existing.short_url
        });
      }

      // sinon, on crée une nouvelle entrée
      const count = await urlsCollection.countDocuments();
      const newDoc = {
        original_url: inputUrl,
        short_url:    count + 1
      };
      await urlsCollection.insertOne(newDoc);

      res.json({
        original_url: newDoc.original_url,
        short_url: newDoc.short_url
      });
    } catch (mongoErr) {
      console.error(mongoErr);
      res.status(500).json({ error: "Server error" });
    }
  });
});

// endpoint de redirection
app.get("/api/shorturl/:short_url", async (req, res) => {
  const short = parseInt(req.params.short_url, 10);
  if (isNaN(short)) {
    return res.json({ error: "Wrong format" });
  }
  try {
    const doc = await urlsCollection.findOne({ short_url: short });
    if (!doc) {
      return res.json({ error: "No short URL found for the given input" });
    }
    res.redirect(doc.original_url);
  } catch (mongoErr) {
    console.error(mongoErr);
    res.status(500).json({ error: "Server error" });
  }
});
