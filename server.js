const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();

// IMPORTANT: use dynamic port for hosting
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Store latest sensor data
let latestData = {
    tds: 0,
    ph: 0,
    turbidity: 0,
    time: "No data yet"
};


// ESP32 sends data here
app.post('/api/sensor', (req, res) => {

    latestData.tds = req.body.tds;
    latestData.ph = req.body.ph;
    latestData.turbidity = req.body.turbidity;
    latestData.time = new Date().toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata"
});

    console.log("Received:", latestData);

    // Save to file
    const log = `${latestData.time} | TDS:${latestData.tds} | pH:${latestData.ph} | Turbidity:${latestData.turbidity}\n`;

    fs.appendFileSync("data.txt", log);

    res.json({ status: "success" });
});


// Browser dashboard
app.get('/', (req, res) => {

    res.send(`
    <html>
    <head>
        <title>Water Monitor Dashboard</title>
        <meta http-equiv="refresh" content="3">
        <style>
            body {
                font-family: Arial;
                background: #0f172a;
                color: white;
                text-align: center;
                padding-top: 40px;
            }
            .card {
                background: #1e293b;
                padding: 20px;
                margin: 15px auto;
                width: 300px;
                border-radius: 10px;
                box-shadow: 0 0 10px cyan;
            }
            h1 {
                color: cyan;
            }
        </style>
    </head>
    <body>

        <h1>💧 Water Quality Monitor</h1>

        <div class="card">
            <h2>TDS</h2>
            <p>${latestData.tds} ppm</p>
        </div>

        <div class="card">
            <h2>pH</h2>
            <p>${latestData.ph}</p>
        </div>

        <div class="card">
            <h2>Turbidity</h2>
            <p>${latestData.turbidity} %</p>
        </div>

        <div class="card">
            <h3>Last Update</h3>
            <p>${latestData.time}</p>
        </div>

    </body>
    </html>
    `);
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
