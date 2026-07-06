const stringifyContentPart = (part: any): string => {
  if (!part) return '';
  if (typeof part === 'string') return part;
  if (typeof part.text === 'string') return part.text;
  if (typeof part.content === 'string') return part.content;
  if (typeof part.value === 'string') return part.value;
  if (Array.isArray(part.text)) return part.text.map(stringifyContentPart).filter(Boolean).join('\n');
  if (Array.isArray(part.content)) return part.content.map(stringifyContentPart).filter(Boolean).join('\n');
  return '';
};

export function extractAiText(data: any): string {
  const candidates = [
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.text,
    data?.choices?.[0]?.delta?.content,
    data?.message?.content,
    data?.message,
    data?.content,
    data?.text,
    data?.reply,
    data?.response,
    data?.output_text,
    data?.data?.choices?.[0]?.message?.content,
    data?.data?.text,
    data?.data?.content,
  ];

  for (const candidate of candidates) {
    const text = stringifyContentPart(candidate).trim();
    if (text) return text;
  }

  if (Array.isArray(data?.output)) {
    const text = data.output.map((item: any) => stringifyContentPart(item?.content || item?.text || item)).filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  if (Array.isArray(data?.choices?.[0]?.message?.content)) {
    const text = data.choices[0].message.content.map(stringifyContentPart).filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  return '';
}

export function compactJsonPreview(data: any, maxLength = 500): string {
  try {
    return JSON.stringify(data).slice(0, maxLength);
  } catch {
    return String(data || '').slice(0, maxLength);
  }
}
