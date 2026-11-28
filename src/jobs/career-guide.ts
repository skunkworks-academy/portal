export const careerExercises = {
  "Tailor my CV": "Pick one requirement from the vacancy. Draft a bullet naming what you did, which skill you used and the outcome. Use a number only when you can substantiate it.",
  "Practise an interview": "Think of a time you solved a difficult problem. What was the situation, what were you responsible for, what did you do and what changed? Practise your answer aloud in under two minutes.",
  "Plan a follow-up": "Check the employer's timeline. In My tracker, record the agreed date and next action. Draft a short note naming the role, thanking the contact and asking about the next step."
};

export function careerGuideReply(question: string): string {
  const text = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(cv|resume|cover letter|experience bullet)\b/.test(text)) return careerExercises["Tailor my CV"];
  if (/\b(interview|star method|behavioural|behavioral)\b/.test(text)) return careerExercises["Practise an interview"];
  if (/follow[ -]?up|hear back|heard back|thank.you/.test(text)) return careerExercises["Plan a follow-up"];
  if (/\b(salary|pay|benchmark|compensation|negotiat\w*)\b/.test(text)) return "Compare vacancies with similar duties, seniority and location. Record the currency, pay period, base pay and benefits separately. Open Career tools and pay research for Payscale resources.";
  if (/\b(apply|applying|application|track\w*|status|stage)\b/.test(text)) return "Visit Vacancies to apply for an Academy role. Review the details and confirm which contact information you will share. My tracker shows your application stage. For other employers, apply on their site and add a private tracker entry here.";
  if (/\b(job|jobs|find|search|vacanc\w*|opportunit\w*)\b/.test(text)) return "Start with Vacancies for roles published by Academy recruitment. Open the jobs directory to explore external opportunities and save the ones you want to follow up in My tracker.";
  return "Which part of your search would you like to work on? I can guide you through finding a vacancy, applying, tailoring your CV, preparing for an interview, comparing pay or following up.";
}
