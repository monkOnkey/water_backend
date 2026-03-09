const express = require('express');
const fs = require('fs');
const cors = require('cors');
const SimpleLinearRegression = require('ml-regression-simple-linear');

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


// -------- GET CURRENT DATA --------
app.get('/latest', (req, res) => {

    const data = JSON.parse(fs.readFileSync(DATA_FILE));

    if (data.length === 0) {
        return res.json({ message: "No data yet" });
    }

    res.json(data[data.length - 1]);
});


// -------- LINEAR REGRESSION CONTAMINATION PREDICTION --------
app.get('/predict-contamination', (req, res) => {

    const data = JSON.parse(fs.readFileSync(DATA_FILE));

    if (data.length < 5) {
        return res.json({
            error: "Not enough data for prediction (need at least 5 readings)"
        });
    }

    const t0 = data[0].timestamp;

    const x = data.map(d => (d.timestamp - t0) / 1000);

    const tds = data.map(d => d.tds);
    const ph = data.map(d => d.ph);
    const turb = data.map(d => d.turbidity);

    const tdsModel = new SimpleLinearRegression(x, tds);
    const phModel = new SimpleLinearRegression(x, ph);
    const turbModel = new SimpleLinearRegression(x, turb);

    const TDS_LIMIT = 500;
    const TURB_LIMIT = 30;

    let contaminationTimes = {};

    // Predict TDS contamination
    if (tdsModel.slope > 0) {
        const t = (TDS_LIMIT - tdsModel.intercept) / tdsModel.slope;
        contaminationTimes.tds = new Date(t0 + t * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata"
        });
    }

    // Predict turbidity contamination
    if (turbModel.slope > 0) {
        const t = (TURB_LIMIT - turbModel.intercept) / turbModel.slope;
        contaminationTimes.turbidity = new Date(t0 + t * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata"
        });
    }

    res.json({
        slopes: {
            tds: tdsModel.slope,
            ph: phModel.slope,
            turbidity: turbModel.slope
        },
        contaminationPrediction: contaminationTimes
    });
});


app.get('/dashboard', (req, res) => {

    const data = JSON.parse(fs.readFileSync(DATA_FILE));

    const times = data.map(d =>
        new Date(d.timestamp).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata"
        })
    );

    const tds = data.map(d => d.tds);
    const ph = data.map(d => d.ph);
    const turbidity = data.map(d => d.turbidity);

    res.send(`
    <html>
    <head>
        <title>Water Quality Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

        <style>
        body{
            background:#0f172a;
            color:white;
            font-family:Arial;
            text-align:center;
        }

        canvas{
            background:#1e293b;
            border-radius:10px;
            padding:10px;
        }
        </style>
    </head>

    <body>

        <h1>Water Quality Monitoring</h1>

        <canvas id="chart" width="900" height="400"></canvas>

        <script>

        const labels = ${JSON.stringify(times)};

        const data = {
            labels: labels,
            datasets: [

            {
                label: 'TDS (ppm)',
                data: ${JSON.stringify(tds)},
                borderColor: 'cyan',
                tension: 0.4
            },

            {
                label: 'pH',
                data: ${JSON.stringify(ph)},
                borderColor: 'lime',
                tension: 0.4
            },

            {
                label: 'Turbidity',
                data: ${JSON.stringify(turbidity)},
                borderColor: 'orange',
                tension: 0.4
            }

            ]
        };

        new Chart(document.getElementById('chart'), {
            type: 'line',
            data: data,
            options:{
                responsive:true,
                plugins:{
                    legend:{labels:{color:'white'}}
                },
                scales:{
                    x:{ticks:{color:'white'}},
                    y:{ticks:{color:'white'}}
                }
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
