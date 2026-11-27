import { createLabClient, PILOT_EMAIL } from '../enrolmentPilot.js';
const request=createLabClient();
const [state,roster,template,biometric]=await Promise.all([request('state'),request('roster'),request('roster/template'),request('biometric/state')]);
const own=state.invites.filter(row=>row.email===PILOT_EMAIL);
console.log(JSON.stringify({bridgeConnected:true,contacts:roster.participants.length,templateAvailable:template.csv.startsWith('\uFEFFnombre;correo;curso;mayor_de_edad'),pilotStates:own.map(row=>row.state),biometricConfigured:biometric.configured,biometricRecords:biometric.enrollments.length,recognitionEnabled:false},null,2));
