import {describe,it,expect} from "vitest";
import {beginnerAwardSvg,requireBeginnerCode,type BeginnerAward} from "./enrolmentService.js";

const fixture:BeginnerAward={
 version:1, certificateId:"SKW-12345678-1234-4234-8234-123456789ABC",
 courseId:"SKW-BEG-AI-101",learnerName:"Sam <Learner> & Co",
 issuedAt:"2026-10-17T19:00:00.000Z",knowledgeCorrect:11,capstoneScore:85,
 criticalSafetyPassed:true,approvedBy:"reviewer@example.invalid"
};
describe("Academy verified completion award",()=>{
 it("accepts only approved beginner course identifiers",()=>{
  expect(requireBeginnerCode("skw-beg-ai-101")).toBe("SKW-BEG-AI-101");
  expect(()=>requireBeginnerCode("FAKE-COURSE")).toThrow();
 });
 it("creates a self-contained branded certificate signed with the authorised signatory name",()=>{
  const svg=beginnerAwardSvg(fixture,"certificate");
  expect(svg).toContain("data:image/png;base64");
  expect(svg).toContain("SKUNKWORKS");
  expect(svg).toContain("Raydo Matthee");
  expect(svg).toContain("COURSE COMPLETION");
  expect(svg).toContain("Sam &lt;Learner&gt; &amp; Co");
  expect(svg).not.toContain("<Learner>");
  expect(svg).toContain(fixture.certificateId);
  expect(svg).toContain("/api/certificates/verify/");
 });
 it("creates a separate course-specific badge with the same credential id",()=>{
  const svg=beginnerAwardSvg(fixture,"badge");
  expect(svg).toContain(fixture.certificateId);
  expect(svg).toContain(fixture.courseId);
  expect(svg).toContain("VERIFIED");
  expect(svg).not.toContain(fixture.learnerName);
 });
});
