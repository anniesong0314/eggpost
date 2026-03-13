// api/generate.js — Vercel serverless function

const PLATFORM_GUIDE = {
  naver:     '네이버 블로그: 500~1500자, 소제목 선택적으로 사용, 번호 목록 형식 자연스럽게 활용, 검색 친화적',
  linkedin:  '링크드인: 400~800자, 핵심 인사이트 중심, 빈 줄로 호흡, 첫 문장이 전부',
  youtube:   '유튜브 커뮤니티: 200~400자, 영상 티저 느낌, 궁금증 유발, 이모지 1~2개',
  instagram: '인스타그램: 100~250자 본문 + 해시태그 8~12개, 줄바꿈으로 리듬감',
  x:         'X(트위터): 140자 이내, 핵심 하나, 해시태그 1~2개',
};

const TONE_GUIDE = {
  warm:         '따뜻하고 감성적: 독자의 마음을 울리는 표현, 공감 유도, 부드러운 어조',
  professional: '전문적·인사이트: 명확한 논점, 경험 기반, 신뢰감 있는 어조',
  story:        '이야기체·일상: 마치 친구에게 말하듯, 에피소드 구조, 자연스러운 구어체',
  impact:       '짧고 임팩트: 핵심만, 강한 첫 문장과 마지막 문장',
};

const STYLE_GUIDE = `
[글쓰기 스타일 참고]
- 번호 목록(1. 2. 3.)으로 생각을 전개할 때가 많음
- 문장이 짧고 직관적. 불필요한 수식어 없음
- ~것 같다, ~않을까, ~할 것, ~있을 것 같다 등으로 마무리
- 구어체에 가까우면서도 전문적
- 괄호로 부연 설명 (예: 이런 뜻임)
- 과한 감탄이나 칭찬 없이 담백하게
- AI가 쓴 느낌 나는 표현(~드립니다, ~하세요, ~입니다) 절대 금지
`;

const REFINE_MAP = {
  emotional:         '전체적으로 더 감성적이고 공감 가는 표현으로 바꿔줘',
  shorter:           '핵심만 남기고 30% 이상 짧게 줄여줘',
  longer:            '구체적인 묘사와 에피소드 추가해서 더 풍성하게 늘려줘',
  friendly:          '더 친근하고 편한 말투로 바꿔줘',
  hook:              '도입부를 더 강렬하게 바꿔줘. 첫 문장에서 멈추게',
  'hashtag-add':     '현재 글에 어울리는 해시태그를 추가해줘',
  'hashtag-replace': '기존 해시태그를 제거하고 더 효과적인 것으로 교체해줘',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { mode, memo, platform, tone, images = [], current, refinements = [], customInstruction } = req.body;

  let systemPrompt = '';
  let userContent = [];

  if (mode === 'refine') {
    const instrList = [
      ...refinements.map(r => REFINE_MAP[r] || r),
      ...(customInstruction ? [customInstruction] : []),
    ].join('\n- ');

    systemPrompt = `너는 SNS 글쓰기 전문가야. 주어진 글을 아래 지시에 따라 수정해줘.
플랫폼: ${PLATFORM_GUIDE[platform] || platform}
톤: ${TONE_GUIDE[tone] || tone}
${STYLE_GUIDE}
수정 지시:
- ${instrList}

수정된 글만 출력해. 설명, 인사말, 따옴표 없이.`;
    userContent = [{ type: 'text', text: `다음 글을 수정해줘:\n\n${current}` }];

  } else {
    systemPrompt = `너는 SNS 글쓰기 전문가야. 사용자의 메모를 바탕으로 SNS 글을 작성해줘.
플랫폼: ${PLATFORM_GUIDE[platform] || platform}
톤: ${TONE_GUIDE[tone] || tone}
${STYLE_GUIDE}
완성된 SNS 글만 출력해. 설명, 인사말, 따옴표 없이.`;

    images.forEach(dataUrl => {
      const [header, data] = dataUrl.split(',');
      const mediaType = header.match(/:(.*?);/)[1];
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
    });
    userContent.push({ type: 'text', text: `메모:\n${memo}` });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    return res.status(200).json({ text: data.content?.[0]?.text || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
