const express = require('express');
const fs = require('fs');
const cors = require('cors');
const SimpleLinearRegression = require('ml-regression-simple-linear');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const DATA_FILE = "water_data.json";

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
}


// ---------------- RECEIVE DATA ----------------

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

    res.json({status:"success"});
});


// ---------------- GET LATEST DATA ----------------

app.get('/latest', (req,res)=>{

const data = JSON.parse(fs.readFileSync(DATA_FILE));

if(data.length===0){
return res.json({message:"no data"});
}

res.json(data[data.length-1]);

});


// ---------------- PREDICTION ----------------

app.get('/predict-contamination', (req, res) => {

const data = JSON.parse(fs.readFileSync(DATA_FILE));

if (data.length < 5) {
return res.json({
status:"insufficient_data",
message:"Prediction requires at least 5 sensor readings"
});
}

const t0 = data[0].timestamp;

const x = data.map(d => (d.timestamp - t0)/1000);

const tds = data.map(d=>d.tds);
const ph = data.map(d=>d.ph);
const turb = data.map(d=>d.turbidity);

const tdsModel = new SimpleLinearRegression(x,tds);
const phModel = new SimpleLinearRegression(x,ph);
const turbModel = new SimpleLinearRegression(x,turb);

const TDS_LIMIT = 500;
const TURB_LIMIT = 30;
const PH_LOW_LIMIT = 6.5;
const PH_HIGH_LIMIT = 8.5;

let predictions = [];

function addPrediction(parameter,time){

predictions.push({
parameter:parameter,
predictedTime:new Date(t0 + time*1000)
.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})
});

}

// -------- TDS --------
if(tdsModel.slope !== 0){

const t=(TDS_LIMIT - tdsModel.intercept)/tdsModel.slope;

if(t>0){
addPrediction("TDS",t);
}

}

// -------- TURBIDITY --------
if(turbModel.slope !== 0){

const t=(TURB_LIMIT - turbModel.intercept)/turbModel.slope;

if(t>0){
addPrediction("Turbidity",t);
}

}

// -------- PH --------
if(phModel.slope !== 0){

const tLow=(PH_LOW_LIMIT - phModel.intercept)/phModel.slope;
const tHigh=(PH_HIGH_LIMIT - phModel.intercept)/phModel.slope;

if(tLow>0){
addPrediction("pH (Acidic)",tLow);
}

if(tHigh>0){
addPrediction("pH (Alkaline)",tHigh);
}

}

// -------- EARLIEST CONTAMINATION --------
let earliest=null;

if(predictions.length>0){

earliest=predictions.reduce((a,b)=>
new Date(a.predictedTime) < new Date(b.predictedTime) ? a : b
);

}

res.json({

predictionReport:{

status:"analysis_complete",

parametersAnalyzed:["TDS","pH","Turbidity"],

trendAnalysis:{
tdsSlope:tdsModel.slope,
phSlope:phModel.slope,
turbiditySlope:turbModel.slope
},

earliestRisk:earliest,

allPredictions:predictions

}

});

});

// ---------------- DASHBOARD ----------------

app.get('/dashboard',(req,res)=>{

res.send(`

<html>

<head>

<title>Smart Water Monitoring</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/canvas-gauges/gauge.min.js"></script>

<style>

body{
margin:0;
font-family:Arial;
color:white;
text-align:center;

background: linear-gradient(-45deg,#020617,#0f172a,#020617,#0284c7);
background-size:400% 400%;
animation:gradientMove 15s ease infinite;
}

@keyframes gradientMove{
0%{background-position:0% 50%;}
50%{background-position:100% 50%;}
100%{background-position:0% 50%;}
}

h1{
margin-top:20px;
color:#67e8f9;
text-shadow:0 0 15px #22d3ee;
}

.container{
display:flex;
justify-content:center;
gap:60px;
margin-top:40px;
}

canvas{
filter:drop-shadow(0 0 15px cyan);
}

.card{
background:rgba(255,255,255,0.05);
padding:20px;
border-radius:15px;
backdrop-filter:blur(10px);
box-shadow:0 0 25px rgba(34,211,238,0.4);
}

.status{
font-size:24px;
margin:20px;
}

.safe{color:lime}
.warning{color:red}

.chartBox{
width:850px;
margin:auto;
}

</style>

</head>

<body>

<h1>💧 Smart Water Monitoring Dashboard</h1>

<div id="status" class="status safe">✓ SAFE</div>
<div id="prediction"></div>

<div class="container">

<div class="card"><canvas id="phGauge"></canvas></div>
<div class="card"><canvas id="tdsGauge"></canvas></div>
<div class="card"><canvas id="turbGauge"></canvas></div>

</div>

<br>

<div class="chartBox card">
<canvas id="chart"></canvas>
</div>


<script>

/* -------- GAUGES -------- */

const phGauge=new RadialGauge({
renderTo:'phGauge',
width:250,
height:250,
units:"pH",
minValue:0,
maxValue:14,
majorTicks:["0","2","4","6","8","10","12","14"],
highlights:[
{from:0,to:6.5,color:"rgba(255,0,0,.5)"},
{from:6.5,to:8.5,color:"rgba(0,255,120,.5)"},
{from:8.5,to:14,color:"rgba(255,0,0,.5)"}
],
colorPlate:"#020617",
colorNeedle:"cyan",
colorNumbers:"white"
}).draw();


const tdsGauge=new RadialGauge({
renderTo:'tdsGauge',
width:250,
height:250,
units:"ppm",
minValue:0,
maxValue:1000,
majorTicks:["0","200","400","600","800","1000"],
highlights:[
{from:0,to:500,color:"rgba(0,255,120,.5)"},
{from:500,to:1000,color:"rgba(255,0,0,.5)"}
],
colorPlate:"#020617",
colorNeedle:"cyan",
colorNumbers:"white"
}).draw();


const turbGauge=new RadialGauge({
renderTo:'turbGauge',
width:250,
height:250,
units:"NTU",
minValue:0,
maxValue:100,
majorTicks:["0","20","40","60","80","100"],
highlights:[
{from:0,to:30,color:"rgba(0,255,120,.5)"},
{from:30,to:100,color:"rgba(255,0,0,.5)"}
],
colorPlate:"#020617",
colorNeedle:"cyan",
colorNumbers:"white"
}).draw();



/* -------- CHART -------- */

const chart=new Chart(document.getElementById("chart"),{

type:"line",

data:{
labels:[],
datasets:[
{label:"TDS",data:[],borderColor:"cyan"},
{label:"pH",data:[],borderColor:"lime"},
{label:"Turbidity",data:[],borderColor:"orange"}
]
},

options:{
plugins:{legend:{labels:{color:"white"}}},
scales:{
x:{ticks:{color:"white"}},
y:{ticks:{color:"white"}}
}
}

});


/* -------- LIVE UPDATE -------- */

async function updateDashboard(){

const res=await fetch('/latest');
const data=await res.json();

if(!data.timestamp) return;

const time=new Date(data.timestamp).toLocaleTimeString();

phGauge.value=data.ph;
tdsGauge.value=data.tds;
turbGauge.value=data.turbidity;

chart.data.labels.push(time);

chart.data.datasets[0].data.push(data.tds);
chart.data.datasets[1].data.push(data.ph);
chart.data.datasets[2].data.push(data.turbidity);

if(chart.data.labels.length>20){

chart.data.labels.shift();
chart.data.datasets.forEach(d=>d.data.shift());

}

chart.update();

checkStatus(data);

}


/* -------- STATUS -------- */

function checkStatus(data){

const status=document.getElementById("status");

if(data.tds>500 || data.turbidity>30 || data.ph<6.5 || data.ph>8.5){

status.innerHTML="⚠ CONTAMINATED";
status.className="status warning";

}
else{

status.innerHTML="✓ SAFE";
status.className="status safe";

}

}


/* -------- PREDICTION -------- */

async function getPrediction(){

const res=await fetch('/predict-contamination');
const pred=await res.json();

if(pred.contaminationPrediction.tds){

document.getElementById("prediction").innerHTML=
"⚠ Predicted contamination at: "+pred.contaminationPrediction.tds;

}

}


setInterval(updateDashboard,5000);
setInterval(getPrediction,10000);

</script>

</body>

</html>

`);

});


// ---------------- START SERVER ----------------

app.listen(PORT,()=>{
console.log("Server running on port",PORT);
});
