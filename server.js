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

app.post('/api/sensor', (req,res)=>{

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

db.all(
`SELECT * FROM sensor_data ORDER BY timestamp ASC`,
[],
(err,data)=>{

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
parameter:parameter,
predictedTime:new Date(t0+time*1000)
.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})
});

}


// TDS
if(tdsModel.slope !== 0){

const t=(TDS_LIMIT - tdsModel.intercept)/tdsModel.slope;

if(t>0) addPrediction("TDS",t);

}


// Turbidity
if(turbModel.slope !== 0){

const t=(TURB_LIMIT - turbModel.intercept)/turbModel.slope;

if(t>0) addPrediction("Turbidity",t);

}


// pH
if(phModel.slope !== 0){

const tLow=(PH_LOW_LIMIT - phModel.intercept)/phModel.slope;
const tHigh=(PH_HIGH_LIMIT - phModel.intercept)/phModel.slope;

if(tLow>0) addPrediction("pH (Acidic)",tLow);
if(tHigh>0) addPrediction("pH (Alkaline)",tHigh);

}


// earliest
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

});


// ---------------- DASHBOARD ----------------

app.get('/dashboard',(req,res)=>{

res.sendFile(__dirname + "/dashboard.html");

});


// ---------------- START SERVER ----------------

app.listen(PORT,()=>{

console.log("Server running on port",PORT);

});
