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


// ---------------- RECEIVE DATA ----------------

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
if(!row) return res.json({message:"no data"});

res.json(row);

});

});


// ---------------- PREDICTION ----------------

app.get('/predict-contamination',(req,res)=>{

db.all(`SELECT * FROM sensor_data ORDER BY timestamp ASC`,[],(err,data)=>{

if(data.length < 5){

return res.json({
status:"insufficient_data"
});

}

const t0=data[0].timestamp;

const x=data.map(d=>(d.timestamp-t0)/1000);
const tds=data.map(d=>d.tds);
const ph=data.map(d=>d.ph);
const turb=data.map(d=>d.turbidity);

const tdsModel=new SimpleLinearRegression(x,tds);
const phModel=new SimpleLinearRegression(x,ph);
const turbModel=new SimpleLinearRegression(x,turb);

const TDS_LIMIT=500;
const TURB_LIMIT=30;
const PH_LOW=6.5;
const PH_HIGH=8.5;

let predictions=[];

function addPrediction(parameter,time){

predictions.push({
parameter,
time:new Date(t0+time*1000).toLocaleString("en-IN")
});

}


// TDS
if(tdsModel.slope!==0){

const t=(TDS_LIMIT-tdsModel.intercept)/tdsModel.slope;
if(t>0) addPrediction("TDS",t);

}

// Turbidity
if(turbModel.slope!==0){

const t=(TURB_LIMIT-turbModel.intercept)/turbModel.slope;
if(t>0) addPrediction("Turbidity",t);

}

// pH
if(phModel.slope!==0){

const tLow=(PH_LOW-phModel.intercept)/phModel.slope;
const tHigh=(PH_HIGH-phModel.intercept)/phModel.slope;

if(tLow>0) addPrediction("pH Acidic",tLow);
if(tHigh>0) addPrediction("pH Alkaline",tHigh);

}

let earliest=null;

if(predictions.length>0){

earliest=predictions.reduce((a,b)=>
new Date(a.time)<new Date(b.time)?a:b
);

}

res.json({
earliestRisk:earliest
});

});

});


// ---------------- DASHBOARD ----------------

app.get('/dashboard',(req,res)=>{

res.send(`

<html>

<head>

<title>Water Quality Dashboard</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/canvas-gauges/gauge.min.js"></script>

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

/* -------- GAUGES -------- */

const phGauge = new RadialGauge({
renderTo: 'phGauge',
width: 250,
height: 250,
units: "pH",
minValue: 0,
maxValue: 14,
majorTicks:["0","2","4","6","8","10","12","14"],
highlights:[
{from:0,to:6.5,color:"rgba(255,0,0,.3)"},
{from:6.5,to:8.5,color:"rgba(0,255,0,.3)"},
{from:8.5,to:14,color:"rgba(255,0,0,.3)"}
],
colorPlate:"#1e293b",
colorNumbers:"#fff",
colorNeedle:"#00ffff"
}).draw();

const tdsGauge = new RadialGauge({
renderTo: 'tdsGauge',
width: 250,
height: 250,
units: "TDS ppm",
minValue: 0,
maxValue: 1000,
majorTicks:["0","200","400","600","800","1000"],
highlights:[
{from:0,to:500,color:"rgba(0,255,0,.3)"},
{from:500,to:1000,color:"rgba(255,0,0,.3)"}
],
colorPlate:"#1e293b",
colorNumbers:"#fff",
colorNeedle:"#00ffff"
}).draw();

const turbGauge = new RadialGauge({
renderTo: 'turbGauge',
width: 250,
height: 250,
units: "NTU",
minValue: 0,
maxValue: 100,
majorTicks:["0","20","40","60","80","100"],
highlights:[
{from:0,to:30,color:"rgba(0,255,0,.3)"},
{from:30,to:100,color:"rgba(255,0,0,.3)"}
],
colorPlate:"#1e293b",
colorNumbers:"#fff",
colorNeedle:"#00ffff"
}).draw();


/* -------- CHART -------- */

const chart = new Chart(document.getElementById('chart'), {

type:'line',

data:{
labels:[],
datasets:[
{label:'TDS',data:[],borderColor:'cyan',tension:0.4},
{label:'pH',data:[],borderColor:'lime',tension:0.4},
{label:'Turbidity',data:[],borderColor:'orange',tension:0.4}
]
},

options:{
responsive:true,
plugins:{legend:{labels:{color:'white'}}},
scales:{
x:{ticks:{color:'white'}},
y:{ticks:{color:'white'}}
}
}

});


async function update(){

const res = await fetch('/latest');
const data = await res.json();

if(!data.timestamp) return;

const time = new Date(data.timestamp).toLocaleTimeString();

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

}
else{

status.innerHTML="✓ SAFE";
status.className="status safe";

}

}


async function getPrediction(){

const res=await fetch('/predict-contamination');
const pred=await res.json();

if(pred.earliestRisk){

document.getElementById("prediction").innerHTML=
"⚠ Predicted contamination due to "+pred.earliestRisk.parameter+
" at "+pred.earliestRisk.time;

}

}


setInterval(update,5000);
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
