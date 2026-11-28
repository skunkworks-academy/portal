import { createHash } from "node:crypto";
import { hasPortalRole, type Principal } from "./auth.js";
import { HttpError } from "./http.js";
import { JobsDataverse, type Row, type Table } from "./jobsDataverse.js";
import { reviewStages, trackerStages, type CareerProfile, type JobEntry, type Stage, type Vacancy } from "../src/jobs/model.js";

const bad = (message: string) => new HttpError(400, message);
const missing = () => new HttpError(404, "Record not found.");
const requiredProfile = () => new HttpError(409, "Save your candidate profile first.");
export const isRecruiter = (person: Principal) => hasPortalRole(person, ["Jobs.Recruiter"]);
export function guid(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw bad("A valid record identifier is required.");
  return value.toLowerCase();
}
// Separate namespaces make an activity ID unusable as a profile or vacancy ID.
export function stableId(...parts: string[]) {
  const bytes = createHash("sha256").update(JSON.stringify(["academy-jobs-v1", ...parts])).digest();
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.subarray(0, 16).toString("hex");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
}
function owner(person: Principal) {
  if (!person.tenantId || !person.subject) throw new HttpError(401, "A Microsoft user identity is required.");
  return stableId("candidate", person.tenantId.toLowerCase(), person.subject);
}
function fields(input: Row, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw bad("The request contains an unsupported field.");
}
function string(value: unknown, label: string, limit = 100, required = true) {
  if (!required && (value === undefined || value === null)) return "";
  if (typeof value !== "string" || value.trim().length > limit || (required && !value.trim())) throw bad("Check the " + label + " field.");
  return value.trim();
}
function day(value: unknown) {
  const day = string(value, "follow-up date", 10, false);
  if (day && (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) throw bad("Enter a valid follow-up date.");
  return day;
}
function stage(value: unknown, choices: readonly string[]): Stage {
  if (typeof value !== "string" || !choices.includes(value)) throw bad("Choose a valid application stage.");
  return value as Stage;
}
function version(value: unknown) {
  if (typeof value !== "string" || !/^W\/"\d{1,24}"$/.test(value)) throw bad("Refresh this record before updating it.");
  return value;
}
const profileFields = ["name", "email", "location", "target"];
const vacancyFields = ["name", "employer", "location", "summary", "open"];
const entryFields = ["name", "employer", "source", "stage", "nextaction", "followup"];
export class JobsWorkspace {
  constructor(private db: JobsDataverse) {}
  private cols(names: string[]) { return names.map(name => this.db.col(name)); }
  private values(fields: Row): Row { return Object.fromEntries(Object.entries(fields).map(([name, value]) => [this.db.col(name), value])); }
  private text(row: Row, name: string) { return String(row[this.db.col(name)] ?? ""); }
  private profile(row: Row): CareerProfile {
    return { name: this.text(row, "name"), email: this.text(row, "email"), location: this.text(row, "location"), target: this.text(row, "target"), version: version(row["@odata.etag"]) };
  }
  private vacancy(row: Row): Vacancy {
    return { id: guid(row[this.db.col("jobvacancyid")]), title: this.text(row, "name"), company: this.text(row, "employer"),
      location: this.text(row, "location"), summary: this.text(row, "summary"), open: row[this.db.col("open")] === true, version: version(row["@odata.etag"]) };
  }
  private entry(row: Row): JobEntry {
    const vacancyId = row[this.db.lookup("vacancy")];
    return { id: guid(row[this.db.col("jobentryid")]), vacancyId: vacancyId ? guid(vacancyId) : null,
      title: this.text(row, "name"), company: this.text(row, "employer"), source: this.text(row, "source"),
      stage: stage(row[this.db.col("stage")], trackerStages), nextAction: this.text(row, "nextaction"), followUp: this.text(row, "followup"),
      created: String(row.createdon), version: version(row["@odata.etag"]) };
  }
  private entryCols() { return [...this.cols(entryFields), this.db.lookup("vacancy"), "createdon"]; }
  async dashboard(person: Principal) {
    const id = owner(person);
    const [profile, vacancies, entries] = await Promise.all([
      this.db.get("jobprofile", id, this.cols(profileFields)),
      this.db.list("jobvacancy", this.cols(vacancyFields), this.db.col("open") + " eq true"),
      this.db.list("jobentry", this.entryCols(), this.db.lookup("candidate") + " eq " + id)
    ]);
    return { profile: profile ? this.profile(profile) : null, vacancies: vacancies.map(row => this.vacancy(row)), entries: entries.map(row => this.entry(row)), recruiter: isRecruiter(person) };
  }
  async saveProfile(person: Principal, input: Row) {
    fields(input, ["name", "email", "location", "target", "consent", "version"]);
    if (input.consent !== true) throw bad("Confirm that the Academy may store your jobs profile.");
    const email = string(input.email, "contact email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Enter a valid contact email.");
    await this.db.write("jobprofile", owner(person), this.values({ name: string(input.name, "name"), email, location: string(input.location, "location", 100, false),
      target: string(input.target, "target role", 100, false), consent: "jobs-profile-v1", consenton: new Date().toISOString() }), input.version == null ? null : version(input.version));
  }
  private async createOnce(table: Table, id: string, data: Row) {
    try { await this.db.write(table, id, data, null); }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409 || !await this.db.get(table, id, [])) throw error;
    }
  }
  async track(person: Principal, input: Row, entryId?: string) {
    const id = owner(person);
    fields(input, ["title", "company", "source", "stage", "nextAction", "followUp", entryId ? "version" : "requestId"]);
    const values = this.values({ name: string(input.title, "role"), employer: string(input.company, "employer"), source: string(input.source, "source"),
      stage: stage(input.stage, trackerStages), nextaction: string(input.nextAction, "next action", 100, false), followup: day(input.followUp) });
    if (entryId) {
      const row = await this.db.get("jobentry", guid(entryId), [this.db.lookup("candidate"), this.db.lookup("vacancy")]);
      if (!row || row[this.db.lookup("candidate")] !== id || row[this.db.lookup("vacancy")]) throw missing();
      await this.db.write("jobentry", guid(entryId), values, version(input.version));
      return;
    }
    if (!await this.db.get("jobprofile", id, [])) throw requiredProfile();
    await this.createOnce("jobentry", stableId("tracker", id, guid(input.requestId)), { ...values, ...await this.db.bind("candidate", "jobprofile", id) });
  }
  async apply(person: Principal, vacancyId: string, input: Row) {
    fields(input, ["share"]);
    if (input.share !== true) throw bad("Confirm sharing your name and contact email for this vacancy.");
    const candidate = owner(person);
    const vid = guid(vacancyId);
    const id = stableId("application", candidate, vid);
    if (await this.db.get("jobentry", id, [])) return;
    const [profile, vacancy] = await Promise.all([this.db.get("jobprofile", candidate, this.cols(profileFields)), this.db.get("jobvacancy", vid, this.cols(vacancyFields))]);
    if (!profile) throw requiredProfile();
    if (!vacancy || vacancy[this.db.col("open")] !== true) throw new HttpError(409, "This vacancy is closed.");
    const data = { ...this.values({ name: this.text(vacancy, "name"), employer: this.text(vacancy, "employer"), source: "Academy", stage: "Applied",
      applicant: this.text(profile, "name"), contactemail: this.text(profile, "email") }), ...await this.db.bind("candidate", "jobprofile", candidate), ...await this.db.bind("vacancy", "jobvacancy", vid) };
    try { await this.db.submit(vid, version(vacancy["@odata.etag"]), id, data); }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409 || !await this.db.get("jobentry", id, [])) throw error;
    }
  }
  async recruitment() {
    const [vacancies, entries] = await Promise.all([
      this.db.list("jobvacancy", this.cols(vacancyFields), "", 200),
      this.db.list("jobentry", [...this.entryCols(), ...this.cols(["applicant", "contactemail"])], this.db.lookup("vacancy") + " ne null", 200)
    ]);
    return { vacancies: vacancies.map(v => this.vacancy(v)), submissions: entries.map(e => ({ ...this.entry(e), applicant: this.text(e, "applicant"), email: this.text(e, "contactemail") })) };
  }
  async publish(person: Principal, input: Row) {
    fields(input, ["requestId", "title", "company", "location", "summary"]);
    await this.createOnce("jobvacancy", stableId("vacancy", owner(person), guid(input.requestId)), this.values({
      name: string(input.title, "job title"), employer: string(input.company, "employer"), location: string(input.location, "location"), summary: string(input.summary, "description", 1000), open: true }));
  }
  async close(id: string, input: Row) {
    fields(input, ["version"]);
    await this.db.write("jobvacancy", guid(id), this.values({ open: false }), version(input.version));
  }
  async review(id: string, input: Row) {
    fields(input, ["stage", "version"]);
    const row = await this.db.get("jobentry", guid(id), [this.db.lookup("vacancy")]);
    if (!row || !row[this.db.lookup("vacancy")]) throw missing();
    await this.db.write("jobentry", guid(id), this.values({ stage: stage(input.stage, reviewStages) }), version(input.version));
  }
}
