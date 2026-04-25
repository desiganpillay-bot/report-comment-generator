export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://magic.myreportcomments.com',
  'https://myreportcomments.com',
  'https://www.myreportcomments.com',
];

const TONE_LABELS = { s: 'standard', w: 'warm', f: 'formal' };
const TONE_INSTRUCTIONS = {
  s: 'Write in a clear, professional but approachable tone.',
  w: 'Write in an enthusiastic, personal, warm tone — use the pupil\'s name naturally and let your genuine care show.',
  f: 'Write in a measured, objective, formal tone suitable for official school records.',
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
  needs_development: 'needing development in peer relationships',
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

function buildPrompt({ grade, curriculum, term, language, tone, name, pronouns,
                       overall, potential, peers, behave, acad, badj, sport,
                       excelled, effort, wordTarget }) {
  const lang     = language === 'af' ? 'Afrikaans' : 'English';
  const termLabel = TERM_LABELS[term] || 'Term 1';
  const isT4     = term === 't4';
  const gradeNum = parseInt(grade);
  const nextGrade = isT4 && !isNaN(gradeNum) ? String(gradeNum + 1) : null;

  const lines = [
    `Write a ${TONE_LABELS[tone] || 'standard'} report comment in ${lang}.`,
    '',
    `Pupil: ${name} (pronouns: ${PRONOUN_MAP[pronouns] || 'he/him/his'})`,
    `Grade: ${grade} (${curriculum || 'CAPS'} curriculum)`,
    `Term: ${termLabel}`,
    `Word target: approximately ${wordTarget || 100} words`,
    '',
    'Performance indicators:',
  ];

  if (overall   && overall   !== 'omit') lines.push(`- Overall performance: ${OVERALL_LABELS[overall]   || overall}`);
  if (potential && potential !== 'omit') lines.push(`- Potential: ${POTENTIAL_LABELS[potential]          || potential}`);
  if (peers     && peers     !== 'omit') lines.push(`- Works with peers: ${PEERS_LABELS[peers]           || peers}`);
  if (behave    && behave    !== 'omit') lines.push(`- Behaviour: ${BEHAVE_LABELS[behave]                || behave}`);
  if (acad      && acad      !== 'omit' && acad !== 'none') lines.push(`- Academic support: ${acad}`);
  if (badj      && badj      !== 'omit' && badj !== 'none') lines.push(`- Behaviour support: ${badj}`);

  if (excelled && excelled.length > 0) {
    lines.push('');
    lines.push(`Subjects where ${name} excelled this term: ${excelled.join(', ')}`);
  }
  if (effort && effort.length > 0) {
    lines.push(`Subjects where ${name} needs more effort: ${effort.join(', ')}`);
  }
  if (sport && sport !== 'omit') {
    lines.push(`Co-curricular participation: ${SPORT_LABELS[sport] || sport}`);
  }
  if (isT4 && nextGrade) {
    lines.push('');
    lines.push(`${name} will be progressing to Grade ${nextGrade} next year — acknowledge this.`);
  }

  lines.push('');
  lines.push(TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.s);
  lines.push('Reference specific curriculum content for this grade where relevant — name actual topics, skills, or concepts a teacher at this level would mention.');
  lines.push('Write the comment now.');

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

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = `You are an experienced South African teacher writing end-of-term report comments. Write in first person (I/my/me). Use a natural, warm, personal teacher voice. Reference specific curriculum content appropriate to the grade and subject where relevant — for example, specific topics, skills, or concepts for that grade. Never use corporate language, passive constructions like "is to be commended", or vague filler phrases such as "social fabric", "contributes positively", "adequate", or "consistently high standard". Output only the comment text — no preamble, labels, or quotation marks.`;

  const userPrompt = buildPrompt(body);

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
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'Generation failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const comment = data.content?.[0]?.text?.trim() || '';

    return new Response(JSON.stringify({ comment }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
