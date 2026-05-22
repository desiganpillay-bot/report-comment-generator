export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://magic.myreportcomments.com',
  'https://myreportcomments.com',
  'https://www.myreportcomments.com',
];

const TONE_INSTRUCTIONS = {
  s: 'Professional and clear — but you sound like a person, not a document.',
  w: 'Warm and personal. Your knowledge of the learner comes through.',
  f: 'Measured and objective, suitable for official records. Still a human voice.',
};
const TERM_LABELS = { t1: 'Term 1', t2: 'Term 2', t3: 'Term 3', t4: 'Term 4' };
const RATING_LABELS = { good: 'excelled', fair: 'satisfactory', improve: 'needs improvement' };
const PRONOUN_MAP = { he: 'he/him/his', she: 'she/her/hers', they: 'they/them/their' };

function buildPrompt({ name, pronouns, grade, curriculum, term, language, tone,
                       subject, mark, topics, notes, wordTarget }) {
  const lang      = language === 'af' ? 'Afrikaans' : 'English';
  const termLabel = TERM_LABELS[term] || 'Term 1';

  const lines = [
    `Write subject commentary in ${lang} for ${name} (${PRONOUN_MAP[pronouns] || 'he/him/his'}).`,
    `Subject: ${subject} | Grade: ${grade} | ${curriculum || 'CAPS'} | ${termLabel}`,
    mark ? `Overall mark: ${mark}%` : '',
    '',
  ].filter(Boolean);

  if (topics && topics.length > 0) {
    lines.push('Topic performance:');
    topics.forEach(t => lines.push(`- ${t.name}: ${RATING_LABELS[t.rating] || t.rating}`));
  }

  if (notes && notes.trim()) {
    lines.push('');
    lines.push(`Teacher's notes: ${notes.trim()}`);
  }

  lines.push('');
  lines.push(`Tone: ${TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.s}`);
  lines.push(`Target: approximately ${wordTarget || 80} words. One paragraph.`);
  lines.push('Write the commentary now. Sound like yourself — a real teacher who taught this subject this term.');

  return lines.join('\n');
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = `You are a South African school teacher writing subject-specific end-of-term commentary. You taught this learner this term — you know the topics you covered, how they engaged in class, where they struggled, what they grasped.

How you write:
- First person: I, my, me. Contractions where natural — it's, he's, she's, I've, that's, doesn't, isn't, they've, couldn't.
- Vary sentence lengths. Short sentences can say more than long ones. Don't make them all the same.
- Name the actual CAPS topics and skills you covered — specific, not vague. "Algebra and linear equations" not "mathematical concepts". "The Water Cycle and weather patterns" not "Life Sciences content".
- Be direct about areas needing improvement — specific language, not hedged generalisations.
- Do not open with the learner's name as the subject of your first sentence.
- Do not start consecutive sentences with the same word.
- Shape comments differently — don't always lead strength-then-weakness, don't always close with a motivational line.
- No parenthetical asides. No semicolons.

Words and phrases you never write: demonstrates, exhibits, showcases, commendable, remarkable, impressive strides, significant progress, it is evident, it is clear, a pleasure to teach, diligent, consistently demonstrates, shows great potential, is to be commended, thrives, blossoms, notable, navigates challenges, goes above and beyond, takes ownership, well-rounded.

Output only the commentary text. No labels. No preamble. No quotation marks.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 1,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildPrompt(body) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'Generation failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const comment = data.content?.[0]?.text?.trim() || '';
    return new Response(JSON.stringify({ comment }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
