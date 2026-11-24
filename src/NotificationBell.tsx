import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { portalApi } from "./api";
import type { ClassSession, ClassRegistrationRecord } from "./types";

type Auth = Parameters<typeof portalApi.contactEnquiries>[0];
export function NotificationBell({auth,isStaff,classes,registrations,loadEvents=false}:{auth:Auth;isStaff:boolean;classes:ClassSession[];registrations:ClassRegistrationRecord[];loadEvents?:boolean}) {
 const [mount,setMount]=useState<HTMLElement|null>(null),[open,setOpen]=useState(false),[error,setError]=useState("");
 const [enquiries,setEnquiries]=useState<Awaited<ReturnType<typeof portalApi.contactEnquiries>>>([]);
 useEffect(()=>{const el=document.createElement("div");el.style.position="relative"; const attach=()=>{const brand=document.querySelector('.swa-global-nav__brand');if(brand?.parentElement&&!el.isConnected){brand.before(el);setMount(el);}};attach();const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});return()=>{observer.disconnect();el.remove();};},[]);
 useEffect(()=>{let alive=true;async function refresh(){if(!isStaff)return;try{const rows=await portalApi.contactEnquiries(auth);if(alive){setEnquiries(rows);setError("");}}catch{if(alive)setError("Notifications could not be refreshed.");}}void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{alive=false;clearInterval(timer);};},[auth.account.homeAccountId,isStaff]);
 const [accountEvents,setAccountEvents]=useState<{classes:ClassSession[];registrations:ClassRegistrationRecord[]}>({classes:[],registrations:[]});
 useEffect(()=>{if(!loadEvents)return;let alive=true;setAccountEvents({classes:[],registrations:[]});void Promise.all([portalApi.classes(),portalApi.myClasses(auth)]).then(([classes,registrations])=>{if(alive)setAccountEvents({classes,registrations});}).catch(()=>{if(alive)setError("Scheduled events could not be refreshed.");});return()=>{alive=false;};},[auth.account.homeAccountId,loadEvents]);
 if(loadEvents){classes=accountEvents.classes;registrations=accountEvents.registrations;}
 const registered=new Set(registrations.filter(r=>r.status==="Registered").map(r=>r.classId));
 const events=classes.filter(c=>registered.has(c.id) && c.status!=="Cancelled" && c.status!=="Complete");
 const visibleEnquiries=isStaff ? enquiries : [];
 const count=visibleEnquiries.length+events.length;
 if(!mount)return null;
 return createPortal(<><button type="button" aria-label={`Notifications, ${count} items`} aria-expanded={open} onClick={()=>setOpen(!open)} style={{minWidth:44,minHeight:44,background:"transparent",color:"inherit",border:0}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{count>0&&<sup>{count}</sup>}</button>{open&&<section aria-label="Notifications" onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}} style={{position:"absolute",top:"100%",left:0,width:"min(340px,80vw)",maxHeight:"65vh",overflowY:"auto",padding:16,background:"var(--surface, #101b30)",color:"var(--text-primary, #fff)",border:"1px solid #64748b",borderRadius:12,zIndex:1000}}><h2>Notifications</h2><button onClick={()=>setOpen(false)}>Close</button>{error&&<p role="alert">{error}</p>}{!count&&!error&&<p>No messages or scheduled events.</p>}{visibleEnquiries.map(r=><p key={r.id}><a href="/?inbox=contact">New {r.topic} enquiry</a><br/><small>{new Date(r.createdAt).toLocaleString()}</small></p>)}{events.map(c=><p key={c.id}>{c.title}<br/><small>{c.schedule}</small></p>)}</section>}</>,mount);
}
