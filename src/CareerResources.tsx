/** External career resources; instructor recruitment and CV uploads remain separate workflows. */
export function CareerResources({ profileHref }: { profileHref: string }) {
  return <section className="student-view" aria-label="Career and jobs">
    <div className="student-section-heading"><div><p className="student-kicker">Career development</p><h2>Find opportunities and prepare your CV</h2><p>Explore established job-search services and prepare your own application documents.</p></div></div>
    <div className="student-resource-list">
      <a className="student-resource-card" href="https://jobs.skunkworksacademy.com/" target="_blank" rel="noopener noreferrer"><span>Find jobs</span><div><h3>Job platforms and career channels</h3><p>Search the Academy directory of external platforms by location, industry and work preference. Check current vacancies and apply on the destination service.</p></div><strong aria-hidden="true">↗</strong></a>
      <a className="student-resource-card" href="https://jobs.skunkworksacademy.com/occupational-trades/" target="_blank" rel="noopener noreferrer"><span>CV toolkit</span><div><h3>Create a CV and prepare an application</h3><p>Use the free browser-based CV builder, application checklist and career guidance. Download your CV and decide where to submit it.</p></div><strong aria-hidden="true">↗</strong></a>
      <a className="student-resource-card" href={profileHref}><span>My profile</span><div><h3>Update your Academy profile</h3><p>Edit your display name, contact details, location and bio. Saving your profile does not send a CV to employers.</p></div><strong aria-hidden="true">→</strong></a>
    </div>
    <article className="student-panel"><h3>Your applications</h3><p>Applications made on external job sites are managed by those sites. This learner portal does not currently receive or track their application records.</p><p>The CV builder keeps the document in your browser while you work; its checklist is saved on that device. No CV is uploaded or sent to an employer from this page.</p></article>
  </section>;
}
