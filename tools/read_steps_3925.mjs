import fs from 'fs';
const transcript = fs.readFileSync('C:/Users/cinnamley123g_local/.gemini/antigravity/brain/461f25c5-6980-48e3-808e-a9fa99b27701/.system_generated/logs/transcript.jsonl', 'utf8');
const lines = transcript.split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if (d.step_index >= 3924 && d.step_index <= 4377) {
    if (d.type === 'PLANNER_RESPONSE' && d.content && d.content.length > 50) {
      console.log(`Step ${d.step_index} [${d.type}]: ${d.content.substring(0, 300)}`);
    }
  }
}
