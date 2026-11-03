import fs from 'fs';
const transcript = fs.readFileSync('C:/Users/cinnamley123g_local/.gemini/antigravity/brain/461f25c5-6980-48e3-808e-a9fa99b27701/.system_generated/logs/transcript.jsonl', 'utf8');
const lines = transcript.split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if (d.step_index === 4377) {
    console.log(d.content);
  }
}
