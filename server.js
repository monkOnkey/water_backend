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

.status{
font-size:22px;
margin:20px;
}

.safe{color:lime}
.warning{color:red}

</style>

</head>

<body>

<h1>💧 Water Quality Monitoring</h1>

<div id="status" class="status safe">Status: SAFE</div>
<div id="prediction" class="status"></div>

<canvas id="chart" width="900" height="400"></canvas>

<script>

const chart = new Chart(document.getElementById('chart'), {

type:'line',

data:{
labels:[],
datasets:[

{
label:'TDS',
data:[],
borderColor:'cyan',
tension:0.4
},

{
label:'pH',
data:[],
borderColor:'lime',
tension:0.4
},

{
label:'Turbidity',
data:[],
borderColor:'orange',
tension:0.4
},

{
label:'Predicted TDS',
data:[],
borderColor:'magenta',
borderDash:[6,6]
}

]
},

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


async function updateChart(){

const res = await fetch('/latest');
const data = await res.json();

if(!data.timestamp) return;

const time = new Date(data.timestamp).toLocaleTimeString();

chart.data.labels.push(time);

chart.data.datasets[0].data.push(data.tds);
chart.data.datasets[1].data.push(data.ph);
chart.data.datasets[2].data.push(data.turbidity);

if(chart.data.labels.length > 20){

chart.data.labels.shift();
chart.data.datasets.forEach(d=>d.data.shift());

}

chart.update();

checkStatus(data);

}


async function getPrediction(){

const res = await fetch('/predict-contamination');
const pred = await res.json();

if(!pred.slopes) return;

const slope = pred.slopes.tds;

const lastTDS = chart.data.datasets[0].data.slice(-1)[0];

const future = lastTDS + slope * 60;

chart.data.datasets[3].data = [...chart.data.datasets[0].data];

chart.data.datasets[3].data.push(future);

chart.update();

if(pred.contaminationPrediction.tds){

document.getElementById("prediction").innerHTML =
"⚠ Predicted contamination at: " + pred.contaminationPrediction.tds;

}

}


function checkStatus(data){

const statusDiv = document.getElementById("status");

if(data.tds > 500 || data.turbidity > 30 || data.ph < 6.5 || data.ph > 8.5){

statusDiv.innerHTML="⚠ CONTAMINATED";
statusDiv.className="status warning";

}

else{

statusDiv.innerHTML="✓ SAFE";
statusDiv.className="status safe";

}

}


setInterval(updateChart,5000);
setInterval(getPrediction,10000);

</script>

</body>

</html>

`);
});

// -------- START SERVER --------
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
