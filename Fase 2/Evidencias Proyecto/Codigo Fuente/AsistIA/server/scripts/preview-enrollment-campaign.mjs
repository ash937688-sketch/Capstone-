import {dbFirebase}from'../firebaseAdmin.js';
import {createLabClient}from'../enrolmentPilot.js';
import {createEnrollmentCampaign,readEnrollmentCandidates}from'../enrollmentCampaign.js';
const request=createLabClient();
const campaign=createEnrollmentCampaign({listCandidates:()=>readEnrollmentCandidates(dbFirebase,request),labRequest:request,record:async()=>{throw Error('Read-only preview must not write an audit/send record');}});
const preview=await campaign('preview',{}, {id:'read-only-technical-check'});
const reasons={};for(const row of preview.rows)if(row.reason)reasons[row.reason]=(reasons[row.reason]||0)+1;
console.log(JSON.stringify({totalRecords:preview.total,uniqueContacts:preview.unique,eligible:preview.eligible,excluded:preview.excluded,duplicatesMerged:preview.duplicates,exclusionReasons:reasons,noEmailsSent:true},null,2));
