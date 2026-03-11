const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const SimpleLinearRegression = require('ml-regression-simple-linear');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());


// ---------------- DATABASE ----------------

const db = new sqlite3.Database('water_data.db');

db.run(`
CREATE TABLE IF NOT EXISTS sensor_data (
id INTEGER PRIMARY KEY AUTOINCREMENT,
timestamp INTEGER,
tds REAL,
ph REAL,
turbidity REAL
)
`);


// ---------------- RECEIVE SENSOR DATA ----------------

app.post('/api/sensor',(req,res)=>{

const timestamp = Date.now();
const tds = Number(req.body.tds);
const ph = Number(req.body.ph);
const turbidity = Number(req.body.turbidity);

db.run(
`INSERT INTO sensor_data (timestamp,tds,ph,turbidity)
VALUES (?,?,?,?)`,
[timestamp,tds,ph,turbidity],
(err)=>{

if(err){
console.log(err);
return res.json({status:"error"});
}

console.log("Stored:",{timestamp,tds,ph,turbidity});

res.json({status:"success"});

});

});


// ---------------- GET LATEST DATA ----------------

app.get('/latest',(req,res)=>{

db.get(
`SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1`,
[],
(err,row)=>{

if(err) return res.json({error:"database error"});

if(!row){
return res.json({message:"no data"});
}

res.json(row);

});

});


// ---------------- PREDICTION ----------------

app.get('/predict-contamination',(req,res)=>{

db.all(`SELECT * FROM sensor_data ORDER BY timestamp ASC`,[],(err,data)=>{

if(err) return res.json({error:"database error"});

if(data.length < 5){
return res.json({
status:"insufficient_data",
message:"Prediction requires at least 5 readings"
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

let predictions=[];

function addPrediction(parameter,time){

predictions.push({
parameter,
predictedTime:new Date(t0+time*1000)
.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})
});

}


// TDS prediction
if(tdsModel.slope!==0){

const t=(TDS_LIMIT-tdsModel.intercept)/tdsModel.slope;

if(t>0) addPrediction("TDS",t);

}

// Turbidity prediction
if(turbModel.slope!==0){

const t=(TURB_LIMIT-turbModel.intercept)/turbModel.slope;

if(t>0) addPrediction("Turbidity",t);

}

// pH prediction
if(phModel.slope!==0){

const tLow=(PH_LOW_LIMIT-phModel.intercept)/phModel.slope;
const tHigh=(PH_HIGH_LIMIT-phModel.intercept)/phModel.slope;

if(tLow>0) addPrediction("pH (Acidic)",tLow);
if(tHigh>0) addPrediction("pH (Alkaline)",tHigh);

}


let earliest=null;

if(predictions.length>0){

earliest=predictions.reduce((a,b)=>
new Date(a.predictedTime)<new Date(b.predictedTime)?a:b
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
background:#0f172a;
color:white;
font-family:Arial;
text-align:center;
}

.container{
display:flex;
justify-content:center;
gap:40px;
margin-top:40px;
}

.card{
background:#1e293b;
padding:20px;
border-radius:10px;
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

<h1>💧 Water Monitoring Dashboard</h1>

<div id="status" class="status safe">SAFE</div>
<div id="prediction"></div>

<div class="container">

<div class="card"><canvas id="phGauge"></canvas></div>
<div class="card"><canvas id="tdsGauge"></canvas></div>
<div class="card"><canvas id="turbGauge"></canvas></div>

</div>

<br>

<canvas id="chart" width="800" height="350"></canvas>


<script>

const phGauge=new RadialGauge({
renderTo:'phGauge',
width:250,
height:250,
units:"pH",
minValue:0,
maxValue:14
}).draw();

const tdsGauge=new RadialGauge({
renderTo:'tdsGauge',
width:250,
height:250,
units:"ppm",
minValue:0,
maxValue:1000
}).draw();

const turbGauge=new RadialGauge({
renderTo:'turbGauge',
width:250,
height:250,
units:"NTU",
minValue:0,
maxValue:100
}).draw();


const chart=new Chart(document.getElementById("chart"),{

type:"line",

data:{
labels:[],
datasets:[
{label:"TDS",data:[],borderColor:"cyan"},
{label:"pH",data:[],borderColor:"lime"},
{label:"Turbidity",data:[],borderColor:"orange"}
]
}

});


async function update(){

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


function checkStatus(data){

const status=document.getElementById("status");

if(data.tds>500 || data.turbidity>30 || data.ph<6.5 || data.ph>8.5){

status.innerHTML="⚠ CONTAMINATED";
status.className="status warning";

}else{

status.innerHTML="✓ SAFE";
status.className="status safe";

}

}


setInterval(update,5000);

</script>

</body>

</html>

`);

});


// ---------------- START SERVER ----------------

app.listen(PORT,()=>{

console.log("Server running on port",PORT);

});
