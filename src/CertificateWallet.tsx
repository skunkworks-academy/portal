import {useEffect,useState} from "react";
import type {AccountInfo,IPublicClientApplication} from "@azure/msal-browser";
import {portalApi,type AcademyBeginnerAward,type AcademyEnrolment} from "./api";

type Auth={instance:IPublicClientApplication;account:AccountInfo};
const codes=["SKW-BEG-AI-101","SKW-BEG-CYB-101","SKW-BEG-IT-101","SKW-BEG-M365-101","SKW-BEG-CLD-101"];
function download(svg:string,filename:string){
 const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function CertificateWallet({courseId,auth,isStaff,onSignOut}:{courseId:string;auth?:Auth;isStaff:boolean;onSignOut:()=>void}){
 const [award,setAward]=useState<AcademyBeginnerAward|null>(null);
 const [pending,setPending]=useState(true);
 const [message,setMessage]=useState("");
 const [learnerName,setLearnerName]=useState(()=>auth?.account.name || "");
 const [enrolments,setEnrolments]=useState<AcademyEnrolment[]>([]);
 const [enrolmentId,setEnrolmentId]=useState("");
 const [knowledgeCorrect,setKnowledgeCorrect]=useState(10);
 const [capstoneScore,setCapstoneScore]=useState(70);
 const [reviewNotes,setReviewNotes]=useState("");
 const [evidenceReviewed,setEvidenceReviewed]=useState(false);
 const [criticalSafetyPassed,setCriticalSafetyPassed]=useState(false);
 const valid=codes.includes(courseId);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   setPending(true);setAward(null);setMessage("");
   if(!auth||!valid){setPending(false);setMessage("Sign in and choose a supported beginner course.");return;}
   try{const result=await portalApi.myBeginnerCertificate(courseId,auth);if(!cancelled)setAward(result);}
   catch{if(!cancelled)setMessage("No approved certificate is recorded yet. Complete the knowledge check and capstone, then request authorised review.");}
   if(isStaff){try{const list=await portalApi.staffBeginnerEnrolments(courseId,auth);if(!cancelled)setEnrolments(list);}
    catch{if(!cancelled)setMessage("Staff enrolments could not be loaded. Check role permissions and the API connection.");}}
   if(!cancelled)setPending(false);
  }
  void load();
  return()=>{cancelled=true;};
 },[courseId,auth?.account.homeAccountId,isStaff]);
 async function requestReview(){
  if(!auth || !valid || !learnerName.trim())return;
  setPending(true);setMessage("");
  try{
   const result=await portalApi.requestBeginnerAssessment(courseId,learnerName.trim(),auth);
   setMessage("Your Academy review record is "+result.status+". Save your capstone evidence and contact training@skunkworks.africa to submit it for authorised assessment. No certificate is issued until staff approval.");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not register the assessment review request.");}
  finally{setPending(false);}
 }
 async function issue(){
  if(!auth||!enrolmentId)return;
  setPending(true);setMessage("");
  try{
    const result=await portalApi.issueBeginnerCertificate(enrolmentId,{knowledgeCorrect,capstoneScore,criticalSafetyPassed,evidenceReviewed,reviewerNotes:reviewNotes},auth);
    setMessage("Approved and issued: "+result.certificateId+". The learner can now sign in to download.");
    setReviewNotes("");setEvidenceReviewed(false);setCriticalSafetyPassed(false);
    setEnrolments(await portalApi.staffBeginnerEnrolments(courseId,auth));
  }catch(e){setMessage(e instanceof Error?e.message:"Certificate approval failed.");}
  finally{setPending(false);}
 }
 return <main id="main" className="certificateWallet">
  <header className="certificateWalletHeader"><div><p>Skunkworks Academy · Verified awards</p><h1>Course completion certificate & badge</h1></div><button onClick={onSignOut}>Sign out</button></header>
  <p>Course: <strong>{courseId}</strong>. These awards are issued only after an authorised staff member reviews the knowledge assessment, capstone portfolio and critical safety controls. Learner-local progress does not issue credentials.</p>
  <div className="certificateWalletActions"><a href="https://www.skunkworksacademy.com/beginner/">Back to beginner courses</a><a href="https://portal.skunkworksacademy.com/">Portal dashboard</a></div>
  {pending&&<p role="status">Checking approved Academy records…</p>}
  {message&&<p role="status">{message}</p>}
  {!award && auth && valid && <section className="certificateWalletRequest" aria-label="Request course assessment">
    <h2>Register your course completion review</h2>
    <p>Register the learner's name and course with the Academy. This is a <strong>review request, not a certificate</strong>; an authorised staff member must check your knowledge results, practical capstone, identity and safety criteria. No payment is taken here.</p>
    <label htmlFor="review-learner-name">Learner's full name</label>
    <input id="review-learner-name" value={learnerName} maxLength={160} onChange={e=>setLearnerName(e.target.value)} placeholder="Full name for the assessment record" autoComplete="name"/>
    <button type="button" disabled={pending || !learnerName.trim()} onClick={()=>void requestReview()}>Create or update review request</button>
    <p>Need help submitting evidence? <a href={'mailto:training@skunkworks.africa?subject='+encodeURIComponent('Capstone review request: '+courseId)}>Contact Academy assessment support</a>.</p>
  </section>}
  {award&&<section className="certificateWalletAward">
   <h2>Certificate issued to {award.learnerName}</h2><p>Course: {award.courseId} · Award ID: {award.certificateId} · Issued {new Date(award.issuedAt).toLocaleDateString()}</p>
   <div className="certificateWalletPreview"><img src={'data:image/svg+xml,'+encodeURIComponent(award.certificateSvg)} alt={'Official Skunkworks Academy certificate for '+award.learnerName} /></div>
   <div className="certificateWalletActions">
    <button onClick={()=>download(award.certificateSvg,'Skunkworks-Academy-Certificate-'+award.courseId+'.svg')}>Download certificate (SVG)</button>
    <button onClick={()=>download(award.badgeSvg,'Skunkworks-Academy-Badge-'+award.courseId+'.svg')}>Download digital badge (SVG)</button>
    <button onClick={()=>window.print()}>Print / save certificate as PDF</button>
   </div>
   <p>Official credential verification: <a href={'https://api.skunkworksacademy.com/api/certificates/verify/'+encodeURIComponent(award.certificateId)} target="_blank" rel="noreferrer">Verify award record</a></p>
  </section>}
  {isStaff&&valid&&<section className="certificateWalletStaff">
   <h2>Staff: approve assessed course completion</h2><p>Only use this after independently confirming the learner identity, full assessment evidence and all safety-critical rubric criteria. Approval is recorded against the enrolment.</p>
   <label>Eligible enrolment<select value={enrolmentId} onChange={e=>setEnrolmentId(e.target.value)}><option value="">Select a learner enrolment</option>
   {enrolments.filter(e=>["Submitted","Active","Completed"].includes(e.status)).map(e=><option value={e.id} key={e.id}>{e.learnerName} ({e.learnerEmail}) — {e.status}</option>)}</select></label>
   <label>Knowledge correct answers (out of 12)<input type="number" min={10} max={12} value={knowledgeCorrect} onChange={e=>setKnowledgeCorrect(Number(e.target.value))}/></label>
   <label>Capstone rubric (out of 100)<input type="number" min={70} max={100} value={capstoneScore} onChange={e=>setCapstoneScore(Number(e.target.value))}/></label>
   <label>Evidence reviewed, tests verified and learner identity confirmed<input type="checkbox" checked={evidenceReviewed} onChange={e=>setEvidenceReviewed(e.target.checked)}/></label>
   <label>All critical safety criteria passed<input type="checkbox" checked={criticalSafetyPassed} onChange={e=>setCriticalSafetyPassed(e.target.checked)}/></label>
   <label>Review evidence reference and approval rationale<textarea rows={4} minLength={12} maxLength={300} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="Approved evidence reference and specific rubric findings; do not paste sensitive data" /></label>
   <button type="button" disabled={pending||!enrolmentId||!evidenceReviewed||!criticalSafetyPassed||reviewNotes.trim().length<12||knowledgeCorrect<10||knowledgeCorrect>12||capstoneScore<70||capstoneScore>100} onClick={()=>void issue()}>Approve and issue signed certificate</button>
  </section>}
 </main>;
}
