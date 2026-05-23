export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://magic.myreportcomments.com',
  'https://myreportcomments.com',
  'https://www.myreportcomments.com',
];

const TONE_LABELS = { s: 'standard', w: 'warm', f: 'formal' };
const TONE_INSTRUCTIONS = {
  s: 'Professional and clear — but you sound like a person, not a document.',
  w: 'Warm and personal. You know this learner well and it shows. Genuine care, not performance.',
  f: 'Measured and objective, as suits an official school record. Still a human voice — not a HR template.',
};
const TERM_LABELS = { t1: 'Term 1', t2: 'Term 2', t3: 'Term 3', t4: 'Term 4' };
const OVERALL_LABELS = {
  excellent: 'excellent',
  satisfactory: 'satisfactory',
  needs_improvement: 'needing improvement',
};
const POTENTIAL_LABELS = {
  consistently: 'consistently reaching their potential',
  sometimes: 'sometimes reaching their potential',
  not_yet: 'not yet consistently reaching their potential',
};
const PEERS_LABELS = {
  very_well: 'very well',
  adequately: 'adequately',
  needs_development: 'needs development in peer relationships',
};
const BEHAVE_LABELS = {
  excellent: 'excellent',
  generally_good: 'generally good',
  needs_improvement: 'needing improvement',
};
const SPORT_LABELS = {
  outstanding: 'outstanding',
  good: 'good',
  developing: 'developing',
};
const PRONOUN_MAP = {
  he:   'he/him/his',
  she:  'she/her/hers',
  they: 'they/them/their',
};

const OPENER_STYLES = [
  'Open with a specific observation about this learner\'s relationship to the work this term.',
  'Open mid-thought — as if picking up a conversation about this learner you\'ve been having.',
  'Open with what this term revealed about this learner, not what they achieved.',
  'Open with their approach or attitude first, before any result.',
  'Open with a subject, skill, or moment that defined their term.',
  'Open with what stands out most — the thing you\'d say first in a parent meeting.',
  'Open with an honest tension — something that is both true and complicated about this learner.',
  'Open with what you noticed about how they think or work, not what grade they got.',
];

function buildPrompt({ grade, curriculum, term, language, tone, name, pronouns,
                       overall, potential, peers, behave, acad, badj, sport,
                       excelled, effort, wordTarget }) {
  const lang      = language === 'af' ? 'Afrikaans' : 'English';
  const termLabel = TERM_LABELS[term] || 'Term 1';
  const isT4      = term === 't4';
  const gradeNum  = parseInt(grade);
  const nextGrade = isT4 && !isNaN(gradeNum) ? String(gradeNum + 1) : null;

  const lines = [
    `Write a ${TONE_LABELS[tone] || 'standard'} end-of-term report comment in ${lang}.`,
    `Learner: ${name} | Pronouns: ${PRONOUN_MAP[pronouns] || 'he/him/his'} | Grade: ${grade} | ${curriculum || 'CAPS'} | ${termLabel}`,
    `Target: approximately ${wordTarget || 100} words`,
    '',
  ];

  // Narrative context block — narrative input produces narrative output
  const ctxParts = [];
  if (overall   && overall   !== 'omit') ctxParts.push(`overall performance: ${OVERALL_LABELS[overall]   || overall}`);
  if (potential && potential !== 'omit') ctxParts.push(`potential: ${POTENTIAL_LABELS[potential]          || potential}`);
  if (peers     && peers     !== 'omit') ctxParts.push(`peer relationships: ${PEERS_LABELS[peers]         || peers}`);
  if (behave    && behave    !== 'omit') ctxParts.push(`behaviour: ${BEHAVE_LABELS[behave]                || behave}`);
  if (ctxParts.length > 0) lines.push(`Learner profile this term — ${ctxParts.join(', ')}.`);

  if (acad && acad !== 'omit' && acad !== 'none') lines.push(`Academic support context: ${acad}`);
  if (badj && badj !== 'omit' && badj !== 'none') lines.push(`Behaviour support context: ${badj}`);
  if (excelled && excelled.length > 0) lines.push(`Subjects ${name} excelled in this term: ${excelled.join(', ')}`);
  if (effort   && effort.length   > 0) lines.push(`Subjects needing more effort: ${effort.join(', ')}`);
  if (sport && sport !== 'omit')       lines.push(`Co-curricular participation: ${SPORT_LABELS[sport] || sport}`);
  if (isT4 && nextGrade)               lines.push(`${name} progresses to Grade ${nextGrade} next year — include a brief acknowledgement.`);

  const openerStyle = OPENER_STYLES[Math.floor(Math.random() * OPENER_STYLES.length)];
  lines.push('');
  lines.push(`Tone: ${TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.s}`);
  lines.push(`Opening instruction: ${openerStyle}`);
  lines.push('Write the comment now. Sound like yourself — a real teacher who knows this learner.');

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

  const systemPrompt = `You are a South African school teacher with over a decade in the classroom. You're writing end-of-term report comments — not generating text, writing. You know each learner personally. You've watched them think, struggle, and get things right. Your voice is your own.

How you write:
- First person throughout: I, my, me. Use contractions where they fit naturally — it's, he's, she's, I've, I'm, that's, doesn't, isn't, couldn't, they've, we've.
- Vary your sentence lengths deliberately. Short sentences carry weight. Longer ones build detail and context. Never a paragraph of same-length sentences.
- Do not open with the learner's name as the grammatical subject of your first sentence. Do not begin with "Throughout Term" or "This term" as a filler opener.
- Do not start consecutive sentences with the same word. Do not repeat "He"/"She" at the start of every sentence.
- Name actual CAPS curriculum topics, skills, and concepts — specific, not vague. A reader should be able to tell the grade and subject from the comment alone without being told.
- Shape each comment differently. Some lead with strength, one honest note at the end. Some open mid-thought. Some end on a forward observation rather than a motivational closer. Not every comment needs a "looking forward to next term" sign-off.
- When something needs improvement, name it plainly with specific language — don't soften it into nothing with hedging phrases.
- No parenthetical asides. No semicolons. No over-punctuated sentences.

Words and phrases you never write: demonstrates, exhibits, showcases, commendable, remarkable, impressive strides, significant progress, it is evident, it is clear, a pleasure to teach, diligent, consistently demonstrates, shows great potential, is to be commended, blossoms, thrives, notable, leverages, navigates challenges, socially adept, positive contribution, overall well-being, well-rounded, goes above and beyond, takes ownership, in conclusion, in summary.

Output only the comment text. No preamble. No labels. No quotation marks.`;

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
        max_tokens: 400,
        temperature: 1,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildPrompt(body) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
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
