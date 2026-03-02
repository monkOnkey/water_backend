const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const DATA_FILE = "water_data.json";

// Create file if not exists
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
}

// -------- RECEIVE DATA FROM ESP32 --------
app.post('/api/sensor', (req, res) => {

    const newEntry = {
        timestamp: Date.now(),
        tds: Number(req.body.tds),
        ph: Number(req.body.ph),
        turbidity: Number(req.body.turbidity)
    };

    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    data.push(newEntry);

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    console.log("Stored:", newEntry);

    res.json({ status: "success" });
});


// -------- DASHBOARD WITH GRAPHS --------
app.get('/', (req, res) => {

    const data = JSON.parse(fs.readFileSync(DATA_FILE));

    const times = data.map(d =>
        new Date(d.timestamp).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata"
        })
    );

    const tdsValues = data.map(d => d.tds);
    const phValues = data.map(d => d.ph);
    const turbidityValues = data.map(d => d.turbidity);

    res.send(`
    <html>
    <head>
        <title>Water Quality Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <meta http-equiv="refresh" content="10">
        <style>
            body {
                background: #0f172a;
                color: white;
                font-family: Arial;
                text-align: center;
            }
            h1 {
                color: cyan;
            }
            canvas {
                background: #1e293b;
                margin: 20px;
                padding: 10px;
                border-radius: 10px;
                max-width: 900px;
            }
        </style>
    </head>
    <body>

        <h1>💧 Water Quality Monitoring Dashboard</h1>

        <canvas id="tdsChart"></canvas>
        <canvas id="phChart"></canvas>
        <canvas id="turbChart"></canvas>

        <script>
            const labels = ${JSON.stringify(times)};

            new Chart(document.getElementById("tdsChart"), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'TDS (ppm)',
                        data: ${JSON.stringify(tdsValues)},
                        borderColor: 'cyan',
                        borderWidth: 2,
                        fill: false
                    }]
                }
            });

            new Chart(document.getElementById("phChart"), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'pH',
                        data: ${JSON.stringify(phValues)},
                        borderColor: 'lime',
                        borderWidth: 2,
                        fill: false
                    }]
                }
            });

            new Chart(document.getElementById("turbChart"), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Turbidity (%)',
                        data: ${JSON.stringify(turbidityValues)},
                        borderColor: 'orange',
                        borderWidth: 2,
                        fill: false
                    }]
                }
            });
        </script>

    </body>
    </html>
    `);
});


// -------- START SERVER --------
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
