export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://magic.myreportcomments.com',
  'https://myreportcomments.com',
  'https://www.myreportcomments.com',
];

const TONE_INSTRUCTIONS = {
  s: 'Write in a clear, professional but approachable tone.',
  w: 'Write in a warm, enthusiastic, personal tone — let your genuine care for the pupil come through.',
  f: 'Write in a measured, objective, formal tone suitable for official school records.',
};
const TERM_LABELS = { t1: 'Term 1', t2: 'Term 2', t3: 'Term 3', t4: 'Term 4' };
const RATING_LABELS = { good: 'Excelled', fair: 'Satisfactory', improve: 'Needs improvement' };
const PRONOUN_MAP = { he: 'he/him/his', she: 'she/her/hers', they: 'they/them/their' };

function buildPrompt({ name, pronouns, grade, curriculum, term, language, tone,
                       subject, mark, topics, notes, wordTarget }) {
  const lang = language === 'af' ? 'Afrikaans' : 'English';
  const termLabel = TERM_LABELS[term] || 'Term 1';

  const lines = [
    `Write ${TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.s}`,
    `Write subject commentary in ${lang} for ${name} (pronouns: ${PRONOUN_MAP[pronouns] || 'he/him/his'}).`,
    '',
    `Subject: ${subject}`,
    `Grade: ${grade} | Curriculum: ${curriculum || 'CAPS'} | Term: ${termLabel}`,
    mark ? `Overall mark: ${mark}%` : '',
    '',
  ].filter(l => l !== null);

  if (topics && topics.length > 0) {
    lines.push('Topic performance:');
    topics.forEach(t => {
      lines.push(`- ${t.name}: ${RATING_LABELS[t.rating] || t.rating}`);
    });
  }

  if (notes && notes.trim()) {
    lines.push('');
    lines.push(`Additional context: ${notes.trim()}`);
  }

  lines.push('');
  lines.push(`Word target: approximately ${wordTarget || 80} words.`);
  lines.push('Write one paragraph. Reference specific topics and curriculum content by name. Explain what the pupil understands well and what specifically needs work. Output only the paragraph text — no labels, no preamble.');

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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

  const systemPrompt = `You are an experienced South African teacher writing subject-specific report commentary. Write in first person (I/my/me). Reference specific curriculum topics and content by name — not vague generalisations. Be honest but constructive about areas needing improvement. Natural teacher voice throughout. No corporate language. Output only the commentary text.`;

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
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildPrompt(body) }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', response.status, err);
      return new Response(JSON.stringify({ error: 'Generation failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const comment = data.content?.[0]?.text?.trim() || '';
    return new Response(JSON.stringify({ comment }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
