insert into public.lessons (id, title, description, cefr_level, topic, content_key, estimated_minutes, sort_order)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Coffee and greetings',
    'Learn how to order politely and greet people in a cafe.',
    'A1',
    'Greetings and ordering',
    'greetings-cafe',
    10,
    1
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Accusative basics',
    'Practice the accusative case with common objects and articles.',
    'A1',
    'Grammar: accusative articles',
    'accusative-basics',
    12,
    2
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Shopping dialogue',
    'Listen to a short exchange and answer comprehension questions.',
    'A1',
    'Listening: shopping dialogue',
    'shopping-dialogue',
    10,
    3
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Daily routines',
    'Practice time expressions and simple present-tense sentences.',
    'A1',
    'Vocabulary: daily routines',
    'daily-routines',
    10,
    4
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Family and introductions',
    'Talk about family members and introduce yourself with confidence.',
    'A1',
    'Speaking: introductions',
    'family-introductions',
    11,
    5
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'Restaurant orders',
    'Read and respond to a short ordering conversation in a restaurant.',
    'A2',
    'Listening: restaurant orders',
    'restaurant-orders',
    12,
    6
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    'Basic word order',
    'Build short German sentences with the correct word order.',
    'A2',
    'Grammar: sentence order',
    'word-order-basics',
    12,
    7
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    'Numbers and time',
    'Count, give prices, and tell the time with confidence.',
    'A1',
    'Vocabulary: numbers and time',
    'numbers-and-time',
    11,
    8
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    'Weather and small talk',
    'Talk about the weather and react naturally in casual conversation.',
    'A1',
    'Speaking: small talk',
    'weather-and-small-talk',
    10,
    9
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Asking for directions',
    'Ask where something is and follow simple directions around town.',
    'A2',
    'Speaking: directions',
    'asking-for-directions',
    12,
    10
  )
on conflict (id) do update set
  content_key = excluded.content_key;
