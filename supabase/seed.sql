insert into public.lessons (id, title, description, cefr_level, topic, estimated_minutes, sort_order)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Coffee and greetings',
    'Learn how to order politely and greet people in a cafe.',
    'A1',
    'Greetings and ordering',
    10,
    1
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Accusative basics',
    'Practice the accusative case with common objects and articles.',
    'A1',
    'Grammar: accusative articles',
    12,
    2
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Shopping dialogue',
    'Listen to a short exchange and answer comprehension questions.',
    'A1',
    'Listening: shopping dialogue',
    10,
    3
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Daily routines',
    'Practice time expressions and simple present-tense sentences.',
    'A1',
    'Vocabulary: daily routines',
    10,
    4
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Family and introductions',
    'Talk about family members and introduce yourself with confidence.',
    'A1',
    'Speaking: introductions',
    11,
    5
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'Restaurant orders',
    'Read and respond to a short ordering conversation in a restaurant.',
    'A2',
    'Listening: restaurant orders',
    12,
    6
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    'Basic word order',
    'Build short German sentences with the correct word order.',
    'A2',
    'Grammar: sentence order',
    12,
    7
  )
on conflict (id) do nothing;
